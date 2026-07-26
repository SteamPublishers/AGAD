import { callHook, HOOKS } from './bootstrap/hookRegistry'

/**
 * Stable desktop entity names shared by the core writers and the private sync materializer.
 * Values are wire identities, so changing one requires a cross-platform migration.
 */
export const CORE_SYNC_ENTITIES = {
  conversation: 'conversation',
  message: 'message',
  project: 'project'
} as const

export type CoreSyncEntity = (typeof CORE_SYNC_ENTITIES)[keyof typeof CORE_SYNC_ENTITIES]

export interface SyncMutation {
  entity: CoreSyncEntity
  entityId: string
  kind: 'put' | 'delete'
}

/**
 * Core owns its committed writes; Pro optionally records them. Free builds register no hook, so
 * this is an inert call with no sync engine or Pro business logic in the public application.
 */
export function emitSyncMutation(mutation: SyncMutation): void {
  try {
    callHook(HOOKS.syncRecordLocalMutation, mutation)
  } catch (error) {
    console.error('[sync] Failed to record committed mutation', mutation, error)
  }
}
