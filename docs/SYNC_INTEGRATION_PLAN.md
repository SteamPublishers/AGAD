# `@offgrid/sync` → Off Grid AI Desktop — implementation plan

Owner: the **desktop** lane. The **mobile** lane runs in parallel on the same engine package.
Status: plan. Nothing below is "done" until it is **verified through the real user path** — code
present + wired is not closure (same bar as `docs/GAPS_BACKLOG.md`).

## Scope (first cut, per product direction)

1. **State sync over the LAN** — chats / workspace / projects / model settings converge across a
   user's devices.
2. **Model transfer** — a model downloaded on one device can be moved to another (phone ↔ desktop).
3. **Ambient file sharing** — as designed in `../sync/docs/AMBIENT_SHARING.md` (policy + queue +
   watcher on top of the existing transport).

## Non-negotiable placement rules

| Thing                                                               | Where                                                                                                 | Why                                                                                         |
| ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Sync **engine** (crypto, pairing, wire protocol, transfer, op-log)  | `@offgrid/sync` in `shared/` — **public**                                                             | The encryption and wire format must be auditable. That is the whole point of publishing it. |
| Desktop **integration** of that engine (service, IPC, UI, settings) | `pro/` (the `desktop-pro` submodule)                                                                  | Sync is a **pro feature**. Core must not carry pro business logic.                          |
| Core's share                                                        | `proCatalog` entry + `locked: !isPro` nav item → `UpgradeScreen`; dimmed `ProPlaceholder` in Settings | The inert shell only.                                                                       |
| Pro renderer → main                                                 | generic `proInvoke` / `proOn` passthrough                                                             | Do **not** add per-feature namespaces to the core preload.                                  |

Commit order for pro changes: land in `desktop-pro` first, then bump the submodule pointer in
`desktop` with `git add pro`.

## Cross-lane contract (desktop ↔ mobile, read this first)

> Shared log both lanes update: **`shared/docs/SYNC_CROSS_LANE_LOG.md`** — the entity/channel/column
> contracts, per-lane progress, engine asks, and a corrections log. The authoritative design is
> `shared/docs/DESKTOP_SYNC_INTEGRATION_PLAN.md` (Track A free export/import in core, Track B pro
> sync in `pro/`).

The one guaranteed conflict is two sessions editing `shared/packages/sync`. Therefore:

- **The desktop lane consumes `@offgrid/sync` UNCHANGED.** It already builds and passes 24/24 tests.
- If desktop needs an engine change, it is raised as a **package-level ask** in this doc's
  "Engine asks" section rather than edited in place. The mobile lane does the same.
- Host adapters are injected, never assumed: `NodeTcpTransport` + `NodeDiscovery`
  (`bonjour-service`) on desktop; the RN TCP/Zeroconf modules on mobile. The package never imports
  either — that seam already exists (`src/adapters/{node,rn}-{tcp,discovery}.ts`) and must stay.

### Engine asks (raise here, do not hand-edit the package)

- ~~**A-1 (blocks M4, large models).**~~ **WITHDRAWN — not an engine gap.** Verified against the
  vendored build: the engine already exposes a streaming and an HTTP-accelerated vocabulary —
  `createFileRequestStreaming`, `createFileCompleteStreaming`, `createFileRequestHttp`,
  `createFileAcceptHttp`, `verifyFileIntegrity`. The in-memory `chunkFile` / `reassembleChunks`
  simply coexist with it. So this is a **host-wiring rule the desktop lane owns**, not a blocker on
  the other lane: **model transfer MUST use the streaming/HTTP path and must never call
  `chunkFile` / `reassembleChunks`** (an earlier in-memory cut was rejected for exactly this — see
  `AMBIENT_SHARING.md`). M4 is therefore **not blocked**.
- ~~**A-2 (ACK semantics).**~~ **RESTATED as a host-wiring rule.** `createFileAck` and
  `verifyFileIntegrity` exist in the engine, so the vocabulary is there. G-007 was a defect in
  _EasyShare's desktop_ resolve timing, not in the engine: it resolved `sendFile(true)` after
  emitting chunks rather than after peer confirmation. **Our integration must resolve only on a
  correlated positive ACK following the peer's durable write + integrity check**, and must surface
  negative ACKs. "Synced" that does not mean "written and verified on the peer" silently loses data.
- **A-3 (multi-device).** The transport is single-connection today; syncing to several devices needs
  concurrent connections. The policy layer already models a set of device ids, so this is transport
  work only.
- **A-4 (security, and this package is going PUBLIC).** G-001: bespoke iterated-SHA-512 passphrase
  derivation + hash challenge/response, and `sharedSecret` persisted in plaintext (electron-store /
  AsyncStorage). G-002: no payload-shape validation at the protocol boundary; peer-controlled
  messages are cast. Publishing "audit our crypto" while shipping a bespoke KDF and plaintext
  secrets invites the opposite conclusion. Should be fixed **before** the repo is public, and it is
  engine-level, so it belongs to whoever owns the package — not a desktop-lane side edit.

## Milestones

Each milestone states its **verification gate**. No milestone is done without it.

### M0 — Consume the engine (do NOT vendor it)

