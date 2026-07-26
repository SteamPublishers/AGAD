// Real tests for the zip-flow BackupEngine, driven through fake-but-real ports
// (an in-memory archive that records every op, a real FileMapper that rewrites a
// path field, a recording sink) — NOT mocks of the engine's own logic. Deleting
// the flow fails these: export must stage a backup.json whose payload has its
// file path swapped for a bundle KEY, copy the real file under that key, pack a
// .zip, and deliver it; import must unpack, restore each keyed file to a real
// path, rewrite the payload back to real paths, and apply it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BackupEngine, createBundle, serializeBundle } from '../dist/portable/index.js';

const NOW = '2026-07-09T12:00:00.000Z';

// A real FileMapper for the payload shape { marker, file }: `file` is the one
// file-bearing field. extract lists it + returns a keyed copy; restore swaps back.
const fileMapper = {
  extract(data) {
    if (data.file) {
      return { files: [{ key: 'files/f0', sourcePath: data.file }], keyed: { ...data, file: 'files/f0' } };
    }
    return { files: [], keyed: data };
  },
  listKeys(keyed) {
    return typeof keyed.file === 'string' && keyed.file.startsWith('files/') ? [keyed.file] : [];
  },
  restore(keyed, keyToPath) {
    return { ...keyed, file: keyToPath[keyed.file] ?? keyed.file };
  },
};

function makeData() {
  const applied = [];
  return {
    applied,
    async collectAll() {
      return { marker: 'all', file: '/real/a.png' };
    },
    async collectProject(id) {
      return id === 'p1' ? { marker: 'p1', file: '' } : null; // no file -> empty
    },
    async collectConversation() {
      return { marker: 'c', file: '' };
    },
    validate(d) {
      if (typeof d !== 'object' || d === null) throw new Error('bad payload');
      return d;
    },
    async apply(d) {
      applied.push(d);
      return { ok: true };
    },
  };
}

// In-memory archive recording every operation. Text files land in `writes`;
// copies are recorded; pack/unpack return synthetic paths.
function makeArchive(seed = {}) {
  let n = 0;
  const ops = { writes: { ...seed }, copies: [], packed: null, unpacked: null };
  return {
    ops,
    async stageDir() {
      return `/stage${n++}`;
    },
    async writeText(p, t) {
      ops.writes[p] = t;
    },
    async readText(p) {
      return ops.writes[p];
    },
    async copyInto(src, dest) {
      ops.copies.push({ src, dest });
    },
    async pack(dir, name) {
      ops.packed = { dir, name };
      return `/out/${name}`;
    },
    async unpack(archivePath) {
      ops.unpacked = archivePath;
      return '/unpack';
    },
    restorePathFor(key) {
      return `/restored/${key}`;
    },
    join(...parts) {
      return parts.join('/');
    },
  };
}

function makeSink(pickPath = null) {
  const delivered = [];
  return { delivered, async deliverFile(absPath, name) { delivered.push({ absPath, name }); return { path: absPath }; }, async pickFile() { return pickPath; } };
}

test('exportAll stages a keyed envelope, copies the real file under its key, packs + delivers a .zip', async () => {
  const data = makeData();
  const archive = makeArchive();
  const sink = makeSink();
  const engine = new BackupEngine(data, fileMapper, archive, sink, () => NOW);

  const result = await engine.exportAll();
  assert.deepEqual(result, { path: '/out/offgrid-backup-2026-07-09T12-00-00-000Z.zip' });

  // backup.json in the stage carries the payload with the path swapped for a KEY.
  const raw = archive.ops.writes['/stage0/backup.json'];
  assert.ok(raw, 'backup.json written to the stage dir');
  const bundle = JSON.parse(raw);
  assert.equal(bundle.data.file, 'files/f0'); // path rewritten to bundle key
  assert.equal(bundle.data.marker, 'all');

  // the real file was copied under its key inside the stage.
  assert.deepEqual(archive.ops.copies, [{ src: '/real/a.png', dest: '/stage0/files/f0' }]);
  assert.equal(archive.ops.packed.name, 'offgrid-backup-2026-07-09T12-00-00-000Z.zip');
  assert.deepEqual(sink.delivered, [{ absPath: '/out/offgrid-backup-2026-07-09T12-00-00-000Z.zip', name: 'offgrid-backup-2026-07-09T12-00-00-000Z.zip' }]);
});

test('a payload with no files still packs (envelope only), no copies', async () => {
  const archive = makeArchive();
  const engine = new BackupEngine(makeData(), fileMapper, archive, makeSink(), () => NOW);
  const result = await engine.exportProject('p1');
  assert.ok(result.path.startsWith('/out/offgrid-project-'));
  assert.equal(archive.ops.copies.length, 0);
});

test('exportProject returns null (packs nothing) for a missing project', async () => {
  const archive = makeArchive();
  const engine = new BackupEngine(makeData(), fileMapper, archive, makeSink(), () => NOW);
  assert.equal(await engine.exportProject('missing'), null);
  assert.equal(archive.ops.packed, null);
});

