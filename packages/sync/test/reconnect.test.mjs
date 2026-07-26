// Reconnect/resume: two devices that already share a secret reconnect WITHOUT
// re-running the passphrase handshake, then exchange an encrypted message. Plus
// the DiscoveryOrchestrator auto-reconnects known devices and surfaces unknowns.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import pkg from '../dist/index.js';
const { SyncEngine, DiscoveryOrchestrator, deriveSharedSecret } = pkg;

const delay = (ms) => new Promise((r) => setTimeout(r, ms));

function makeNetwork() {
  const listeners = new Map();
  const pipe = () => {
    const ends = {};
    const mk = (self, peer) => {
      let onData = null;
      const onClose = [];
      return {
        _deliver: (d) => onData && onData(d),
        _close: () => onClose.forEach((f) => f()),
        id: self,
        send: (data) => queueMicrotask(() => ends[peer]._deliver(data)),
        onData: (cb) => (onData = cb),
        onClose: (cb) => onClose.push(cb),
        close: () => ends[peer]._close(),
      };
    };
    ends.client = mk('client', 'server');
    ends.server = mk('server', 'client');
    return ends;
  };
  return {
    listen: async (port, onConnection) => listeners.set(port, onConnection),
    connect: async (_h, port) => {
      const cb = listeners.get(port);
      if (!cb) throw new Error('no listener');
      const ends = pipe();
      cb(ends.server);
      return ends.client;
    },
    stop: async () => listeners.clear(),
  };
}

const dev = (id) => ({ id, name: id, platform: 'macos', version: '1', host: '127.0.0.1', port: 9001 });

test('reconnect resumes with stored secret, no passphrase', async () => {
  const transport = makeNetwork();
  // Both sides already know the pair secret (as if previously paired).
  const secret = deriveSharedSecret('the-passphrase', 'dev-a', 'dev-b');

  let aPaired, bPaired, received;
  const engineA = new SyncEngine({
    localDevice: dev('dev-a'),
    transport,
    getSharedSecret: (id) => (id === 'dev-b' ? secret : undefined),
    onPaired: (d) => (aPaired = d),
    onMessage: (id, m) => (received = m),
  });
  const engineB = new SyncEngine({
    localDevice: dev('dev-b'),
    transport,
    getSharedSecret: (id) => (id === 'dev-a' ? secret : undefined),
    onPaired: (d) => (bPaired = d),
  });

  await engineA.start(9001);
  await engineB.reconnect(dev('dev-a'), secret); // no passphrase
  await delay(50);

  assert.ok(aPaired && bPaired, 'both resumed without handshake');
  assert.equal(aPaired.id, 'dev-b');
  assert.equal(bPaired.id, 'dev-a');

  const sent = engineB.send('dev-a', { type: 'text', id: '1', timestamp: 1, payload: { content: 'resumed!' } });
  await delay(20);
  assert.equal(sent, true);
  assert.equal(received?.payload?.content, 'resumed!');
});

test('orchestrator auto-reconnects known devices, surfaces unknown', async () => {
  const reconnected = [];
  const discoveredUnknown = [];
  // Fake discovery we can drive manually.
  let foundCb;
  const discovery = {
    onDeviceFound: (cb) => (foundCb = cb),
    onDeviceLost: () => {},
    start: async () => {},
    advertise: async () => {},
    stop: async () => {},
  };
  const engine = {
    isPaired: () => false,
    reconnect: async (device) => { reconnected.push(device.id); },
  };
  const orch = new DiscoveryOrchestrator({
    engine,
    discovery,
    localDevice: dev('me'),
    getSharedSecret: (id) => (id === 'known' ? 'secret' : undefined),
    onDiscovered: (d) => discoveredUnknown.push(d.id),
  });
  await orch.start();

  foundCb({ ...dev('me'), lastSeen: 1 }); // self -> ignored
  foundCb({ ...dev('known'), lastSeen: 1 }); // known -> reconnect
  foundCb({ ...dev('stranger'), lastSeen: 1 }); // unknown -> surfaced
  await delay(10);

  assert.deepEqual(reconnected, ['known']);
  assert.deepEqual(discoveredUnknown, ['stranger']);
});
