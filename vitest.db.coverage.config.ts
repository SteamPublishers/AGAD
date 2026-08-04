import { defineConfig, mergeConfig } from 'vitest/config'
import dbConfig from './vitest.db.config'

// Coverage-only variant of the db suite.
//
// vitest writes NO coverage report when any test fails, so a single red test hides what the other 260
// journeys cover. This config runs the suite minus the files with open, DOCUMENTED failures, so the
// report exists while they are decided. It is not a way to look better: every exclusion is named here
// with its reason, `npm run test:db` still runs everything, and the number this produces is explicitly
// "the db journeys that pass today".
//
// Delete an entry the moment its cause is resolved.
export default mergeConfig(
  dbConfig,
  defineConfig({
    test: {
      exclude: [
        ...(dbConfig.test?.exclude ?? []),
        // Two tests: a paired peer over real loopback reads `available` where the projection can only say
        // `connected` for a device the LICENCE REGISTRY lists. Traced to control-center.ts building its
        // authoritative rows from registry installations alone, so a connected device missing from the
        // registry snapshot - which is what happens offline - can never report connected. A src fix is
        // proposed and waiting on a decision.
        '**/sync-service.integration.dbtest.ts',
        // The rendered Entity Graph route resolves to nothing: the screen is gone from the renderer while
        // its IPC remains in core. Whether it was retired or lost is the open question.
        '**/entity-graph-renderer.integration.dbtest.ts',
        // Reads a previous release's profile and expects the current bootstrap to decrypt it; the
        // safeStorage stand-in does not satisfy the current decrypt path. Unfinished diagnosis, not a
        // decision.
        '**/upgrade-profile.dbtest.ts',
        // Passes alone, fails when a neighbour still holds the model port: LLMService probes 8439 with an
        // HTTP /health request, so a process squatting the port without that endpoint reads as free and
        // the engine spawn then dies with EADDRINUSE. The journey is sound; the coupling is the port.
        '**/fresh-setup-first-use.integration.dbtest.ts'
      ]
    }
  })
)
