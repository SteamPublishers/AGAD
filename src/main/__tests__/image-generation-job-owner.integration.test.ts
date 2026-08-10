/**
 * User journeys through the main-owned image job boundary. The service and its
 * observer lifecycle are production code; only the native image runtime is a
 * controlled boundary so navigation, cancellation, and failure remain deterministic.
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import {
  ImageGenerationJobService,
  type ImageGenerationJobRequest,
  type ImageGenerationRuntime
} from '../imagegen/job-service'
import type { ImageGenerationProgressContract } from '../../shared/image-generation-contract'
import type { GeneratedImageScope, ImageGenOutput } from '../imagegen'

/**
 * A real file on disk for the runtime to claim it produced.
 *
 * On success the service stats the output and publishes it as a shared file, so that other devices can
 * receive the generated image - it needs the real byte size, and it reads it from the file. A fictional
 * path makes that stat throw ENOENT and the whole generation rejects, which reads as "generating an
 * image is broken" when the only thing missing was the file.
 *
 * Disk is a boundary this test can afford to keep real, so it does.
 */
const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'offgrid-image-job-'))
const generatedFile = (name: string): string => {
  const filePath = path.join(workspace, name)
  fs.writeFileSync(filePath, Buffer.from('89504e470d0a1a0a', 'hex')) // PNG signature; size is what is read
  return filePath
}
afterAll(() => fs.rmSync(workspace, { recursive: true, force: true }))

interface ControlledGeneration {
  progress(progress: ImageGenerationProgressContract): void
  succeed(output: ImageGenOutput): void
  fail(error: unknown): void
}

function controlledRuntime(cancelResult = true, saveScopeError?: Error): {
  runtime: ImageGenerationRuntime
  generation(): ControlledGeneration
  savedScopes: { path: string; scope: GeneratedImageScope }[]
} {
  let resolveGeneration: ((output: ImageGenOutput) => void) | null = null
  let rejectGeneration: ((error: unknown) => void) | null = null
  let reportProgress: ((progress: ImageGenerationProgressContract) => void) | null = null
  const savedScopes: { path: string; scope: GeneratedImageScope }[] = []

  return {
    runtime: {
      generate: (_request, onProgress) => {
        reportProgress = onProgress
        return new Promise<ImageGenOutput>((resolve, reject) => {
          resolveGeneration = resolve
          rejectGeneration = reject
        })
      },
      cancel: () => cancelResult,
      saveScope: (path, scope) => {
        if (saveScopeError) throw saveScopeError
        savedScopes.push({ path, scope })
      }
    },
    generation: () => ({
      progress: (progress) => reportProgress?.(progress),
      succeed: (output) => resolveGeneration?.(output),
      fail: (error) => rejectGeneration?.(error)
    }),
    savedScopes
  }
}

const request: ImageGenerationJobRequest = {
  prompt: 'A green cabin rendered while navigating',
  model: 'local-image-model',
  conversationId: 'conversation-navigation',
  projectId: 'project-navigation',
  seed: 91,
  width: 512,
  height: 512,
  steps: 4
}

