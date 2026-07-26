// Full C1.1 over REAL sockets: two SyncEngines pair across localhost TCP and
// exchange an encrypted message. No GUI/permissions needed, so this runs
// headlessly and verifies the actual NodeTcpTransport, not a mock.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import pkg from '../dist/index.js';
import nodeAdapter from '../dist/adapters/node-tcp.js';
const { SyncEngine, createTextMessage } = pkg;
const { NodeTcpTransport } = nodeAdapter;

const delay = (ms) => new Promise((r) => setTimeout(r, ms));
const dev = (id, port) => ({ id, name: id, platform: 'macos', version: '1', host: '127.0.0.1', port });

test('two engines pair and message over real localhost TCP', async () => {
  const transportA = new NodeTcpTransport();
  const transportB = new NodeTcpTransport();

  let aPaired, received;
  const engineA = new SyncEngine({
    localDevice: dev('dev-a', 0),
    transport: transportA,
    getPassphrase: () => 'localhost-secret',
    onPaired: (d) => (aPaired = d),
    onMessage: (id, m) => (received = { id, m }),
  });
  let bPaired;
  const engineB = new SyncEngine({
    localDevice: dev('dev-b', 0),
    transport: transportB,
    onPaired: (d) => (bPaired = d),
  });

  await engineA.start(0); // ephemeral port
  const port = transportA.boundPort;
  assert.ok(port, 'server should bind a port');

  await engineB.pair(dev('dev-a', port), 'localhost-secret');
  await delay(150);

  assert.ok(aPaired && bPaired, 'both sides paired over TCP');
  assert.equal(aPaired.id, 'dev-b');
  assert.equal(bPaired.id, 'dev-a');
  assert.equal(aPaired.sharedSecret, bPaired.sharedSecret);

  const sent = engineB.send('dev-a', createTextMessage('over the wire'));
  await delay(80);
  assert.equal(sent, true);
  assert.equal(received?.m?.payload?.content, 'over the wire');

  await engineA.stop();
  await engineB.stop();
});
