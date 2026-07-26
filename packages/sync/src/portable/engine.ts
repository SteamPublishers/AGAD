import { createBundle, serializeBundle, parseBundle } from './bundle';

// The shared export / import ENGINE. It owns the flow every Off Grid app needs —
// collect the app's data, move the files it points at into a zip alongside a
// backup.json envelope, hand the zip to a sink; and on restore, unpack the zip,
// copy the files back onto the device, rewrite the payload's paths, and apply it
// additively. Zero platform code: store/DB access, file/zip I/O, path rewriting,
// and the clock are all injected through the ports below, so the flow (and its
// correctness) is written and tested once here and inherited by mobile + desktop.

/** A file the payload points at, paired with the bundle-relative key it travels under. */
export interface FileRef {
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
export interface FileMapper<T> {
  extract(data: T): { files: FileRef[]; keyed: T };
  listKeys(keyed: T): string[];
  restore(keyed: T, keyToPath: Record<string, string>): T;
}

/**
 * Host filesystem + archive I/O. All the platform-specific, on-device work of
 * assembling a zip and reading it back. Absolute paths throughout.
 */
export interface ArchivePort {
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
export interface BackupDataPort<T, S> {
  collectAll(): Promise<T>;
  collectProject(projectId: string): Promise<T | null>;
  collectConversation(conversationId: string): Promise<T | null>;
  validate(data: unknown): T;
  apply(data: T): Promise<S>;
}

/** Host sink: how the finished bundle FILE leaves the device and how one is picked back. */
export interface BackupSink<D> {
  /** Hand a finished bundle file (already written at absPath) to the user. */
  deliverFile(absPath: string, suggestedName: string): Promise<D>;
  /** Pick a bundle file; return a readable local path to it, or null if cancelled. */
  pickFile(): Promise<string | null>;
}

/** Turn an ISO timestamp into a filename-safe stamp. Pure. */
export const fileStamp = (iso: string): string => iso.replaceAll(/[:.]/g, '-');

/** The name of the envelope entry inside every bundle zip. */
export const ENVELOPE_ENTRY = 'backup.json';

/**
 * The engine. Constructed with the four ports + an injected clock (`now`) so the
 * core stays free of `Date`. Export assembles a zip (envelope + files) and
 * delivers it; import unpacks a zip, restores files, and applies additively.
 */
export class BackupEngine<T, S, D> {
  constructor(
    private readonly data: BackupDataPort<T, S>,
    private readonly files: FileMapper<T>,
    private readonly archive: ArchivePort,
    private readonly sink: BackupSink<D>,
    private readonly now: () => string,
  ) {}

  private async exportBundle(prefix: string, payload: T | null): Promise<D | null> {
    if (payload == null) return null;
    const { files: refs, keyed } = this.files.extract(payload);
    const exportedAt = this.now();
    const stage = await this.archive.stageDir();
    await this.archive.writeText(
      this.archive.join(stage, ENVELOPE_ENTRY),
      serializeBundle(createBundle<T>({ data: keyed, exportedAt })),
    );
    for (const ref of refs) {
      await this.archive.copyInto(ref.sourcePath, this.archive.join(stage, ref.key));
    }
    const name = `${prefix}-${fileStamp(exportedAt)}.zip`;
    const zipPath = await this.archive.pack(stage, name);
    return this.sink.deliverFile(zipPath, name);
  }

  /** Export everything. */
  exportAll = (): Promise<D | null> =>
    this.data.collectAll().then((d) => this.exportBundle('offgrid-backup', d));

  /** Export one project (its chats + knowledge base). Null if the project is gone. */
  exportProject = (projectId: string): Promise<D | null> =>
    this.data.collectProject(projectId).then((d) => this.exportBundle('offgrid-project', d));

  /** Export one conversation, self-contained. Null if the conversation is gone. */
  exportConversation = (conversationId: string): Promise<D | null> =>
    this.data.collectConversation(conversationId).then((d) => this.exportBundle('offgrid-chat', d));

  /** Pick a bundle, restore its files, and apply it additively. Null if cancelled. */
  async import(): Promise<S | null> {
    const picked = await this.sink.pickFile();
    if (picked == null) return null;
    return this.importPath(picked);
  }

  /**
   * Restore + apply a bundle at a known local path, WITHOUT the picker. This is
   * the receiver side of device-to-device sharing: a peer pushes a bundle file,
   * the transport saves it locally, and this applies it — the same unpack →
   * restore-files → rewrite → apply flow `import()` uses after picking.
   */
  async importPath(archivePath: string): Promise<S> {
    const dir = await this.archive.unpack(archivePath);
    const raw = await this.archive.readText(this.archive.join(dir, ENVELOPE_ENTRY));
    const bundle = parseBundle<T>(raw, { validateData: (d) => this.data.validate(d) });
    const keyed = bundle.data;

    // Copy every bundled file back onto the device, then rewrite the payload's
    // keys to the real restored paths so apply() writes valid on-device paths.
    const keyToPath: Record<string, string> = {};
    for (const key of this.files.listKeys(keyed)) {
      const dest = this.archive.restorePathFor(key);
      await this.archive.copyInto(this.archive.join(dir, key), dest);
      keyToPath[key] = dest;
    }
    const restored = this.files.restore(keyed, keyToPath);
    return this.data.apply(restored);
  }
}
