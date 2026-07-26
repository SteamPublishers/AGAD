import { BUNDLE_FORMAT, BUNDLE_VERSION, BundleError } from './types';
import type { PortableBundle } from './types';

export interface CreateBundleInput<T> {
  data: T;
  /** ISO timestamp — the caller supplies the clock; this code takes none. */
  exportedAt: string;
  /** Defaults to the current BUNDLE_VERSION. */
  version?: number;
}

/** Assemble a versioned bundle around an app payload. Pure. */
export function createBundle<T>(input: CreateBundleInput<T>): PortableBundle<T> {
  return {
    format: BUNDLE_FORMAT,
    version: input.version ?? BUNDLE_VERSION,
    exportedAt: input.exportedAt,
    data: input.data,
  };
}

/** Serialize a bundle to the JSON text written to a file / sent over the wire. */
export function serializeBundle<T>(bundle: PortableBundle<T>): string {
  return JSON.stringify(bundle, null, 2);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export interface ParseBundleOptions<T> {
  /** Expected envelope version; a mismatch throws a user-facing BundleError. */
  expectedVersion?: number;
  /**
   * App payload validator. Receives the raw `data` and returns the typed
   * payload (or throws a BundleError with a user-facing message). The shared
   * core validates only the envelope; payload shape is the app's business.
   */
  validateData: (data: unknown) => T;
}

/**
 * Parse + validate bundle JSON. Checks the format discriminator and version —
 * the shared envelope contract — then hands the payload to the app-supplied
 * validator. Throws BundleError with a user-facing message on any problem.
 */
export function parseBundle<T>(raw: string, opts: ParseBundleOptions<T>): PortableBundle<T> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new BundleError('This file is not a valid backup (could not read it as JSON).');
  }
  if (!isObject(parsed)) {
    throw new BundleError('This file is not a valid Off Grid backup.');
  }
  if (parsed.format !== BUNDLE_FORMAT) {
    throw new BundleError('This file is not an Off Grid backup.');
  }
  const expected = opts.expectedVersion ?? BUNDLE_VERSION;
  if (parsed.version !== expected) {
    throw new BundleError(
      `This backup was made by a different app version (backup v${String(parsed.version)}, expected v${expected}).`,
    );
  }
  const data = opts.validateData((parsed as { data: unknown }).data);
  return {
    format: BUNDLE_FORMAT,
    version: expected,
    exportedAt: typeof parsed.exportedAt === 'string' ? parsed.exportedAt : '',
    data,
  };
}
