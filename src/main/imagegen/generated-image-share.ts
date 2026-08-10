import { randomUUID } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { createSharedFileDescriptor } from '@offgrid/sync'
import type { SharedFileDescriptor } from '@offgrid/sync'
import { emitSharedFileMutation } from '../sync-shared-file'
import { readGeneratedImageSidecar, writeGeneratedImageSidecar } from './gallery-sidecar'

/**
 * Where a generated image is shown in the chat, when it is shown there as well as in the gallery.
 *
 * The same shape the phone uses (`ChatHome`), because it is the same fact. A synced message carries
 * no attachments of its own, so this is the only way the far side can put the image back under the
 * message that produced it.
 */
export interface ChatHome {
  conversationId: string
  messageId: string
}

/**
 * Describe a generated image for the mesh, from the sidecar that owns its facts.
 *
 * One builder, one description, both call sites: the image is described when it is made, and
 * described again when the chat has persisted the message it belongs under. Rebuilding from the
 * sidecar rather than from whatever the caller happens to hold is what stops the second description
 * from quietly dropping the width, the seed, or the time the first one carried.
 */
export function describeGeneratedImage(
  imagePath: string,
  shownIn?: ChatHome
): SharedFileDescriptor | null {
  const facts = readGeneratedImageSidecar(imagePath)
  if (!facts.syncId) return null
  const stat = fs.statSync(imagePath)
  return createSharedFileDescriptor({
    syncId: facts.syncId,
    kind: 'generated_media',
    name: path.basename(imagePath),
    mimeType: 'image/png',
    fileSize: stat.size,
    createdAt: facts.createdAt ?? new Date(stat.mtimeMs).toISOString(),
    ...(shownIn ? { messageId: shownIn.messageId } : {}),
    ...(shownIn?.conversationId ?? facts.conversationId
      ? { conversationId: shownIn?.conversationId ?? facts.conversationId }
      : {}),
    ...(facts.width === undefined ? {} : { width: facts.width }),
    ...(facts.height === undefined ? {} : { height: facts.height }),
    ...(facts.metadataJson === undefined ? {} : { metadataJson: facts.metadataJson })
  })
}

/** Offer a generated image to the mesh. Returns whether it could be described at all. */
export function shareGeneratedImage(imagePath: string, shownIn?: ChatHome): boolean {
  let descriptor: SharedFileDescriptor | null = null
  try {
    descriptor = describeGeneratedImage(imagePath, shownIn)
  } catch (error) {
    // A gallery entry can be deleted while this runs. Still said out loud: this also covers a file
    // that could not be read, which is worth knowing about.
    console.error(
      `[image-share] ${JSON.stringify({
        event: 'describe-threw',
        path: imagePath,
        error: error instanceof Error ? error.message : String(error)
      })}`
    )
    return false
  }
  if (!descriptor) {
    // Said out loud. Refusing in silence is indistinguishable from an image nobody generated, which
    // is exactly how a picture reached a phone's gallery and its chat drew a hole.
    console.error(`[image-share] ${JSON.stringify({ event: 'not-describable', path: imagePath })}`)
    return false
  }
  emitSharedFileMutation({ kind: 'put', filePath: imagePath, file: descriptor })
  return true
}

/**
 * Describe an image, giving it an identity first if it has never had one.
 *
 * For the images already on disk before the sidecar carried a syncId. The alternative - and what the
 * backfill used to do - is to mint a fresh id on the spot without writing it down, so the same
 * picture gets a different name on every scan and no peer can tell it from a new image. Assigning
 * once and recording it means the name survives.
 */
export function describeGeneratedImageEnsuringIdentity(
  imagePath: string
): SharedFileDescriptor | null {
  if (!readGeneratedImageSidecar(imagePath).syncId) {
    writeGeneratedImageSidecar(imagePath, { syncId: randomUUID() })
  }
  return describeGeneratedImage(imagePath)
}

/**
 * Record that a generated image hangs under a chat message, and offer it again.
 *
 * The message does not exist when the image is made - the chat persists it afterwards - so the link
 * cannot be part of the first description. Re-offering the SAME syncId through the same door updates
 * the record every device already holds and re-delivers it, which is what lets the far side move the
 * picture out of the gallery and under the message.
 */
export function noteGeneratedImageMessage(link: ChatHome & { imagePath: string }): boolean {
  writeGeneratedImageSidecar(link.imagePath, {
    conversationId: link.conversationId,
    messageId: link.messageId
  })
  return shareGeneratedImage(link.imagePath, {
    conversationId: link.conversationId,
    messageId: link.messageId
  })
}
