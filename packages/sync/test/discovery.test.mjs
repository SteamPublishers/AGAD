// Real mDNS discovery on the local interface: advertise one device, browse from
// another, confirm it is found with the right TXT data. Needs Local Network
// permission on macOS. node:test has no default timeout, so the 6s wait is fine.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import disc from '../dist/adapters/node-discovery.js';
const { NodeDiscovery } = disc;

const delay = (ms) => new Promise((r) => setTimeout(r, ms));

test('advertise + browse discovers a device over mDNS', async () => {
  const advertiser = new NodeDiscovery();
  const browser = new NodeDiscovery();
  let found;
  browser.onDeviceFound((d) => {
    if (d.id === 'dev-adv') found = d;
  });

  await browser.start();
  await advertiser.advertise({
    id: 'dev-adv',
    name: 'Advertised Mac',
    platform: 'macos',
    version: '1',
    host: '127.0.0.1',
    port: 9999,
  });

  // Poll for up to ~6s for the multicast announcement to land.
  for (let i = 0; i < 30 && !found; i++) await delay(200);

  await advertiser.stop();
  await browser.stop();

  assert.ok(found, 'advertised device should be discovered');
  assert.equal(found.id, 'dev-adv');
  assert.equal(found.name, 'Advertised Mac');
  assert.equal(found.port, 9999);
  assert.ok(found.lastSeen > 0);
});