- **CORRECTED.** This originally said to copy `shared/packages/sync` → `desktop/packages/sync`,
  following the existing `@offgrid/clipboard|design|models|rag` convention. That is wrong:
  `shared/docs/DESKTOP_SYNC_INTEGRATION_PLAN.md` §1 says explicitly **do not duplicate
  `@offgrid/sync`** — reference it directly, as mobile does:
  `"@offgrid/sync": "file:../shared/packages/sync"`. The vendored copy was removed.
  (The other `desktop/packages/*` copies have silently drifted from `shared/`, which is the
  argument for the direct ref.)
- Add `@offgrid/sync` as a `file:./packages/sync` dep, plus `bonjour-service` (pure-JS mDNS, no
  native build) for `node-discovery`.
- **Gate:** `npx tsc --noEmit` clean on both tsconfigs; the package's own 24 tests pass from the
  vendored copy; `npm run build` produces a working bundle.

### M1 — Pairing + discovery + transport, headless and real

`pro/main/sync/`:

- `sync-service.ts` — composes `NodeDiscovery` + `NodeTcpTransport` + the engine. Owns lifecycle and
  teardown (no leaked sockets/timers).
- `sync-store.ts` — persistence behind a **small interface** (`getPairedDevices`, `addPairedDevice`,
  `getSettings`) so the service runs headless in tests. SQLite-backed impl satisfies it. This mirrors
  EasyShare's `ConnectionStorage` seam, which is what made its real test possible.
- Device cap enforced via the engine's `cap` export (2 free / 3+ paid).
- **Gate:** two real service instances pair over **real TCP loopback** in a test, exchange an
  encrypted message, and tear down cleanly. Fakes only at the persistence boundary. Falsify it:
  break the pairing check → test goes red.

### M2 — Devices surface + inert core shell

- `pro/renderer/screens/Devices.tsx` — discovered devices, pair/unpair, connection state, transfer
  list. Desktop-first density per `docs/DESIGN.md` (multi-column grid, not one row per 1900px line).
- Register the view through pro's view-router; register a Settings section via
  `registerProSettings`.
- Core: `proCatalog` entry + `locked: !isPro` nav item → `UpgradeScreen`. **No pro logic in core.**
- **Gate:** Playwright e2e asserts the surface renders; free build shows the locked upgrade screen;
  screenshots read and validated (not just captured) before they go in a PR.

### M3 — State sync: chat / projects / model settings converge ← **the "does it actually work" gate**

- Use the engine's `oplog` + `state-sync` (Lamport + last-writer-wins; already pure and tested).
- `pro/main/sync/state-bridge.ts` — maps desktop SQLite entities (chats, projects, model settings)
  to op-log records and applies inbound ops idempotently. Pure mapping isolated from I/O so it is
  unit-testable; the DB write is the thin edge.
- Conflict policy is the engine's LWW — do **not** re-implement it in the bridge (single source of
  truth, per the DRY rule).
- **Gate:** two real app instances on one machine, separate `OFFGRID_USER_DATA` profiles, pair over
  loopback; create a chat on A → it appears on B; edit the same record on both while "offline" →
  both converge to the same LWW winner. Asserted on the **UI**, not just the DB.

### M4 — Model transfer (NOT blocked; use the engine's streaming/HTTP path — see A-1)

- Move a downloaded model between devices: streaming, resumable, checksum-verified, and registered
  in the receiver's model catalog (`models/` + `active-model.json`) so it is immediately usable.
- Must not buffer whole files (A-1). Reuse EasyShare's proven streaming + HTTP-accelerated path.
- **Gate:** a real multi-GB-class transfer lands byte-identical (checksum) and the receiving app can
  load the model. Interrupt mid-transfer → resumes or fails cleanly, never a corrupt half-model
  presented as usable.

### M5 — Ambient file sharing (needs the `sharing/*` layer in the engine)

The policy / queue / watcher layer currently lives in the **sync repo** under `@easyshare/shared`,
**not** in `@offgrid/sync`. Porting it is an engine change → coordinate, do not hand-edit.
Then: compose watcher → policy → `FileSender` (over the sync transport) in `pro/main/`, plus the
share-mode matrix in Settings. macOS watcher at the OS boundary
(`NSMetadataQuery` on `kMDItemIsScreenCapture` + FSEvents), every event through `shouldEmit`
(dedup + anti-loop on the app's own save dir).

- **Gate:** an observed screenshot reaches the paired peer with no user interaction, is **not**
  re-shared on receipt, and `off` genuinely sends nothing.

## Risks

- **Vendoring drift.** `desktop/packages/*` copies already differ from `shared/`. Record the source
  commit; re-vendor deliberately.
- **Two lanes, one engine.** Mitigated by the contract above; the engine asks are the pressure valve.
- **Sync that silently loses data** is worse than no sync. A-2 (ACK semantics) is the reason M3's
  gate asserts convergence on the UI of a second real instance rather than trusting a resolved promise.
- **Pro submodule flow.** Land in `desktop-pro` first, then bump the pointer; never commit pro source
  into the public repo.

## Immediate next action

M0, then M1's loopback pairing test — that test is the cheapest honest answer to "does the sync
actually work", and everything after it builds on the same seam.
