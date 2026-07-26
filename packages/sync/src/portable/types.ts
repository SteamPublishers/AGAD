// Portable bundle — the versioned, app-agnostic envelope + merge contract that
// backs export / import today and, later, device-to-device transfer of the SAME
// bundle over this package's transport (export -> transfer -> import).
//
// The envelope machinery lives here so Off Grid Desktop and Off Grid Mobile
// share one on-disk/on-wire format and can recognize each other's bundles.
// Each app's *payload* differs (their Project / Conversation shapes are not the
// same, and one may carry workspaces the other lacks), so a bundle is GENERIC
// over its `data`. This package owns format + version + merge + (de)serialize;
// the app owns its payload section types and their validation.

/** Stable format discriminator. A file whose `format` differs is rejected. */
export const BUNDLE_FORMAT = 'offgrid-backup' as const;

/** Envelope version. Bump when the envelope shape changes incompatibly. */
export const BUNDLE_VERSION = 1 as const;

/** Anything mergeable by stable id (projects, conversations, images, ...). */
export interface HasId {
  id: string;
}

export interface MergeResult<T> {
  /** existing followed by the newly-added items, in incoming order. */
  merged: T[];
  /** ids that were actually added (not already present). */
  addedIds: string[];
}

/**
 * A portable bundle: a stable header plus an app-defined `data` payload.
 * `T` is the app's payload shape. The header is identical across apps so a
 * bundle produced by one surface is recognizable by another.
 */
export interface PortableBundle<T> {
  format: typeof BUNDLE_FORMAT;
  version: number;
  /** ISO timestamp of export. */
  exportedAt: string;
  data: T;
}

/** Thrown when a file is not a valid/compatible bundle. Message is user-facing. */
export class BundleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BundleError';
  }
}
