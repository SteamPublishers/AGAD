# Gaps backlog

Honest log of gaps, regressions, and "not fully done" items. Each entry: what, evidence,
how to reproduce, and the fix direction. Close with evidence; never hide.

---

## OPEN

### DEF-001 (P1) - Replay capture control reports a state that is not factual

**Evidence (2026-08-08):** macOS Settings reported `Screen access: denied` and `Permission
required` while Replay simultaneously showed the recording indicator and `Pause capture`. The
button was disabled, but its label still claimed capture was active. The current renderer derives
the verb from `paused` before it considers permission or scheduler state, so a disabled false claim
is still visible.

**Owning seams:** `pro/main/focus.ts` owns pause reasons, scheduler state, and the native capture
gate; `pro/main/capture-ipc.ts` owns the read-only renderer contract;
`pro/renderer/use-capture-control.ts` owns the shared projection used by
`CaptureToggle.tsx`/Replay and `settings-sections.tsx`; `pro/main/services.ts` must consume the same
projection for the tray. There must be one capture state machine, not independent interpretations of
`running`, `paused`, and permission. Work in progress in these seams is not closure evidence.

**Acceptance criteria:**

- Replay, Capture & processing, and the tray render the same authoritative state: capturing,
  user-paused, temporarily paused (batch/system/privacy), permission required, checking permission,
  or scheduler stopped.
- Only `capturing` offers `Pause capture`; only an explicit user pause offers `Resume capture`.
  Permission-required and checking states never show either verb. A temporary pause identifies its
  owner and cannot be cleared by a conflicting user control. `Restart capture` is offered only for a
  granted-but-stopped scheduler and never clears a privacy or batch pause.
- When Screen Recording is unavailable, Replay shows what is blocked plus actions to open the
  relevant permission surface and recheck. Historical Replay remains usable.
- A state change from Replay, Settings, tray, reprocess, sleep/wake, privacy deletion, or TCC is
  reflected on every mounted surface without reload and without contradictory intermediate copy.

**Evidence required to close:** a real renderer-to-main integration journey covering the complete
state/action matrix through production IPC (only macOS/TCC may be faked); the same journey proving
all mounted surfaces update from one event; packaged-mac screenshots for capturing, user-paused,
permission-required, temporary-pause, and stopped states; and an on-device grant/revoke/relaunch run
showing Replay never claims capture is active while TCC blocks it.

**QA/platform sweep (2026-08-08) - remains OPEN:** the code now has a single main-process runtime
projection for permission, scheduler, pause owner, and allowed controls. Replay, Capture &
processing, and the tray consume that projection. Focused state/action tests, rendered Replay and
Settings tests, and a real App-shell permission route pass; the former source-reading parity check
was removed. The production build, signature verification, scoped lint, and both core/pro typechecks
also passed. A fresh synthetic-profile real-app E2E verified the current native projection in Replay
and produced the UI screenshots, but the cached packaged-app licence was stale, so the packaged
bundle itself could not activate Pro for that visual run. Closure evidence is still missing: no one
journey mounts Replay and Settings while driving the real main IPC and tray through the complete
capturing/user/batch/system/privacy/TCC matrix, and no on-device TCC grant/revoke/relaunch run was
produced. The repository-wide run passed all 433 files and 4,096 tests (one skipped), but the command
still exited nonzero because two unrelated sync tests leaked asynchronous filesystem work/file
handles after teardown. Those pre-existing sync owners remain out of this capture-fix scope, but the
repository test gate is not clean until the unhandled errors are fixed.

### DEF-002 (P1) - Permission status and recovery are not independently discoverable

**Evidence (2026-08-08):** after onboarding, the user could not intentionally open a Permissions
surface to audit or repair access. Permission rows exist inside Settings > Setup & health > System
health, but they are buried among runtime components and have no per-permission recovery actions.
The richer permission cards and `Check permissions again` action live in the first-run setup overlay,
which is not a durable navigation destination. Replay also does not explain its missing permission or
route directly to recovery.

**Owning seams:** core `src/main/permissions.ts` and `src/main/system-status-ipc.ts` own native
permission status/actions and the IPC contract; core Settings owns the durable navigation surface;
Pro Replay/Capture only adds capability context and links into that owner. Reuse the existing
`PermissionGate` card behavior or extract it behind the existing shared component boundary - do not
create a second TCC reader or writable permission store in Pro.

**Acceptance criteria:**

- Settings > Setup & health ends with a plainly named, always-reachable System permissions section
  showing Accessibility, Screen Recording, Microphone, and Local Network independently, including
  what each grant enables.
- Each row distinguishes granted, denied, not determined, status unavailable, and restart required;
  supplies the correct request/open-System-Settings action; and can recheck without restarting the
  whole setup journey. Development builds explain that macOS may list the app as Electron.
- Replay and every permission-dependent surface show a concise permission-required state with a
  direct route to the relevant row. Back returns to the originating surface and unrelated features
  remain usable.
- The status shown in Permissions, System health, Capture & processing, Replay, and setup is a
  one-way projection of one native contract. A failed or inconclusive Local Network probe is not
  mislabeled as a user denial.

**Evidence required to close:** real Settings navigation tests (normal shell and Replay deep-link),
including Back/history and absence of a duplicate first-run-only hierarchy; production-contract
tests for every status/action; packaged-mac fresh-profile and existing-profile runs that grant,
revoke, toggle, recheck, and relaunch each relevant permission; light/dark screenshots at the target
desktop size; and a development build proving the Electron-name guidance and Local Network recovery.

