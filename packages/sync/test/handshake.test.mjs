// Smoke test: two SyncEngines pair over an in-memory transport, then exchange
// an encrypted application message. Verifies the handshake + wire codec end to
// end without sockets. Run: node --test packages/sync/test/
import { test } from 'node:test';
import assert from 'node:assert/strict';
// Import the CJS build: bundlers (vite/metro) resolve the ESM build's
// tweetnacl-util named imports, but Node's strict ESM loader does not, so the
// CJS bundle is the reliable target for a direct node --test run.
import pkg from '../dist/index.js';
const { SyncEngine, createTextMessage } = pkg;

const delay = (ms) => new Promise((r) => setTimeout(r, ms));

// Linked in-memory connection pair: each end's send() delivers to the other's
// onData on a microtask, mimicking an ordered byte stream.
function makePipe() {
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
}

// Shared in-memory network: listen() registers by port, connect() links a pipe.
function makeNetwork() {
  const listeners = new Map();
  return {
    listen: async (port, onConnection) => listeners.set(port, onConnection),
    connect: async (_host, port) => {
      const onConnection = listeners.get(port);
      if (!onConnection) throw new Error(`no listener on ${port}`);
      const ends = makePipe();
      onConnection(ends.server);
      return ends.client;
    },
    stop: async () => listeners.clear(),
  };
}

test('two engines pair and exchange an encrypted message', async () => {
  const transport = makeNetwork();
  const devA = { id: 'dev-a', name: 'Mac A', platform: 'macos', version: '1', host: '127.0.0.1', port: 9001 };
  const devB = { id: 'dev-b', name: 'Phone B', platform: 'android', version: '1', host: '127.0.0.1', port: 9001 };

  let aPaired, bPaired, received;
  const engineA = new SyncEngine({
    localDevice: devA,
    transport,
    getPassphrase: () => 'correct horse battery',
    onPaired: (d) => (aPaired = d),
    onMessage: (id, m) => (received = { id, m }),
  });
  const engineB = new SyncEngine({
    localDevice: devB,
    transport,
    onPaired: (d) => (bPaired = d),
  });

  await engineA.start(9001);
  await engineB.pair(devA, 'correct horse battery');
  await delay(50);

  // Both sides completed pairing and agree on the peer identity.
  assert.ok(aPaired, 'A should be paired');
  assert.ok(bPaired, 'B should be paired');
  assert.equal(aPaired.id, devB.id);
  assert.equal(bPaired.id, devA.id);
  // Independently derived shared secrets must match.
  assert.equal(aPaired.sharedSecret, bPaired.sharedSecret);
  assert.equal(engineA.isPaired(devB.id), true);
  assert.equal(engineB.isPaired(devA.id), true);

  // Encrypted application message B -> A.
  const sent = engineB.send(devA.id, createTextMessage('hello off grid'));
  await delay(20);
  assert.equal(sent, true);
  assert.ok(received, 'A should receive the message');
  assert.equal(received.id, devB.id);
  assert.equal(received.m.type, 'text');
  assert.equal(received.m.payload.content, 'hello off grid');

  // A wrong passphrase must NOT pair.
  let cPaired = false;
  const devC = { id: 'dev-c', name: 'Mac C', platform: 'macos', version: '1', host: '127.0.0.1', port: 9001 };
  const engineC = new SyncEngine({ localDevice: devC, transport, onPaired: () => (cPaired = true) });
  await engineC.pair(devA, 'wrong passphrase');
  await delay(50);
  assert.equal(cPaired, false, 'mismatched passphrase must not pair');
});
