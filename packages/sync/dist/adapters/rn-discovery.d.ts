import { D as DiscoveryService, a as DeviceInfo, b as DiscoveredDevice } from '../index-D7PLqM1E.js';

/** Minimal shape of a react-native-zeroconf resolved service. */
interface RnZeroconfService {
    txt?: Record<string, string>;
    addresses?: string[];
    host?: string;
    port: number;
    name: string;
}
/** Minimal shape of the react-native-zeroconf instance we use. Publish methods
 *  are optional — not every RN zeroconf build can advertise; discovery still
 *  works one-way (we browse; a peer that can advertise gets found and dialed). */
interface RnZeroconf {
    on(event: 'resolved', cb: (service: RnZeroconfService) => void): void;
    on(event: 'remove', cb: (name: string) => void): void;
    on(event: 'error', cb: (err: unknown) => void): void;
    scan(type: string, protocol: string, domain: string): void;
    stop(): void;
    removeDeviceListeners?(): void;
    publishService?(type: string, protocol: string, domain: string, name: string, port: number, txt?: Record<string, string>): void;
    unpublishService?(name: string): void;
}
declare class RnDiscovery implements DiscoveryService {
    private readonly zeroconf;
    private foundCb?;
    private lostCb?;
    private publishedName?;
    constructor(zeroconf: RnZeroconf);
    start(): Promise<void>;
    advertise(device: DeviceInfo): Promise<void>;
    stopAdvertising(): Promise<void>;
    onDeviceFound(callback: (device: DiscoveredDevice) => void): void;
    onDeviceLost(callback: (deviceId: string) => void): void;
    stop(): Promise<void>;
}

export { RnDiscovery, type RnZeroconf, type RnZeroconfService };
