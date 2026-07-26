/** Stable format discriminator. A file whose `format` differs is rejected. */
declare const BUNDLE_FORMAT: "offgrid-backup";
/** Envelope version. Bump when the envelope shape changes incompatibly. */
declare const BUNDLE_VERSION: 1;
/** Anything mergeable by stable id (projects, conversations, images, ...). */
interface HasId {
    id: string;
}
interface MergeResult<T> {
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
interface PortableBundle<T> {
    format: typeof BUNDLE_FORMAT;
    version: number;
    /** ISO timestamp of export. */
    exportedAt: string;
    data: T;
}
/** Thrown when a file is not a valid/compatible bundle. Message is user-facing. */
declare class BundleError extends Error {
    constructor(message: string);
}

/**
 * Additive, non-destructive merge by id — the single import rule for every
 * record type. Incoming items whose id is not already present (and not
 * duplicated within the incoming batch itself) are appended; existing ids are
 * left untouched. It NEVER deletes or overwrites, so importing a backup can
 * only ever add what is missing. Defined once here and reused by every store's
 * import path so the semantics can never drift between record types.
 */
declare function mergeById<T extends HasId>(existing: T[], incoming: T[]): MergeResult<T>;

interface CreateBundleInput<T> {
    data: T;
    /** ISO timestamp — the caller supplies the clock; this code takes none. */
    exportedAt: string;
    /** Defaults to the current BUNDLE_VERSION. */
    version?: number;
}
/** Assemble a versioned bundle around an app payload. Pure. */
declare function createBundle<T>(input: CreateBundleInput<T>): PortableBundle<T>;
/** Serialize a bundle to the JSON text written to a file / sent over the wire. */
declare function serializeBundle<T>(bundle: PortableBundle<T>): string;
interface ParseBundleOptions<T> {
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
declare function parseBundle<T>(raw: string, opts: ParseBundleOptions<T>): PortableBundle<T>;

/** A file the payload points at, paired with the bundle-relative key it travels under. */
interface FileRef {
    /** Path INSIDE the bundle, e.g. "files/img-0.png". */
    key: string;
    /** On-device absolute path/uri to read from on export (or read back on import). */
    sourcePath: string;
}
/**
 * Pure mapping between a payload's on-device file paths and bundle-relative keys.
 * The app implements this because only it knows which fields carry file paths;
 * it stays pure (no I/O) so it is unit-testable. `extract` (export) lists the
 * files and returns a copy of the payload with paths replaced by keys; `listKeys`
 * reads the keys back out of a keyed payload (import); `restore` swaps keys for
 * the real restored paths.
 */
interface FileMapper<T> {
    extract(data: T): {
        files: FileRef[];
        keyed: T;
    };
    listKeys(keyed: T): string[];
    restore(keyed: T, keyToPath: Record<string, string>): T;
}
/**
 * Host filesystem + archive I/O. All the platform-specific, on-device work of
 * assembling a zip and reading it back. Absolute paths throughout.
 */
interface ArchivePort {
    /** A fresh empty directory to assemble a bundle in. */
    stageDir(): Promise<string>;
    writeText(absPath: string, text: string): Promise<void>;
    readText(absPath: string): Promise<string>;
    /** Copy a source file to an absolute dest path, creating parent dirs. */
    copyInto(srcPath: string, destAbsPath: string): Promise<void>;
    /** Zip the CONTENTS of stageDir into an archive; return its path. */
    pack(stageDir: string, suggestedName: string): Promise<string>;
    /** Unzip an archive into a fresh dir; return that dir. */
    unpack(archivePath: string): Promise<string>;
    /** The permanent on-device path a restored file with this key should live at. */
    restorePathFor(key: string): string;
    join(...parts: string[]): string;
}
/**
 * Host access to the app's data. Every store / SQLite read and every additive
 * write lives behind this port. `T` = the app's payload shape; `S` = its restore
 * summary.
 */
interface BackupDataPort<T, S> {
    collectAll(): Promise<T>;
    collectProject(projectId: string): Promise<T | null>;
    collectConversation(conversationId: string): Promise<T | null>;
    validate(data: unknown): T;
    apply(data: T): Promise<S>;
}
/** Host sink: how the finished bundle FILE leaves the device and how one is picked back. */
interface BackupSink<D> {
    /** Hand a finished bundle file (already written at absPath) to the user. */
    deliverFile(absPath: string, suggestedName: string): Promise<D>;
    /** Pick a bundle file; return a readable local path to it, or null if cancelled. */
    pickFile(): Promise<string | null>;
}
/** Turn an ISO timestamp into a filename-safe stamp. Pure. */
declare const fileStamp: (iso: string) => string;
/** The name of the envelope entry inside every bundle zip. */
declare const ENVELOPE_ENTRY = "backup.json";
/**
 * The engine. Constructed with the four ports + an injected clock (`now`) so the
 * core stays free of `Date`. Export assembles a zip (envelope + files) and
 * delivers it; import unpacks a zip, restores files, and applies additively.
 */
declare class BackupEngine<T, S, D> {
    private readonly data;
    private readonly files;
    private readonly archive;
    private readonly sink;
    private readonly now;
    constructor(data: BackupDataPort<T, S>, files: FileMapper<T>, archive: ArchivePort, sink: BackupSink<D>, now: () => string);
    private exportBundle;
    /** Export everything. */
    exportAll: () => Promise<D | null>;
    /** Export one project (its chats + knowledge base). Null if the project is gone. */
    exportProject: (projectId: string) => Promise<D | null>;
    /** Export one conversation, self-contained. Null if the conversation is gone. */
    exportConversation: (conversationId: string) => Promise<D | null>;
    /** Pick a bundle, restore its files, and apply it additively. Null if cancelled. */
    import(): Promise<S | null>;
    /**
     * Restore + apply a bundle at a known local path, WITHOUT the picker. This is
     * the receiver side of device-to-device sharing: a peer pushes a bundle file,
     * the transport saves it locally, and this applies it — the same unpack →
     * restore-files → rewrite → apply flow `import()` uses after picking.
     */
    importPath(archivePath: string): Promise<S>;
}

export { type ArchivePort, BUNDLE_FORMAT, BUNDLE_VERSION, type BackupDataPort, BackupEngine, type BackupSink, BundleError, type CreateBundleInput, ENVELOPE_ENTRY, type FileMapper, type FileRef, type HasId, type MergeResult, type ParseBundleOptions, type PortableBundle, createBundle, fileStamp, mergeById, parseBundle, serializeBundle };
