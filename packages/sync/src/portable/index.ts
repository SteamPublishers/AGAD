// @offgrid/sync/portable — the portable-bundle foundation: a versioned,
// app-agnostic envelope, the additive-merge import rule, and (de)serialization.
// Pure logic, zero I/O. Consumed by Off Grid Mobile and Desktop; file I/O and
// compression are the host app's job (injected adapters), never this module's.

export * from './types';
export * from './merge';
export * from './bundle';
export * from './engine';
