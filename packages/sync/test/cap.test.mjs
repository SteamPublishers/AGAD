// Phase 1.4: device cap (open-core 2 free / 3+ paid) refuses a new pairing
// past the limit on the accepting side, and a pro entitlement lifts it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import pkg from '../dist/index.js';
const { SyncEngine, policyFor, FREE_DEVICE_CAP } = pkg;

const delay = (ms) => new Promise((r) => setTimeout(r, ms));

function makeNetwork() {
  const listeners = new Map();
  const makePipe = () => {
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
      const ends = makePipe();
      cb(ends.server);
      return ends.client;
    },
    stop: async () => listeners.clear(),
  };
}

const dev = (id) => ({ id, name: id, platform: 'macos', version: '1', host: '127.0.0.1', port: 9001 });

test(`free tier (cap ${FREE_DEVICE_CAP}) refuses a 3rd new device; pro lifts it`, async () => {
  const transport = makeNetwork();

  // Host A is at the free cap (already has 2 paired devices).
  let failReason;
  const hostFree = new SyncEngine({
    localDevice: dev('host'),
    transport,
    getPassphrase: () => 'pw',
    cap: { policy: policyFor(false), pairedCount: () => FREE_DEVICE_CAP, isKnown: () => false },
    onPairingFailed: (_d, reason) => (failReason = reason),
  });
  await hostFree.start(9001);

  let cPaired = false;
  const devC = new SyncEngine({ localDevice: dev('dev-c'), transport, onPairingFailed: () => {}, onPaired: () => (cPaired = true) });
  await devC.pair(dev('host'), 'pw');
  await delay(50);

  assert.equal(cPaired, false, 'a 3rd new device must be refused at the free cap');
  assert.equal(failReason, 'device_cap_reached');
  await hostFree.stop();

  // Pro entitlement lifts the cap.
  const transport2 = makeNetwork();
  let dPaired = false;
  const hostPro = new SyncEngine({
    localDevice: dev('host2'),
    transport: transport2,
    getPassphrase: () => 'pw',
    cap: { policy: policyFor(true), pairedCount: () => 5, isKnown: () => false },
    onPaired: () => {},
  });
  await hostPro.start(9001);
  const devD = new SyncEngine({ localDevice: dev('dev-d'), transport: transport2, onPaired: () => (dPaired = true) });
  await devD.pair(dev('host2'), 'pw');
  await delay(50);
  assert.equal(dPaired, true, 'pro entitlement allows pairing beyond the free cap');
  await hostPro.stop();
});