**QA/platform sweep (2026-08-08) - remains OPEN:** the requested durable placement is wired at the
end of Settings > Setup & health, and Replay/Capture & processing can route directly to that section.
Onboarding and Settings reuse the same permission controller instead of adding a second TCC reader.
The focused onboarding/Settings tests and a real App navigation test pass. A fresh synthetic-profile
real-app E2E verified the three current native grants and recheck action in this section and produced
a light-mode screenshot. The current panel still shows only Accessibility, Screen Recording, and
Local Network; Microphone is absent. The shared contract is four booleans, so the renderer cannot
distinguish denied, not determined, status unavailable, or an inconclusive Local Network probe as
required. Back to the originating Replay surface and every native status/action are not yet covered,
and the stale packaged E2E licence prevented a packaged Pro visual run. No packaged
fresh/existing-profile grant/revoke/relaunch run or dark-mode visual evidence was produced. Scoped
lint is now clean.

### DEF-003 (P1) - Capture exposes raw JSON parser failures and strands failed frames

**Evidence (2026-08-08):** Capture & processing displayed `Last frame failure: Expected ',' or ']'
after array element in JSON at position 446 (line 11 column 2)`, with 14 failed frames. The model
response parser wraps malformed structured output as `capture-model-output-invalid`, but frame
persistence stores the underlying parser message, `capturePipelineStats()` drops the stable error
code, and the renderer prints the raw message. The only broad recovery is `Re-process today`; the
alert itself does not explain impact or recovery.

**Owning seams:** `pro/main/crm/extract.ts` owns structured model-output validation;
`capture-retry-policy.ts` owns retry versus terminal disposition; `capture-frames.ts` owns durable
error code, safe user message, diagnostic detail, and retry state; Capture & processing owns the
projection and recovery intent. Parser internals belong in local diagnostics, not visible copy.

**Acceptance criteria:**

- Malformed model output is recorded under the stable `capture-model-output-invalid` code and shown
  as a safe explanation such as "This frame could not be analyzed"; raw parser text and model output
  remain only in local logs/diagnostics and never leak captured content into the UI.
- The retry policy explicitly handles invalid structured output with a bounded retry/backoff policy.
  Exhaustion leaves the frame durably failed without blocking capture or the rest of a batch.
- The visible failure states the impact, identifies the affected frame/count, and offers an
  appropriate retry/reprocess action. A successful retry clears the active alert and updates pending,
  failed, and observed counts truthfully while retaining diagnostic history.
- Reprocessing a day is resilient to one bad frame, reports updated/skipped/failed outcomes, restores
  live capture according to its pre-run user/privacy state, and never presents the batch pause as a
  user pause.

**Evidence required to close:** an integration journey through the real parser, retry policy, SQLite
frame store, IPC, and rendered Capture section using a controllable malformed response only at the
model-runtime boundary; proof of bounded retry, terminal exhaustion, successful later reprocess, and
non-blocking batch continuation; assertions that raw parser/model content is absent from the rendered
UI; packaged-mac screenshots before and after recovery; and logs correlating the stable code to the
affected frame without recording private frame content.

**QA/platform sweep (2026-08-08) - remains OPEN:** malformed output is now persisted under
`capture-model-output-invalid`, legacy raw parser text is sanitized before renderer projection, an
automatic three-attempt budget is exercised through the real fake-model HTTP boundary and SQLite,
and a later manual reprocess can recover the frame while the next frame in the batch continues.
However, invalid-output retries have no explicit backoff, successful recovery clears the row's
diagnostic fields instead of retaining diagnostic history, and the rendered alert is still only
`Last frame failure: <safe message>`; it does not identify the affected frame/count or place a
recovery action with that failure. The tests do not yet carry one malformed frame through parser,
store, IPC, rendered recovery action, successful retry, and truthful count/alert clearing in a
single journey. No packaged before/after screenshots or privacy-safe correlation-log evidence was
produced.

---

## RESOLVED

### Data-layer / presentation-layer drift sweep (2026-07-09) - CLOSED

Class: the UI kept its own copy of authoritative data instead of binding to the owning source
(hygiene §A). Every TIER-1 item is fixed, behavior-neutral where required, and regression-tested;
the coverage floor held (~97/92/96/98) throughout.

- **T1a. Image composer `imgModel` shadowed the active model** → FIXED. The dropdown's `onChange`
  now writes through the single owner (`MemoryChat.tsx:553` `setActiveModalModel('image', value)`)
  and the composer reads the active value from `imageGenStatus().active` (no latch). Terminal-artifact
  render test: `MemoryChat.image.test.tsx` asserts a dropdown change routes through
  `setActiveModalModel` and reaches the `generateImage` payload.
- **T1b. `imgSteps`/`imgSize` re-seed stomp** → FIXED. Per-model overrides resolved by the pure
  `resolveImageParams`/`setOverride` (`lib/image-params.ts`), persisted via
  `saveSetting('imageParams', …)`; a model change never clobbers a typed value. Render test asserts
  the payload carries the user's steps (10), not the model default (28).
- **T1c. `imgSeed`/`imgNegative`/`imgStrength`/`imgStyle` not persisted** → FIXED. Persisted +
  reloaded through the data layer (`MemoryChat.tsx:314-317, 332-335`). (`imgInit` stays transient -
  a per-turn init-image path, correctly not persisted.)
- **T1d. Image params had no persisted owner** → FIXED (subsumed by T1a–T1c). Image-gen params now
  have a single persisted owner (the settings store); the composer binds to it and writes through.
  A separate Settings > Image editor is optional UX, not a drift bug - descoped, not a gap.
- **T1e. KV cache / FlashAttn / ctxSize two-writer clobber via the mode preset** → FIXED.
  `applyModePreset` (`llm/settings-math.ts`) MERGES - it only fills fields the user has NOT pinned;
  the pinned set (`userExplicit`) is persisted (`llm.ts:194`) and restored on boot (`:125-126`), and
  boot loads the stored `kvCacheType`/`flashAttn` DIRECTLY (never re-derived from the mode), so the
  every-restart re-clobber path is closed too. Tests: `llm/__tests__/settings-merge.test.ts` +
  `kv-launch-roundtrip.test.ts` (persist → restart → launch-args round-trip).
