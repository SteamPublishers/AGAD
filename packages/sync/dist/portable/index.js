"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/portable/index.ts
var portable_exports = {};
__export(portable_exports, {
  BUNDLE_FORMAT: () => BUNDLE_FORMAT,
  BUNDLE_VERSION: () => BUNDLE_VERSION,
  BackupEngine: () => BackupEngine,
  BundleError: () => BundleError,
  ENVELOPE_ENTRY: () => ENVELOPE_ENTRY,
  createBundle: () => createBundle,
  fileStamp: () => fileStamp,
  mergeById: () => mergeById,
  parseBundle: () => parseBundle,
  serializeBundle: () => serializeBundle
});
module.exports = __toCommonJS(portable_exports);

// src/portable/types.ts
var BUNDLE_FORMAT = "offgrid-backup";
var BUNDLE_VERSION = 1;
var BundleError = class extends Error {
  constructor(message) {
    super(message);
    this.name = "BundleError";
  }
};

// src/portable/merge.ts
function mergeById(existing, incoming) {
  const existingIds = new Set(existing.map((item) => item.id));
  const additions = [];
  const addedIds = [];
  const seenIncoming = /* @__PURE__ */ new Set();
  for (const item of incoming) {
    if (existingIds.has(item.id) || seenIncoming.has(item.id)) continue;
    seenIncoming.add(item.id);
    additions.push(item);
    addedIds.push(item.id);
  }
  return { merged: [...existing, ...additions], addedIds };
}

// src/portable/bundle.ts
function createBundle(input) {
  return {
    format: BUNDLE_FORMAT,
    version: input.version ?? BUNDLE_VERSION,
    exportedAt: input.exportedAt,
    data: input.data
  };
}
function serializeBundle(bundle) {
  return JSON.stringify(bundle, null, 2);
}
function isObject(value) {
  return typeof value === "object" && value !== null;
}
function parseBundle(raw, opts) {
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new BundleError("This file is not a valid backup (could not read it as JSON).");
  }
  if (!isObject(parsed)) {
    throw new BundleError("This file is not a valid Off Grid backup.");
  }
  if (parsed.format !== BUNDLE_FORMAT) {
    throw new BundleError("This file is not an Off Grid backup.");
  }
  const expected = opts.expectedVersion ?? BUNDLE_VERSION;
  if (parsed.version !== expected) {
    throw new BundleError(
      `This backup was made by a different app version (backup v${String(parsed.version)}, expected v${expected}).`
    );
  }
  const data = opts.validateData(parsed.data);
  return {
    format: BUNDLE_FORMAT,
    version: expected,
    exportedAt: typeof parsed.exportedAt === "string" ? parsed.exportedAt : "",
    data
  };
}

// src/portable/engine.ts
var fileStamp = (iso) => iso.replaceAll(/[:.]/g, "-");
var ENVELOPE_ENTRY = "backup.json";
var BackupEngine = class {
  constructor(data, files, archive, sink, now) {
    this.data = data;
    this.files = files;
    this.archive = archive;
    this.sink = sink;
    this.now = now;
  }
  data;
  files;
  archive;
  sink;
  now;
  async exportBundle(prefix, payload) {
    if (payload == null) return null;
    const { files: refs, keyed } = this.files.extract(payload);
    const exportedAt = this.now();
    const stage = await this.archive.stageDir();
    await this.archive.writeText(
      this.archive.join(stage, ENVELOPE_ENTRY),
      serializeBundle(createBundle({ data: keyed, exportedAt }))
    );
    for (const ref of refs) {
      await this.archive.copyInto(ref.sourcePath, this.archive.join(stage, ref.key));
    }
    const name = `${prefix}-${fileStamp(exportedAt)}.zip`;
    const zipPath = await this.archive.pack(stage, name);
    return this.sink.deliverFile(zipPath, name);
  }
  /** Export everything. */
  exportAll = () => this.data.collectAll().then((d) => this.exportBundle("offgrid-backup", d));
  /** Export one project (its chats + knowledge base). Null if the project is gone. */
  exportProject = (projectId) => this.data.collectProject(projectId).then((d) => this.exportBundle("offgrid-project", d));
  /** Export one conversation, self-contained. Null if the conversation is gone. */
  exportConversation = (conversationId) => this.data.collectConversation(conversationId).then((d) => this.exportBundle("offgrid-chat", d));
  /** Pick a bundle, restore its files, and apply it additively. Null if cancelled. */
  async import() {
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
  async importPath(archivePath) {
    const dir = await this.archive.unpack(archivePath);
    const raw = await this.archive.readText(this.archive.join(dir, ENVELOPE_ENTRY));
    const bundle = parseBundle(raw, { validateData: (d) => this.data.validate(d) });
    const keyed = bundle.data;
    const keyToPath = {};
    for (const key of this.files.listKeys(keyed)) {
      const dest = this.archive.restorePathFor(key);
      await this.archive.copyInto(this.archive.join(dir, key), dest);
      keyToPath[key] = dest;
    }
    const restored = this.files.restore(keyed, keyToPath);
    return this.data.apply(restored);
  }
};
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  BUNDLE_FORMAT,
  BUNDLE_VERSION,
  BackupEngine,
  BundleError,
  ENVELOPE_ENTRY,
  createBundle,
  fileStamp,
  mergeById,
  parseBundle,
  serializeBundle
});