test('import unpacks, restores the keyed file to a real path, rewrites + applies', async () => {
  // Seed the archive so unpack->/unpack has a backup.json holding a KEYED payload.
  const keyedBundle = serializeBundle(createBundle({ data: { marker: 'x', file: 'files/f0' }, exportedAt: NOW }));
  const archive = makeArchive({ '/unpack/backup.json': keyedBundle });
  const data = makeData();
  const engine = new BackupEngine(data, fileMapper, archive, makeSink('/picked.zip'), () => NOW);

  const summary = await engine.import();
  assert.deepEqual(summary, { ok: true });
  assert.equal(archive.ops.unpacked, '/picked.zip');
  // the bundled file was copied out to its restore path...
  assert.deepEqual(archive.ops.copies, [{ src: '/unpack/files/f0', dest: '/restored/files/f0' }]);
  // ...and apply received the payload with the key rewritten to that real path.
  assert.deepEqual(data.applied, [{ marker: 'x', file: '/restored/files/f0' }]);
});

test('import returns null and applies nothing when the picker is cancelled', async () => {
  const data = makeData();
  const engine = new BackupEngine(data, fileMapper, makeArchive(), makeSink(null), () => NOW);
  assert.equal(await engine.import(), null);
  assert.equal(data.applied.length, 0);
});

// A round-trip-capable in-memory archive: pack snapshots a stage dir's entries,
// unpack restores them into a fresh dir. This lets one engine's exported bundle
// be imported by another through the same archive — the "wire" between devices.
function makeRoundTripArchive() {
  const files = new Map();
  const zips = new Map();
  let n = 0;
  return {
    files,
    async stageDir() { return `/stage${n++}`; },
    async writeText(p, t) { files.set(p, t); },
    async readText(p) { return files.get(p); },
    async copyInto(src, dest) { files.set(dest, files.get(src) ?? `COPY:${src}`); },
    async pack(dir, name) {
      const entries = [];
      for (const [p, c] of files) if (p.startsWith(`${dir}/`)) entries.push({ rel: p.slice(dir.length + 1), content: c });
      const zip = `/out/${name}`;
      zips.set(zip, entries);
      return zip;
    },
    async unpack(zip) {
      const dir = `/unpack${n++}`;
      for (const { rel, content } of zips.get(zip)) files.set(`${dir}/${rel}`, content);
      return dir;
    },
    restorePathFor(key) { return `/restored/${key}`; },
    join(...parts) { return parts.join('/'); },
  };
}

test('round-trip: a bundle exported on device A imports + applies on device B (the share model)', async () => {
  const wire = makeRoundTripArchive(); // shared "wire" both devices see

  // Device A exports; capture the zip it produced.
  let zipPath;
  const sinkA = { async deliverFile(p) { zipPath = p; return { path: p }; }, async pickFile() { return null; } };
  await new BackupEngine(makeData(), fileMapper, wire, sinkA, () => NOW).exportAll();
  assert.ok(zipPath.endsWith('.zip'));

  // Device B receives that zip and imports it.
  const dataB = makeData();
  const sinkB = { async deliverFile() { throw new Error('n/a'); }, async pickFile() { return zipPath; } };
  const summary = await new BackupEngine(dataB, fileMapper, wire, sinkB, () => NOW).import();

  assert.deepEqual(summary, { ok: true });
  // B applied A's payload, with the bundled file restored to a real local path.
  assert.equal(dataB.applied[0].marker, 'all');
  assert.equal(dataB.applied[0].file, '/restored/files/f0');
});

test('importPath applies a pushed bundle from a known path, no picker (receiver side)', async () => {
  const keyedBundle = serializeBundle(createBundle({ data: { marker: 'pushed', file: 'files/f0' }, exportedAt: NOW }));
  const archive = makeArchive({ '/unpack/backup.json': keyedBundle });
  const data = makeData();
  const engine = new BackupEngine(data, fileMapper, archive, makeSink(null), () => NOW);

  const summary = await engine.importPath('/received/backup.zip');
  assert.deepEqual(summary, { ok: true });
  assert.equal(archive.ops.unpacked, '/received/backup.zip'); // unpacked the given path, not a picked one
  assert.deepEqual(data.applied[0], { marker: 'pushed', file: '/restored/files/f0' });
});

test('import surfaces a bad-payload rejection from the data port validator', async () => {
  const badBundle = serializeBundle(createBundle({ data: 42, exportedAt: NOW }));
  const archive = makeArchive({ '/unpack/backup.json': badBundle });
  const data = makeData();
  const engine = new BackupEngine(data, fileMapper, archive, makeSink('/x.zip'), () => NOW);
  await assert.rejects(() => engine.import(), /bad payload/);
  assert.equal(data.applied.length, 0);
});