- **T1f. Thinking/reasoning not persisted** → FIXED. Reasoning rides the persisted context blob via
  `buildAssistantContext`/`readReasoning` (`lib/message-persistence.ts`) and is restored on remap.
  Real DB round-trip test: `lib/__tests__/message-persistence.test.ts`.

### TIER 2 (minor / adjacent) - dispositioned

- **Preload `setLlmSettings` type omitted kvCacheType/flashAttn/gpuLayers/threads/batchSize/mode** →
  FIXED (`src/preload/index.ts:244` - the type now carries every field the handler accepts;
  runtime was always passing the whole object, this closes the type-check blind spot).
- **Settings identity fields saved on `blur` only (edit lost if closed without blurring)** → FIXED -
  now also commits on Enter (`Settings.tsx:472-473`), the standard keyboard commit, calling the same
  `saveIdentity`.
- **`ctxSize` halved + persisted by crash recovery (`llm.ts:479-483`)** → BY DESIGN, not a bug. This
  is the deliberate post-crash safety fallback (a too-large KV cache froze macOS on 16GB); it
  intentionally persists a smaller, safe context after a detected crash. Left as-is.
- **VoiceScreen residency toggle fire-and-forget; ActionsScreen prop-resync** → minor UI polish, NOT
  the data-layer drift class (no authoritative copy that diverges). Deferred as cosmetic; would need
  on-device screenshot verification if ever pursued.

### TIER 3 (ephemeral view prefs) - BY DESIGN

ReplayScreen `speed`/`asideW`, ReflectScreen day/week `mode` reset on remount. No authoritative owner
to diverge from - explicitly not the drift class. Persisting them is optional UX, not a gap.

### Reference pattern (correct write-through / refetch-bound)

SettingsPanel (LLM inference controls), ModelPicker (per-modality active model), Projects, Connectors,
ChatDetail, DayView (persisted layout with get + write-back - the good reference), MeetingsScreen,
ReflectScreen, composer chat-prefs (noMemory/tools/connectors/thinking/voice).

### Agentic `generate_image` tool errored (stale keep-alive socket in the tool loop) - CLOSED

