import {
  createDiscoveredDevice,
  createTxtRecord,
  parseTxtRecord
} from "../chunk-UMHRNOI2.mjs";

// src/adapters/rn-discovery.ts
var SERVICE_TYPE = "offgrid";
var PROTOCOL = "tcp";
var DOMAIN = "local.";
var RnDiscovery = class {
  constructor(zeroconf) {
    this.zeroconf = zeroconf;
  }
  zeroconf;
  foundCb;
  lostCb;
  publishedName;
  async start() {
    this.zeroconf.on("resolved", (svc) => {
      const txt = svc.txt ?? {};
      const ipv4 = svc.addresses?.find((a) => a.includes("."));
      const host = ipv4 ?? svc.host ?? svc.addresses?.[0] ?? "";
      const info = parseTxtRecord(txt, host, svc.port);
      if (info) this.foundCb?.(createDiscoveredDevice(info));
    });
    this.zeroconf.on("remove", (name) => {
      const m = /OffGrid-([^.]+)/.exec(name);
      this.lostCb?.(m ? m[1] : name);
    });
    this.zeroconf.on("error", () => {
    });
    this.zeroconf.scan(SERVICE_TYPE, PROTOCOL, DOMAIN);
  }
  async advertise(device) {
    const name = `OffGrid-${device.id}`;
    this.publishedName = name;
    if (typeof this.zeroconf.publishService === "function") {
      this.zeroconf.publishService(SERVICE_TYPE, PROTOCOL, DOMAIN, name, device.port, createTxtRecord(device));
    } else {
      console.warn("[sync] zeroconf.publishService unavailable \u2014 browse-only on this device");
    }
  }
  async stopAdvertising() {
    if (this.publishedName && typeof this.zeroconf.unpublishService === "function") {
      this.zeroconf.unpublishService(this.publishedName);
    }
    this.publishedName = void 0;
  }
  onDeviceFound(callback) {
    this.foundCb = callback;
  }
  onDeviceLost(callback) {
    this.lostCb = callback;
  }
  async stop() {
    await this.stopAdvertising();
    this.zeroconf.stop();
    this.zeroconf.removeDeviceListeners?.();
  }
};
export {
  RnDiscovery
};
