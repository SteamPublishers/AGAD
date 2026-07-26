import type { HasId, MergeResult } from './types';

/**
 * Additive, non-destructive merge by id — the single import rule for every
 * record type. Incoming items whose id is not already present (and not
 * duplicated within the incoming batch itself) are appended; existing ids are
 * left untouched. It NEVER deletes or overwrites, so importing a backup can
 * only ever add what is missing. Defined once here and reused by every store's
 * import path so the semantics can never drift between record types.
 */
export function mergeById<T extends HasId>(existing: T[], incoming: T[]): MergeResult<T> {
  const existingIds = new Set(existing.map((item) => item.id));
  const additions: T[] = [];
  const addedIds: string[] = [];
  const seenIncoming = new Set<string>();
  for (const item of incoming) {
    if (existingIds.has(item.id) || seenIncoming.has(item.id)) continue;
    seenIncoming.add(item.id);
    additions.push(item);
    addedIds.push(item.id);
  }
  return { merged: [...existing, ...additions], addedIds };
}
