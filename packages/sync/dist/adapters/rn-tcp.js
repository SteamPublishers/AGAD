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

// src/adapters/rn-tcp.ts
var rn_tcp_exports = {};
__export(rn_tcp_exports, {
  RnTcpTransport: () => RnTcpTransport
});
module.exports = __toCommonJS(rn_tcp_exports);
function wrap(socket, codec) {
  socket.on("error", () => socket.destroy());
  return {
    id: socket.remoteAddress ?? "rn-peer",
    remoteHost: socket.remoteAddress,
    send: (data) => socket.write(codec.fromBytes(data)),
    onData: (cb) => socket.on("data", (d) => cb(codec.toBytes(d))),
    onClose: (cb) => socket.on("close", cb),
    close: () => socket.destroy()
  };
}
var RnTcpTransport = class {
  constructor(tcp, codec) {
    this.tcp = tcp;
    this.codec = codec;
  }
  tcp;
  codec;
  server;
  /** Port actually bound after listen() (we listen on 0 and advertise this). */
  boundPort;
  listen(port, onConnection) {
    return new Promise((resolve, reject) => {
      const server = this.tcp.createServer((socket) => onConnection(wrap(socket, this.codec)));
      server.on("error", reject);
      server.listen({ port, host: "0.0.0.0" }, () => {
        const addr = server.address();
        if (addr && typeof addr === "object") this.boundPort = addr.port;
        this.server = server;
        resolve();
      });
    });
  }
  connect(host, port) {
    return new Promise((resolve, reject) => {
      const socket = this.tcp.createConnection({ host, port }, () => resolve(wrap(socket, this.codec)));
      socket.on("error", reject);
    });
  }
  stop() {
    return new Promise((resolve) => {
      this.server?.close();
      this.server = void 0;
      resolve();
    });
  }
};
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  RnTcpTransport
});
