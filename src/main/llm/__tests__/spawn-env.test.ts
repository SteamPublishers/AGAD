import { describe, it, expect } from 'vitest'
import path from 'path'
import { engineSpawnEnv, VULKAN_DISABLE_BFLOAT16 } from '../spawn-env'

const BIN = '/opt/off-grid/bin/llama'

describe('engineSpawnEnv', () => {
  it('exports the exact variable name ggml-vulkan reads', () => {
    // Hardcoded ON PURPOSE. This is a contract with a THIRD-PARTY binary, not one of
    // our own values, so the test must fail if the constant is ever mistyped. Importing
    // the constant for this assertion would let a typo pass green and silently drop
    // every Windows user back to the CPU engine.
    expect(VULKAN_DISABLE_BFLOAT16).toBe('GGML_VK_DISABLE_BFLOAT16')
  })

  describe('macOS', () => {
    it('carries the dylib rpath', () => {
      const env = engineSpawnEnv({ platform: 'darwin', binDir: BIN })
      expect(env.DYLD_LIBRARY_PATH).toBe(BIN)
    })

    // The GUARD for this whole change: the Vulkan opt-out must never reach the macOS
    // engine, whose Metal build would be a behaviour change we did not ask for. This
    // fails the moment someone hoists the variable out of the win32 branch.
    it('sets NO Vulkan variable at all', () => {
      const env = engineSpawnEnv({
        platform: 'darwin',
        binDir: BIN,
        currentEnv: { PATH: '/usr/bin' }
      })
      expect(env[VULKAN_DISABLE_BFLOAT16]).toBeUndefined()
      expect(Object.keys(env).filter((k) => k.startsWith('GGML_VK'))).toEqual([])
    })

    it('does not rewrite PATH', () => {
      const env = engineSpawnEnv({
        platform: 'darwin',
        binDir: BIN,
        currentEnv: { PATH: '/usr/bin' }
      })
      expect(env.PATH).toBeUndefined()
    })
  })

  describe('Windows', () => {
    it('disables the bf16 shader extension', () => {
      const env = engineSpawnEnv({ platform: 'win32', binDir: BIN })
      expect(env[VULKAN_DISABLE_BFLOAT16]).toBe('1')
    })

    it('prepends binDir to PATH so the ggml/llama DLLs resolve', () => {
      const env = engineSpawnEnv({
        platform: 'win32',
        binDir: BIN,
        currentEnv: { PATH: 'C:\\Windows\\System32' }
      })
      expect(env.PATH).toBe(`${BIN}${path.delimiter}C:\\Windows\\System32`)
    })

    it('still prepends binDir when the inherited PATH is absent', () => {
      const env = engineSpawnEnv({ platform: 'win32', binDir: BIN, currentEnv: {} })
      expect(env.PATH).toBe(`${BIN}${path.delimiter}`)
    })

    it('omits the override so an explicit inherited value survives', () => {
      const env = engineSpawnEnv({
        platform: 'win32',
        binDir: BIN,
        currentEnv: { [VULKAN_DISABLE_BFLOAT16]: '0' }
      })
      // Deliberately NOT overwritten. ggml-vulkan tests with !getenv(), so "0" also
      // disables bf16 - but the user's own value is theirs to own, and re-enabling
      // requires unsetting the variable, never setting it to "0".
      expect(env[VULKAN_DISABLE_BFLOAT16]).toBeUndefined()
    })
  })

  describe('Linux', () => {
    // We ship no Vulkan engine here, so the change stays as narrow as the evidence.
    it('sets no Vulkan variable', () => {
      const env = engineSpawnEnv({ platform: 'linux', binDir: BIN })
      expect(env[VULKAN_DISABLE_BFLOAT16]).toBeUndefined()
      expect(env.DYLD_LIBRARY_PATH).toBe(BIN)
    })
  })
})
