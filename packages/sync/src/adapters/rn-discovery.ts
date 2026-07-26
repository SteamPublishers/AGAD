// React Native mDNS discovery for @offgrid/sync (mobile). Implements
// DiscoveryService over react-native-zeroconf (Android NSD / iOS Bonjour).
// Mirrors node-discovery.ts. The Zeroconf instance is INJECTED by the host so
// this package never imports react-native-zeroconf directly.
//
// Service type 'offgrid' resolves to _offgrid._tcp.local — identical to the
// desktop Node adapter, so phone and laptop find each other.

import type { DeviceInfo, DiscoveredDevice } from '../types';
import type { DiscoveryService } from '../discovery';
import { createTxtRecord, parseTxtRecord, createDiscoveredDevice } from '../discovery';

const SERVICE_TYPE = 'offgrid';
const PROTOCOL = 'tcp';
const DOMAIN = 'local.';

/** Minimal shape of a react-native-zeroconf resolved service. */
export interface RnZeroconfService {
  txt?: Record<string, string>;
  addresses?: string[];
  host?: string;
  port: number;
  name: string;
}

/** Minimal shape of the react-native-zeroconf instance we use. Publish methods
 *  are optional — not every RN zeroconf build can advertise; discovery still
 *  works one-way (we browse; a peer that can advertise gets found and dialed). */
export interface RnZeroconf {
  on(event: 'resolved', cb: (service: RnZeroconfService) => void): void;
  on(event: 'remove', cb: (name: string) => void): void;
  on(event: 'error', cb: (err: unknown) => void): void;
  scan(type: string, protocol: string, domain: string): void;
  stop(): void;
  removeDeviceListeners?(): void;
  publishService?(
    type: string,
    protocol: string,
    domain: string,
    name: string,
    port: number,
    txt?: Record<string, string>
  ): void;
  unpublishService?(name: string): void;
}

export class RnDiscovery implements DiscoveryService {
  private foundCb?: (device: DiscoveredDevice) => void;
  private lostCb?: (deviceId: string) => void;
  private publishedName?: string;

  constructor(private readonly zeroconf: RnZeroconf) {}

  async start(): Promise<void> {
    this.zeroconf.on('resolved', (svc) => {
      const txt = svc.txt ?? {};
      const ipv4 = svc.addresses?.find((a) => a.includes('.'));
      const host = ipv4 ?? svc.host ?? svc.addresses?.[0] ?? '';
      const info = parseTxtRecord(txt, host, svc.port);
      if (info) this.foundCb?.(createDiscoveredDevice(info));
    });
    this.zeroconf.on('remove', (name) => {
      // name like "OffGrid-<id>._offgrid._tcp.local." — recover our device id.
      const m = /OffGrid-([^.]+)/.exec(name);
      this.lostCb?.(m ? m[1] : name);
    });
    this.zeroconf.on('error', () => {
      /* swallowed; rescans recover */
    });
    this.zeroconf.scan(SERVICE_TYPE, PROTOCOL, DOMAIN);
  }

  async advertise(device: DeviceInfo): Promise<void> {
    const name = `OffGrid-${device.id}`;
    this.publishedName = name;
    if (typeof this.zeroconf.publishService === 'function') {
      this.zeroconf.publishService(SERVICE_TYPE, PROTOCOL, DOMAIN, name, device.port, createTxtRecord(device));
    } else {
      console.warn('[sync] zeroconf.publishService unavailable — browse-only on this device');
    }
  }

  async stopAdvertising(): Promise<void> {
    if (this.publishedName && typeof this.zeroconf.unpublishService === 'function') {
      this.zeroconf.unpublishService(this.publishedName);
    }
    this.publishedName = undefined;
  }

  onDeviceFound(callback: (device: DiscoveredDevice) => void): void {
    this.foundCb = callback;
  }

  onDeviceLost(callback: (deviceId: string) => void): void {
    this.lostCb = callback;
  }

  async stop(): Promise<void> {
    await this.stopAdvertising();
    this.zeroconf.stop();
    this.zeroconf.removeDeviceListeners?.();
  }
}
