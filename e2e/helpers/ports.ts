import net from 'node:net'
import { GATEWAY_HOST, GATEWAY_PORT, LLAMA_SERVER_PORT, MEDIA_PORT } from '../../src/shared/ports'

/**
 * Precondition guard for specs that assert against the FIXED engine ports.
 *
 * Those ports are single-owner. When a dev has the real app (or `npm run dev`) running, it
 * owns 7878/7879/8439, and specs probing them talk to the WRONG process:
 *
 *   - smoke.spec.ts asserts llama-server is unreachable on a fresh profile, but a running
 *     app's llama-server answers on 8439, so the assertion inverts
 *   - smoke.spec.ts polls the gateway for its own fixture model, but 7878 belongs to the
 *     other app, which never serves that fixture
 *   - resilience-single-instance.spec.ts waits for the ports to close after teardown, and the
 *     other app's ports never close
 *
 * All three produced false failures that read exactly like product regressions. The app also
 * auto-falls-back to a free port when a fixed one is held, so the e2e instance may not even
 * be on the port the spec is probing.
 *
 * Rather than assert against a port we do not own, these specs SKIP with the reason. CI runs
 * on a clean machine, so it still executes them for real — which is what lets the e2e job
 * gate instead of running advisory.
 */

const ENGINE_PORTS: { port: number; what: string }[] = [
  { port: GATEWAY_PORT, what: 'gateway' },
  { port: MEDIA_PORT, what: 'media server' },
  { port: LLAMA_SERVER_PORT, what: 'llama-server' }
]

/**
 * True when something is LISTENING on the port. A raw TCP connect, not an HTTP probe: a
 * server answering 404 is still an owner, and an HTTP error would misreport it as free.
 */
export const portIsBusy = async (port: number, timeoutMs = 400): Promise<boolean> =>
  new Promise((resolve) => {
    const socket = net.connect({ port, host: GATEWAY_HOST })
    const finish = (busy: boolean): void => {
      socket.destroy()
      resolve(busy)
    }
    socket.setTimeout(timeoutMs)
    socket.once('connect', () => finish(true))
    socket.once('timeout', () => finish(false))
    socket.once('error', () => finish(false))
  })

/** Which canonical engine ports are already owned, as human-readable labels. */
export const busyEnginePorts = async (): Promise<string[]> => {
  const checks = await Promise.all(
    ENGINE_PORTS.map(async ({ port, what }) =>
      (await portIsBusy(port)) ? `${what} :${port}` : null
    )
  )
  return checks.filter((entry): entry is string => entry !== null)
}

/**
 * Reason string to pass to test.skip() when the fixed ports are not ours, or null when they
 * are all free and the spec can run for real. Call BEFORE launching the Electron app.
 */
export const enginePortsUnavailableReason = async (): Promise<string | null> => {
  const busy = await busyEnginePorts()
  if (busy.length === 0) return null
  return `engine ports already owned by another process (${busy.join(', ')}) — quit Off Grid AI Desktop / npm run dev and re-run. These specs assert against the fixed ports and cannot share them.`
}