**Root cause (verified with in-process DIAG):** the tool loop makes back-to-back requests to
llama-server. Round 0 (`generate_image`) succeeded; round 1's `streamChat` died with `read
ECONNRESET`. Node's global HTTP agent pooled the round-0 socket; llama-server closes its socket after
each response, so the pooled socket was half-closed and round 1's write reset. (The earlier
"modality queue evicts llm mid-loop" hypothesis was DISPROVED - DIAG confirmed the engine stayed
alive; pause was never called.)

**Fix:** every `http.request` to the model uses a fresh connection (`agent: false` +
`Connection: close`); the SSE transport is now one shared `streamCompletion` (`llm/stream.ts`) used
by both `chatStream` and `streamChat`. Regression guards: `__tests__/llm-http-no-keepalive.test.ts`
(reads the source, asserts no keep-alive pool) + `llm/__tests__/stream.test.ts` (a real local SSE
server exercises content/reasoning/tool-calls/abort/timeout). The double intent-decision that could
route "draw …" away from the tool was also closed (`shouldAutoRouteImage` suppresses the renderer
auto-route when the agentic path owns the turn; `image-intent.test.ts` + `MemoryChat.image.test.tsx`
assert tools-ON → `toolChat`, not a direct `generateImage`).

## Deferred from PR #60 review (CodeRabbit)

- **bench-capture.mjs — `downscale()` failure aborts the whole run.** A corrupt/unreadable frame
  throws out of the batch/single loops instead of being skipped. Dev-only benchmark tool (not
  shipped), so fail-fast is acceptable; wrap `downscale()` to skip a bad frame if it becomes a
  nuisance. (PR #60, scripts/bench-capture.mjs:212)
- **Transcription provenance label on a cross-family engine fallback.** `getActiveTranscriptionInfo`
  pairs the resolved effective engine with the pre-fallback active model id, so a rare
  parakeet→whisper fallback would label "Whisper · <parakeet model>". The common fallback
  (whisper-resident→whisper) keeps the model name valid; the cross-family case is rare. Fix:
  reflect the actually-run model when `effectiveEngine !== engineForActiveModel`. (PR #60,
  src/main/transcription/select.ts:153)

## Deferred from desktop-pro PR #32 review (Gitar)

- **Transcript provenance shows the selected model even after a cross-family engine fallback.**
  Same root as PR #60's select.ts:153 item. Fixing naively (label built-in when effectiveEngine
  != declared) would regress the common whisper-resident→whisper case (same family, model still
  valid); needs an engine-FAMILY concept. (MeetingsScreen.tsx:87 / select.ts)
- **Reprocess deletes observation-derived actions without regenerating from the corrected summary.**
  Deletion is the explicitly-requested "replace stale misattributed actions" behavior (Task 2);
  entities ARE regenerated. Regenerating actions from the corrected summary is a follow-up.
  (reprocess.ts:245)
- **Failed re-transcribe error persists in the main-owned job status until the next run.** Scoped
  to its meeting (derived by meetingId), so it only re-shows on re-selecting that same meeting -
  accurate but sticky; could clear on ack/navigate. (MeetingsScreen.tsx:178)
- **Re-transcribe on a 2nd meeting while one runs silently no-ops.** Global single-flight is
  intentional (one local whisper); UX follow-up = disable the button / show "another run active"
  when busy for a different meeting. (MeetingsScreen.tsx:160)

## e2e gate: graduate from advisory → blocking

The Playwright e2e is wired into CI (own `e2e` job) and pre-push, but **advisory** (non-blocking)
for now.

**RESOLVED — item (1) was a misdiagnosis.** This doc previously claimed `meeting-transcription`
and `settings-residency` "need a real model/engine and fail on the fresh e2e profile", and the fix
was to add `test.skip(!HAVE_MODEL, …)` guards. That was wrong, and acting on it would have skipped
two specs that should run. Neither needed a model. They had stale selectors that could never match:

- `settings-residency` clicked a `/Model memory/` **button** — it is an `<h4>` — and never opened
  the `Capture & processing` section that contains the residency controls; 2 of its 4 switch names
  were also stale (`Chat model residency` vs the rendered `Chat and capture model residency`).
- `meeting-transcription` matched an onboarding CTA of `Start using Off Grid AI Desktop` while the
  button renders `Start using Off Grid`, so it never left onboarding, then looked for `Meetings`
  exact where a locked-Pro item computes `Meetings Pro`.
- Both Settings tests in `tour.spec.ts` clicked a second section while the first was open —
  sections are single-open, so the target was exit-animating out ("element detached").

All fixed; selectors are now derived from source (`RESIDENCY_ROWS`, `navButton`) so a rename fails
a test instead of orphaning it. Full suite on a real display: **73 passed, 0 failed.** The lesson:
an advisory gate let 7 specs fail on main while CI stayed green — advisory gates rot silently.

**Still blocking (item 2): headless-Electron flakiness in CI.** A clean CI run was 49 passed /
6 skipped / 15 failed, dominated by `electronApplication.waitForEvent('window')` timeouts +
"page/context closed" under xvfb. Done so far: `--no-sandbox` (set), `retries: 2` in CI
(`playwright.config.ts`), and fixed-port specs self-skip rather than fail against a foreign
engine (`e2e/helpers/ports.ts`). Likely still needed: GPU flags (`--disable-gpu` /
`--use-gl=swiftshader`) in the Electron launch args.

Flip the CI `e2e` step and the pre-push e2e to blocking once a few consecutive runs are green.
Do not flip while the runner still drops instances — a gate that gets reverted loses the signal
again. No product regressions are known.

### Known residual flake: `pro.spec.ts` clipboard quick-open (focus-dependent)

`Clipboard quick-open renders populated content on the first native hotkey press` drives a REAL
global hotkey through `osascript` → System Events, which delivers the keystroke to whatever app is
**frontmost**. It was therefore order-dependent: it passed in a full-suite run (an earlier spec left
the window focused) and failed **3/3 when `pro.spec.ts` ran alone** — the keystroke went to the
terminal. Pre-existing, reproduced on `main` @ 556d435; not a product bug.

Mitigated, not solved: the spec now calls `app.focus({steal: true})` and polls `isFocused()` before
sending the keystroke, which takes isolation from 3/3 failing to roughly 1-in-3. The residual cause
is that `isFocused()` reporting true still does not guarantee System Events targets our app (macOS
Accessibility/automation timing). With `retries: 2` in CI the practical failure rate is low, but
this spec should not be trusted as a hard gate until the hotkey is driven deterministically —
options: assert the global-shortcut registration before pressing, or expose a test-only IPC that
triggers the same handler and keep the native-key path as a separate, quarantined check.

### RESOLVED: a licensed installation this device never paired with became a repair row that could not repair

Fixed in `@offgrid/sync`. Three parts: a row with no local pairing now reports `hasCredential: false`
rather than leaving it absent, so the repair asks for the code instead of promising a reconnection with
nothing to reconnect with; a device with an eviction in flight no longer also gets a saved row; and the
saved pass no longer deletes devices from the discovered map, which is what hid `Pair again` after a
failed eviction. Covered by two new tests in `shared/packages/sync/test/control-center.test.mjs`.

Desktop needed no change of its own: its eviction store already tolerates an empty local side
(`prepareEviction` uses `active?.membershipId ?? ''`) and `runEviction` already surfaces failures. The
mobile host had neither and was fixed there.

Original report follows.

`projectSyncControlCenter` builds its `saved` list by walking the licence registry's installations and
treating a local pairing as enrichment. That is correct for the roster - the licence IS the authority on
which devices belong to the mesh - but it means an installation with NO matching local pairing still
produces a row, and that row lands in `needs_repair` (`control-center.ts`: `!paired || repairIds.has(...)`).

Two consequences, one of them user-visible and already seen on device:

1. **A repair that cannot succeed.** The row offers `membershipRepair.kind === 'reconnect'` -
   "Trying the saved pairing again may be enough" - when there is no saved pairing to try. This is the
   ghost row seen after reinstalling a phone: the phone re-registers under a new sync device id, its old
   installation stays on the licence, and the stale one renders as a device asking to be reconnected.
   The wording is `reconnect` rather than `pair` only because `hasCredential` is absent and absent is
   deliberately read as present (see the comment at the `credentialLost` line) so that a host which does
   not report the field is not accused of having lost every pairing.

2. **It can steal the discovered record from another row.** The `saved` pass calls
   `discoveredById.delete(deviceId)`, so a stale installation consumes the discovery entry before the
   membership-revocation pass looks for it. `revocationPeerDiscovered` is then false and
   `actions.pairAgain` is hidden - meaning a failed eviction cannot be recovered from even while the
   other device is sitting on the network. Demonstrated: with the licence listing the device and a
   `stage: 'failed'` revocation present, `pairAgain` projects as `{visible: false, enabled: false}`.

Note this does NOT arise from a normal eviction. `PersonalMeshDeviceEvictionCoordinator.evict()`
deregisters the installation before it ever contacts the peer, so the seat is released immediately and
the evicted device correctly appears once, in `available`. The trigger is a genuinely stale installation.

Candidate fixes, both deliberately not taken yet:
- Do not emit a `saved` row for an installation with no local pairing (narrow; may hide a real device
  whose pairing this side genuinely lost).
- Have the desktop and mobile hosts report `hasCredential` so the repair correctly says "Pair" and asks
  for the code (touches both hosts, and is the more honest fix).

The test asserts only the revocation row's own retry semantics and states in a comment that the
`saved` count is deliberately unasserted, so this defect is recorded rather than blessed.

### Worth a look: the eviction confirmation promises the peer's licence is cleared

`projectMembershipEvictionConfirmation` adds "Off Grid AI will also remove its saved licence" whenever
the device is connected. That sentence is only earned if the eviction actually reaches the peer, and the
`stage: 'failed'` path exists precisely because it may not. Not a defect in itself - the copy is gated on
an authenticated session, which is the strongest reachability fact available - but the promise is made
before delivery is confirmed, and a failed eviction leaves the user believing something that did not
happen. Flagged for a copy decision, not changed.

### Needs a decision: the Entity Graph screen is gone from the pro renderer, its IPC is not

`entity-graph-renderer.integration.dbtest.ts` asks for `proView('graph', ...)` and gets nothing back:
the route does not exist. The router now knows day, replay, reflect, devices, actions, meetings,
entities, memories, search, notifications, clipboard, voice and vault - no graph. Nothing under
`pro/renderer/` imports `react-force-graph-3d` or calls `getEntityGraph` any more.

Core still carries the whole surface, though: `getEntityGraph` and `rebuildEntityGraph` are in
`src/main/ipc.ts`, `src/main/database.ts` and the preload contract. A feature that was retired on
purpose would normally have taken its IPC with it, which is why this is written down rather than
resolved by deleting the test.

Two readings, and they want opposite actions:
- The graph was deliberately retired and folded into Entities. Then the test should go, and so should
  the three IPC handlers and the preload entries, or they are dead surface area a renderer can still call.
- The screen was lost in a refactor. Then the test is correctly failing and the screen needs restoring.

The test is left red on purpose. Deleting it would remove the only thing still asserting that the graph
services work end to end, and would make the second reading invisible.

### RESOLVED (2 of 3): the pro-tier Devices e2e specs

`e2e/devices-sync.spec.ts` is new on this branch and its `Devices surface — pro tier` describe was red in
BOTH environments, hidden because the desktop CI `E2E (Playwright, xvfb)` step is `continue-on-error`.

**Fixed - `renders the real Devices screen with live sync status`.** It asserted the text `LAN + nearby ready`
and a heading `Personal mesh`. Neither string exists anywhere in `src/`, `pro/` or `shared/packages/`: the
first was never shipped, and the second is now `Licensed devices`. The screen reports itself per ROUTE - one
chip reading `LAN: ready`, or `LAN: <listen>/<advertise>/<browse>` when it is not (`syncRouteDisplay` +
`DevicesScreen.tsx`) - so the spec now asserts that, plus the nearby counter. The screen underneath was fine
the whole time; the spec was failing on its own stale copy.

**Fixed - `sync settings ... expose a toggle per replicated category`.** Passes with the above; it was
inheriting a broken screen state from the spec before it, not failing on its own account.

**Still red - `pairs a real peer and converges projects and chats`.** Two problems, one down:

- The harness constructed `ClipboardSyncCoordinator` without the `deliveryPersistence` its options require, so
  the spec died inside its own setup (`Cannot read properties of undefined (reading 'load')` from
  `loadPendingDeliveries`) before reaching the app. The synthetic peer now has an in-memory delivery store
  beside its history store. FIXED.
- What remains is not a harness defect: pairing now requires an **8-character code** shown on the other
  device ("Enter the 8-character pairing code shown on the other device"), and the synthetic peer neither
  mints one nor presents one the app will accept. `PairingCodeService` lives in
  `shared/packages/sync/src/pairing-code.ts`; wiring it into the synthetic peer is the same job as the
  standing "make pairing work in the test harness" item, so it is tracked there rather than bodged here.

Verified headless: 5 of 6 in that file pass; the pairing one is the single remaining failure.

### The desktop `ci` check hides three advisory steps

`Lint`, `Heavy integration (build/native/port)` and `E2E (Playwright, xvfb)` are all
`continue-on-error: true` in `.github/workflows/ci.yml`, so a green `ci` says nothing about them. On the
last successful run: heavy integration reported **12 failed / 15 passed**, all in macOS packaging and
real-engine files that cannot pass on a Linux runner (`packaged-helpers`, `release-packaging`,
`whisper-cli-build`, `model-server-chat`, `HealthPanel`), and the e2e step failed the macOS-only pro
surfaces (clipboard restore, Vault clipboard copy, dictation) plus `resilience-single-instance`.

The Linux-impossible ones are a platform mismatch rather than rot - but they are being run and reported
as failures on every push, which trains everyone to ignore the step. They should either be excluded by
platform (like `vitest.db.ci.config.ts` does, with the reason recorded per file) or moved to a macOS
runner, so that what remains inside an advisory step is only ever a real signal.

### P1 - the desktop always reports its platform as `macos`, so a Windows node lies about itself

`pro/main/sync/sync-store.ts:318` builds the LOCAL device identity with `platform: 'macos'` hardcoded,
unconditionally, on every OS. Nothing misdetects Windows - the local device never reports its OS at all.
The same literal is hardcoded in three more places: `pro/main/sync/model-transfer-service.ts:105` and
`:414`, and `pro/main/sync/keygen-personal-mesh-registry.ts:163-164`.

**Observed on the lab mesh (2026-08-06).** The Windows 11 ARM guest on .64, renamed
`OGAD x.x.x.64 (Win)`, appears in the macOS node's own LICENSED DEVICES list as `macOS`, and the Android
lists TWO macOS devices when the LAN has exactly one Mac. `DevicePlatform` in
`shared/packages/sync/src/types/index.ts:2` already allows `"windows"`, so this is a missing
`process.platform` map (`darwin`->macos, `win32`->windows, `linux`->linux), not a missing type.

**Why P1 and not a labelling nit - `platform` gates two real decisions:**

- `shared/packages/sync/src/multi-transport.ts:29` treats `platform === "ios" || "macos"` as
  Apple-proximity-capable, so the mesh will attempt an APPLE-ONLY transport route to a Windows box.
- `shared/packages/sync/src/transfer/model.ts:96-104` (`platformTransferBlocker`) refuses a model whose
  `origin` platform differs from `receiverPlatform`, which exists precisely to stop an unrunnable
  transfer. A Windows receiver claiming `macos` DEFEATS that guard: a macOS-only GGUF is allowed to
  transfer to a machine that cannot load it. `model-transfer-service.ts:414` pins
  `receiverPlatform: 'macos'` too, so both sides of that comparison are wrong together.

Not fixed here: this is product code under `pro/`, and this sweep is not authorised to change `src/`.
A fix needs a single platform helper used by all four sites, plus a test that a non-darwin
`process.platform` yields a non-`macos` identity - otherwise the next hardcode reintroduces it.

### P2 - a long-running desktop instance can end up with NO sockets at all, mesh included

Observed on .64 (packaged v0.0.42) on 2026-08-06. The app had been up since 09:36 and was licensed
(`[Pro] license loaded - entitled=true`), and `pro:sync:status` was answering IPC on a 2s poll - yet the
process held **zero TCP and zero UDP sockets**. Confirmed three independent ways, all agreeing:
`sudo lsof -nP -iTCP -sTCP:LISTEN`, `netstat -an -p tcp`, and `sudo lsof -nP -p <pid>` for each of the
four app pids. Machine-wide there was only sshd:22 and a launchd 127.0.0.1:8021.

Not just the mesh: `llama-server` (127.0.0.1:8439) and the gateway (7878/7879) were absent too, and the
app's own sidebar read `Model stopped`. A restart restored everything at once - mesh listener on an
ephemeral wildcard port, 8439, 7878, 7879 - and the sidebar went to `Model running`.

**Why this is worth a gate, not just a restart.** `pro:sync:status` reported `serviceState: 'running'`
throughout. The LAN route is `required: true` in the MultiTransportBridge, so a listen failure at startup
would have rethrown out of `service.start(0)` and aborted `setupSyncIPC` before that handler was ever
registered - meaning the socket was NOT lost at startup, it went away later while the service went on
claiming to be up. From the phones' side this is indistinguishable from the Mac being switched off: both
phones simply showed it Offline, for days (`last seen 03/08/2026`).

Cause not established - this box is also running a VMware Fusion Windows guest, so resource pressure or a
sleep/wake cycle are both plausible and neither is proven. What IS actionable regardless: the status a
peer reports should be derived from the listener actually being bound, so `serviceState: 'running'` cannot
outlive the socket. A liveness check that re-binds or reports unhealthy would have surfaced this in
seconds instead of days.

### P1 - the device cap REFUSES at 5 instead of reclaiming, and the seat it counts is the pairing target's own

Observed 2026-08-06, driving the real lab mesh. After activating the Mac's Pro licence
(`08634d13-641c-455d-957b-ad1834c5fb50`, policy `ec95153c`, `maxMachines: null`) on the Android, the
Android's Devices screen reports:

    5 of 5 devices saved
    All slots are in use. Forget a saved device before pairing another.
    0 connected

and pairing with the macOS node on .64 is refused outright. Three separate defects are tangled here.

**1. It refuses where it is documented to reclaim.** The stated behaviour is that a 6th device is
admitted by reclaiming the least attributable seat, never by refusing. This is a flat refusal at 5, with
the remedy pushed onto the user ("Forget a saved device"). Nothing was reclaimed.

**2. The counter and the list disagree, so the remedy is impossible.** The screen says `5 of 5 devices
saved` but renders only TWO saved rows (`fa4d14a6…`, `c375a25b…`). The other three seats are invisible,
so a user told to "forget a saved device before pairing another" cannot forget them - there is no row to
act on. The cap is counting LICENCE MACHINES (Keygen reports exactly 5 on that licence) while the list
renders only locally-saved sync pairings. Two different populations behind one number.

**3. Worst: the target's own seat blocks pairing with the target.** The device being paired with -
the .64 Mac, fingerprint `d0e933934ac1be2b3ecf50ce0d7fbc85` - is ITSELF one of the 5 machines on that
licence. So the Android is refused a pairing with a device that already holds a seat on the Android's own
licence. A seat held by the pairing target cannot sensibly count against admitting that same target;
the cap check needs to exclude the counterparty (and ideally any machine already in the mesh) before
declaring the mesh full.

**Related, same session:** the licence swap silently dropped the working iPhone<->Android pairing. The
iPhone (`9d25c24e…`) is not among the machines on this licence - it is still on the previous one
(`c88a9e27…`) - and its row on the Android reverted from `Connected - LAN` to an unpaired
`sync-pair-9d25c24e…`. A licence change invalidating existing trust may be intended, but it happens with
no warning and no explanation on either screen.

Evidence: Keygen machine roster for the licence (5: one android `6e1c3b71…`, four macos incl.
`fa4d14a6…` which is really the Windows guest per the platform P1 above), against the Android's two
rendered rows.

---

## Sync never re-connects a saved device after the session drops (only after a NEW discovery)

**Status:** open. Found 2026-08-07 while building the four-device e2e flow suite.

**Symptom, seen on two screens at once.** The iPhone `17 pro max` and the Mac `OGAD x.x.x.25 (MacOS)`
are paired, both hold the credential, and each can see the other. The link drops (a phone restart is one
way in). Neither side ever comes back on its own. The Mac sits on `Last connected just now` /
`The device could not be reached.` with a `Reconnect` button, and the iPhone sits on `macos - Nearby`
with its own `Reconnect`. Tapping Reconnect works instantly - so the credential, the address and the
transport are all fine. The only thing missing is anything that decides to retry.

**Cause.** Auto-reconnect is edge-triggered on discovery and nothing else. `Orchestrator.handleFound`
(`shared/packages/sync/src/orchestrator.ts:223`) is the only automatic caller of `engine.reconnect()`,
and it is wired to `discovery.onDeviceFound` (`orchestrator.ts:81`). Two consequences:

1. A peer that is ALREADY in the discovery set produces no new `found` event, so `handleFound` never
   runs again for it. The device is visible and saved and still never retried.
2. A dropped session is a dead end. `onDisconnected` reaches production at
   `desktop/pro/main/sync-ipc.ts:342`, where it only calls `chatStream?.onDisconnected(deviceId)`.
   The orchestrator is never told, so nothing schedules a reconnect.

The state machine heals on the RISING edge of discovery and never on the FALLING edge of a session.
`orchestrator.ts:174` shows the intent was already understood - "until now the user was the retry
mechanism" - but that was fixed for a STALE ADDRESS (`connectSaved`), not for a lost session.

**Why it looks like one bad pair.** It is not. The other four links in the mesh simply have not dropped.
Any link that drops stays dropped in exactly the same way.

**Fix shape.** Make healing level-triggered: on `onDisconnected`, hand the device back to the
orchestrator so a saved peer with a held credential is retried on a backoff for as long as discovery
still sees it. `connectSaved` already does the hard part (re-resolve a stale address, then reconnect);
what is missing is a caller on session loss. Guard with the existing `connecting` set so a flapping link
cannot stack retries.

**Consequence for the e2e suite.** Flow 2 ("reconnect a dropped saved device with the held credential,
no code") passes only because the flow TAPS Reconnect. The unattended behaviour a user actually relies
on - it comes back by itself - is untested and currently absent. Worth its own flow once fixed.

---

## Disconnecting a device leaves BOTH sides saying "Needs repair", and it never clears

**Status:** open. Found 2026-08-07 driving the four-device e2e suite.

**Symptom.** Press the `x` (disconnect) on a connected peer - a deliberate, non-destructive action that
is supposed to close the session and keep the credential. Both devices then show the other as
`Needs repair`, with the description "The other device did not recognise this one." Nothing failed to
recognise anything: the user pressed disconnect. Both sides still hold their credentials
(`sync-paired-<id>`, offering repair rather than pair), so the accusation is not even true.

Observed on OnePlus Nord 5 <-> 17 pro max. After the disconnect, BOTH rows read `Needs repair`.

**It does not heal.** The peer was made discoverable again and a full rescan run; 90 seconds later
both rows still read `Needs repair`. Only a manual repair tap clears it.

**Cause.** `needs_repair` has exactly one source - `syncRuntimeCallbacks.ts:185`:

    onPairingFailed: (remote, error) => {
      if (remote && error === 'unknown_device') {
        pairingSecretStore.markNeedsRepair(remote)

So a single `unknown_device` answer is taken as fact. `pairingSecretStore.markNeedsRepair` documents
the very false positive this hits - "a peer that is restarting, or whose pairing store has not
finished loading, answers exactly the same way" - and keeps the secret for that reason, but the STATE
is still set from one unanswered handshake, and nothing later re-tests it.

`control-center.ts:298` then makes it stick to the top of the priority list: `needs_repair` beats
`available`, so the row keeps the warning even once the peer is discovered again and reachable.

**Why it matters.** This is the ordinary path - disconnect and reconnect later is what the control is
FOR. A user who uses it once is left with two devices showing a red warning triangle and an
instruction to repair a pairing that was never broken.

**Fixed, in part (2026-08-07).** A disconnect the user asked for no longer enters this path.
`onDisconnected` already consulted `manuallyDisconnected` to present the row as
available-and-disconnected; a handshake refusal arriving afterwards overwrote that. `onPairingFailed`
now consults the same set and leaves the pairing alone. That is the whole of the reported symptom.

**Still open: one `unknown_device` is still taken as a verdict when the disconnect was NOT deliberate.**
Requiring two consecutive refusals was tried and reverted, because nothing retries after a refusal: a
pairing failure is not a disconnect, so no heal is scheduled, the second answer never arrives, and a
peer that has genuinely forgotten this device would sit silent instead of asking for a repair. Trading
a false accusation for silence is the worse bug, and `syncPersistence.integration.test.ts`
("repairs one-sided trust") catches exactly that.

So corroboration needs a RETRY before it can be safe: on the first refusal, re-attempt the reconnect
with the held credential and decide on the second answer. The orchestrator already knows how to retry
on a backoff (`connectSaved`, added the same day for dropped sessions); what is missing is entering it
from a refused handshake rather than only from a lost session.

---

## macOS: a CONNECTED device offers no actions at all

**Status:** open. Found 2026-08-07 while driving the model-transfer flow by hand.

**Symptom.** On the Mac's Devices screen, every connected peer card carries ZERO controls. Enumerated
live from the DOM:

    CARD: 17 pro max            ->  buttons: NONE
    CARD: OnePlus Nord 5        ->  buttons: NONE
    CARD: OGAD x.x.x.26 (Win)   ->  buttons: NONE
    CARD: Off Grid AI Desktop   ->  buttons: Pair        (unpaired - this one has a control)
    CARD: OGAD x.x.x.25 (MacOS) ->  buttons: NONE

So on macOS a user cannot send a model, disconnect, forget or rename a device they are connected to.
The only cards with controls are the ones NOT connected: unpaired shows `Pair`, saved-but-away shows
`Reconnect` / `Evict`. Being connected removes every action.

Both phones offer all four on every row - `sync-rename-<id>`, `sync-disconnect-<id>`,
`sync-send-model-<id>`, `sync-forget-<id>` - so this is a desktop gap, not a product decision.

**Consequence.** Flow 12 (send a model, with progress on both sides) cannot be driven from the Mac at
all. Model transfer desktop -> phone is unreachable through the UI.

---

## macOS: the "N/5 licensed devices" chip is a button that goes nowhere

**Status:** open. Found 2026-08-07, same session.

`4/5 licensed devices` on the Devices header is a real `<button>`, so it invites a click. Clicking it
leaves the screen unchanged - no panel, no navigation, no roster. A user looking for which devices are
on their licence (the thing they need before evicting one to free a seat) finds a control that does
nothing.

Either it lists the licensed installations, or it is not a button.

---

## Harness: there is NO passive way to observe an iPhone through WDA

**Status:** open, harness limitation. Learned the hard way 2026-08-07, twice in one session.

Every read of the iOS app goes through a WebDriverAgent session, and creating one is not an
observation - it changes the device:

- `session(bundleId)` LAUNCHES/ACTIVATES that bundle, terminating whatever it was doing. This killed a
  706 MB model transfer that was mid-receive: the snapshot tool called it "read-only by design" while
  relaunching the app it was recording.
- `session()` with no bundle id was the attempted fix. It does not launch the app under test, but it
  still appears to deactivate the FOREGROUND app - a read taken while the user had the app open
  returned the SpringBoard home screen instead.

So `passive: true` on the iOS surface is weaker than its name promises: it will not relaunch the app,
but it cannot be trusted not to disturb what the user is doing.

**Rules that follow, until something better exists:**

1. Never read an iPhone while a person is driving it or a transfer is in flight. Ask them for a
   screenshot instead - it is the only genuinely zero-cost observation.
2. Automated iOS flows are fine, because there the harness IS the driver and nothing else is going on.
3. Android does not have this problem to the same degree: `adb shell uiautomator dump` reads the tree
   without touching the app, and only `session()`'s `monkey` launch foregrounds it, which `passive`
   now skips.

**Worth investigating:** whether an iOS read can be taken outside WDA entirely - the app could expose
its own state over a dev-only local endpoint, which the harness reads without going near the UI. That
would make observation free on every platform and is probably the right long-term answer for a suite
that has to watch journeys it is not driving.

---

## Model transfer: the sender says "sent", the receiver says "could not receive"

**Status:** partially fixed 2026-08-07. Found by looking at both screens during a real macOS -> iOS send.

**Symptom.** The Mac reported the model sent successfully. The iPhone reported the same transfer as
"could not receive / interrupted". Both screens were honest about their own side, and the user has no
way to know which to believe.

**Cause.** The sender decided completion from its own loop:

    await this.sendPackage({ ... })
    modelTransferJobs.update(job.id, { phase: 'completed' })   // unconditional

`advanceJob` already receives the receiver's status and maps `failed` onto the job - but the loop runs
afterwards and overwrote it. The reason completion lives in the loop is sound (a per-file `completed`
would end a two-file vision package after its primary), but it made the sender's "I pushed the bytes"
outrank the receiver's "they did not arrive".

**Fixed:** the loop no longer marks a job completed if it is already `failed`.

**Still open, and bigger:** "completed" on the sender still means *bytes pushed*, not *peer verified*.
The picker promises otherwise - "the receiving device verifies the complete model before it appears in
Models" - so the sender should wait for a receiver-side completion signal, and show something like
"sent, awaiting verification" until it arrives. Guarding against an already-failed job closes the
contradiction we saw; it does not make the sender's success mean what the copy says.

---

## A model package that fails midway leaves a working-looking text model

**Status:** open. Same session, same transfer.

A vision package is two files sent in order: `Qwen3.5-0.8B-Q4_K_M.gguf` (508 MB) then
`mmproj-Qwen3.5-0.8B-BF16.gguf` (198 MB). The transfer interrupted between them. The result on the
receiver:

- the primary is on disk, complete, and registered as a MODEL
- the projector never arrived, so nothing links one
- the model therefore presents as a plain text model, 508 MB, and loads happily
- Activity, on another screen, says the transfer failed

So a failed vision transfer silently produces a model that works and cannot see, and the only hint is
a failure notice somewhere else. A user who does not cross-check believes they have the model.

Package install needs to be atomic, or explicitly incomplete: either resume the missing file, or
present the model as needing repair (the vision-repair path already exists for a missing projector and
would fit exactly), or discard the partial package. What it must not do is register half a package as
a whole model of a different kind.

**Related and also open:** whether the interrupted projector left a partial file behind. That is flow
15 ("a failed receive discards the partial file"), still unverified.

---

## macOS Activity reports FILES, so a half-sent package reads as success

**Status:** open. Verified on screen and against the engine log, 2026-08-07.

A model package is several files. A vision model is two: the GGUF and its mmproj. Activity lists a row
per FILE and has no notion of the package, so a transfer that dies between files reads as a success.

Observed after a macOS -> iOS send of `unsloth/Qwen3.5-0.8B-GGUF` (`kind="vision" files=2`):

    Activity:  0 active - 0 queued - 0 failed
               Qwen3.5-0.8B-Q4_K_M.gguf    COMPLETED
               (no row for mmproj-Qwen3.5-0.8B-BF16.gguf at all)

The engine knew better. From the same session's log:

    13:06:39 INFO  pro:sync:send-model started
    13:07:28 ERROR request.failed error="device disconnected during transfer"
               at FileTransferManager.failOutgoing
               at SyncEngine._removeSession

So the send failed, the first file had already completed, the second never started, and Activity shows
one COMPLETED row and ZERO failures. The user is told the model went.

Meanwhile the receiver reports "could not receive / interrupted" AND registers the completed primary as
a plain 508 MB text model - see the half-package entry above. Between them, the two devices give three
different answers and none of them is "this vision model did not fully arrive".

**The missing file is missing from Failed too.** Confirmed on screen: the mmproj is not under Completed,
not under Failed, not queued. Nowhere. Transfer rows are created when a file STARTS, and the session
died before file 2 began - so the one file the user needed to know about is the only one the UI cannot
show. Absence is indistinguishable from "there was never a second file".

**Fix shape.** Two parts, and the first is the one that makes the failure visible at all:

1. **Enqueue every file of a package up front**, as `queued`, before any bytes move. Then a file that
   never starts is a visible unsent row rather than nothing, and it lands under Failed when the package
   fails. This alone would have shown the truth on this transfer.
2. **Make the package a first-class row**: N files, progress across the set, one status for the whole
   thing, with the per-file view underneath. The headline status has to be the package's, because that
   is the unit the user asked for.

Independently: `0 failed` next to a logged `request.failed` is its own bug - the failed job is not
reaching Activity even for the file that DID have a row.