describe('main-owned image generation job journeys', () => {
  it('keeps one job observable while the user navigates away and returns', async () => {
    const boundary = controlledRuntime()
    const jobs = new ImageGenerationJobService(boundary.runtime)
    const firstScreen: string[] = []
    const returnedScreen: string[] = []
    const detachFirst = jobs.onChange((job) => firstScreen.push(job.phase))

    const generation = jobs.start(request)
    expect(jobs.status()).toMatchObject({
      phase: 'running',
      conversationId: request.conversationId,
      projectId: request.projectId
    })
    await expect(jobs.start(request)).rejects.toThrow('already generating')

    boundary.generation().progress({ step: 2, total: 4, secPerStep: 0.5, phase: 'sampling' })
    const progress = jobs.status().progress
    expect(progress).toEqual({ step: 2, total: 4, secPerStep: 0.5, phase: 'sampling' })
    if (progress) progress.step = 99
    expect(jobs.status().progress?.step).toBe(2)

    detachFirst()
    const detachReturned = jobs.onChange((job) => returnedScreen.push(job.phase))
    const output: ImageGenOutput = {
      dataUrl: 'data:image/png;base64,aW1hZ2U=',
      path: generatedFile('image.png'),
      seed: 91,
      model: 'Local image model'
    }
    boundary.generation().succeed(output)
    await expect(generation).resolves.toEqual({ ...output, syncId: jobs.status().id })

    expect(firstScreen).not.toContain('succeeded')
    expect(returnedScreen).toContain('succeeded')
    expect(jobs.status()).toMatchObject({
      phase: 'succeeded',
      outputPath: output.path,
      progress: null,
      error: null
    })
    expect(boundary.savedScopes).toEqual([
      {
        path: output.path,
        scope: {
          syncId: jobs.status().id,
          conversationId: request.conversationId,
          projectId: request.projectId
        }
      }
    ])

    const refreshed: string[] = []
    jobs.onConversationUpdated(() => {
      throw new Error('closed renderer')
    })
    const detachRefresh = jobs.onConversationUpdated((conversationId) =>
      refreshed.push(conversationId)
    )
    expect(jobs.acknowledgeConversation('another-conversation')).toBe(false)
    expect(jobs.acknowledgeConversation(request.conversationId!)).toBe(true)
    expect(refreshed).toEqual([request.conversationId])
    detachRefresh()
    detachReturned()
  })

  it('cancels the active native run and reports a stable cancelled result', async () => {
    const boundary = controlledRuntime()
    const jobs = new ImageGenerationJobService(boundary.runtime)
    const phases: string[] = []
    jobs.onChange((job) => phases.push(job.phase))
    const generation = jobs.start({ prompt: 'Cancel this image' })

    boundary.generation().progress({ step: 1, total: 4, secPerStep: 0.5 })
    expect(jobs.cancel()).toBe(true)
    expect(jobs.cancel()).toBe(false)
    boundary.generation().progress({ step: 3, total: 4, secPerStep: 0.5 })
    expect(jobs.status().progress).toBeNull()
    boundary.generation().fail(new Error('Native generation cancelled'))
    await expect(generation).rejects.toThrow('cancelled')
    expect(jobs.status()).toMatchObject({
      phase: 'cancelled',
      error: 'Native generation cancelled'
    })
    expect(phases.filter((phase) => phase === 'cancelled')).toHaveLength(2)
    expect(jobs.acknowledgeConversation('conversation-navigation')).toBe(false)
  })

  it('surfaces a native failure and stays usable when observers close abruptly', async () => {
    const boundary = controlledRuntime(false)
    const jobs = new ImageGenerationJobService(boundary.runtime)
    jobs.onChange(() => {
      throw 'renderer closed'
    })
    const generation = jobs.start({ prompt: 'A failing image' })

    expect(jobs.cancel()).toBe(false)
    boundary.generation().progress({ step: 1, total: 4, secPerStep: 0.5 })
    boundary.generation().fail('native runtime unavailable')
    await expect(generation).rejects.toBe('native runtime unavailable')
    expect(jobs.status()).toMatchObject({
      phase: 'failed',
      error: 'native runtime unavailable',
      progress: null,
      conversationId: null,
      projectId: null
    })
  })

  it('keeps a generated image successful when scope metadata cannot be saved', async () => {
    const boundary = controlledRuntime(true, new Error('scope database unavailable'))
    const jobs = new ImageGenerationJobService(boundary.runtime)
    const generation = jobs.start(request)
    const output: ImageGenOutput = {
      dataUrl: 'data:image/png;base64,aW1hZ2U=',
      path: generatedFile('image-without-scope.png'),
      seed: 91,
      model: 'Local image model'
    }

    boundary.generation().succeed(output)

    await expect(generation).resolves.toEqual({ ...output, syncId: jobs.status().id })
    expect(jobs.status()).toMatchObject({
      phase: 'succeeded',
      outputPath: output.path,
      progress: null,
      error: null
    })
    expect(boundary.savedScopes).toEqual([])
  })

  it('completes an unscoped native result without writing metadata', async () => {
    const boundary = controlledRuntime()
    const jobs = new ImageGenerationJobService(boundary.runtime)
    const generation = jobs.start({ prompt: 'An unscoped image' })
    const output: ImageGenOutput = {
      dataUrl: 'data:image/png;base64,aW1hZ2U=',
      path: '',
      seed: -1,
      model: 'Local image model'
    }

    boundary.generation().succeed(output)
    await expect(generation).resolves.toEqual({ ...output, syncId: jobs.status().id })
    expect(jobs.status()).toMatchObject({ phase: 'succeeded', outputPath: '' })
    expect(boundary.savedScopes).toEqual([])
  })
})
