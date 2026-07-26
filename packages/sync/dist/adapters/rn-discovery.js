"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/adapters/rn-discovery.ts
var rn_discovery_exports = {};
__export(rn_discovery_exports, {
  RnDiscovery: () => RnDiscovery
});
module.exports = __toCommonJS(rn_discovery_exports);

// src/discovery/index.ts
var TXT_DEVICE_ID = "id";
var TXT_DEVICE_NAME = "name";
var TXT_PLATFORM = "platform";
var TXT_VERSION = "version";
function createTxtRecord(device) {
  return {
    [TXT_DEVICE_ID]: device.id,
    [TXT_DEVICE_NAME]: device.name,
    [TXT_PLATFORM]: device.platform,
    [TXT_VERSION]: device.version
  };
}
function parseTxtRecord(txt, host, port) {
  const id = txt[TXT_DEVICE_ID];
  const name = txt[TXT_DEVICE_NAME];
  const platform = txt[TXT_PLATFORM];
  const version = txt[TXT_VERSION];
  if (!id || !name || !platform || !version) {
    return null;
  }
  return {
    id,
    name,
    platform,
    version,
    host,
    port
  };
}
function createDiscoveredDevice(device) {
  return {
    ...device,
    lastSeen: Date.now()
  };
}

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
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  RnDiscovery
});
