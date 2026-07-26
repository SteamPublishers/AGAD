// Real tests for the portable-bundle core, exercised through the built dist
// (matching this package's node:test convention). Pure logic, so every branch
// is covered directly: the additive-merge rule (add / skip-existing /
// dedup-incoming) and the envelope round-trip + every rejection path.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  mergeById,
  createBundle,
  serializeBundle,
  parseBundle,
  BUNDLE_FORMAT,
  BUNDLE_VERSION,
  BundleError,
} from '../dist/portable/index.js';

test('mergeById appends only genuinely-new ids', () => {
  const existing = [{ id: 'a' }, { id: 'b' }];
  const incoming = [{ id: 'b' }, { id: 'c' }, { id: 'd' }];
  const { merged, addedIds } = mergeById(existing, incoming);
  assert.deepEqual(
    merged.map((x) => x.id),
    ['a', 'b', 'c', 'd'],
  );
  assert.deepEqual(addedIds, ['c', 'd']);
});

test('mergeById never removes or overwrites an existing item', () => {
  const existing = [{ id: 'a', v: 1 }];
  const incoming = [{ id: 'a', v: 2 }]; // same id, different content
  const { merged, addedIds } = mergeById(existing, incoming);
  assert.deepEqual(merged, [{ id: 'a', v: 1 }]); // original kept, not clobbered
  assert.deepEqual(addedIds, []);
});

test('mergeById dedups repeated ids within the incoming batch', () => {
  const { merged, addedIds } = mergeById([], [{ id: 'x' }, { id: 'x' }]);
  assert.deepEqual(
    merged.map((x) => x.id),
    ['x'],
  );
  assert.deepEqual(addedIds, ['x']);
});

test('createBundle + serialize + parse round-trips the payload', () => {
  const data = { projects: [{ id: 'p1' }], note: 'hi' };
  const bundle = createBundle({ data, exportedAt: '2026-07-09T00:00:00.000Z' });
  assert.equal(bundle.format, BUNDLE_FORMAT);
  assert.equal(bundle.version, BUNDLE_VERSION);

  const parsed = parseBundle(serializeBundle(bundle), { validateData: (d) => d });
  assert.deepEqual(parsed.data, data);
  assert.equal(parsed.exportedAt, '2026-07-09T00:00:00.000Z');
});

test('parseBundle runs the app payload validator', () => {
  const bundle = createBundle({ data: { n: 1 }, exportedAt: 'now' });
  const raw = serializeBundle(bundle);
  let received;
  parseBundle(raw, {
    validateData: (d) => {
      received = d;
      return d;
    },
  });
  assert.deepEqual(received, { n: 1 });
});

test('parseBundle rejects non-JSON', () => {
  assert.throws(() => parseBundle('{not json', { validateData: (d) => d }), BundleError);
});

test('parseBundle rejects a non-object payload file', () => {
  assert.throws(() => parseBundle('42', { validateData: (d) => d }), BundleError);
});

test('parseBundle rejects a foreign format', () => {
  const raw = JSON.stringify({ format: 'something-else', version: 1, data: {} });
  assert.throws(() => parseBundle(raw, { validateData: (d) => d }), BundleError);
});

test('parseBundle rejects an incompatible version', () => {
  const raw = JSON.stringify({ format: BUNDLE_FORMAT, version: 999, data: {} });
  assert.throws(
    () => parseBundle(raw, { validateData: (d) => d }),
    /different app version/,
  );
});

test('parseBundle honors a caller-supplied expectedVersion', () => {
  const raw = JSON.stringify({ format: BUNDLE_FORMAT, version: 2, exportedAt: '', data: { ok: true } });
  const parsed = parseBundle(raw, { expectedVersion: 2, validateData: (d) => d });
  assert.deepEqual(parsed.data, { ok: true });
});
