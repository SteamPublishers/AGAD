// src/adapters/rn-tcp.ts
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
export {
  RnTcpTransport
};
