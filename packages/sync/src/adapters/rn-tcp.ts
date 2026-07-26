// React Native TCP transport for @offgrid/sync (mobile). Implements
// TransportBridge over react-native-tcp-socket. Mirrors node-tcp.ts; the engine
// handles framing + encryption, this just moves bytes.
//
// The RN socket module and a byte codec are INJECTED by the host (the mobile app
// passes `TcpSocket` and a Buffer-backed codec), so this package never imports
// react-native-tcp-socket directly and stays installable/buildable without RN.

import type { SyncConnection, TransportBridge } from '../transport';

/** Minimal shape of a react-native-tcp-socket socket we use. */
export interface RnSocket {
  remoteAddress?: string;
  on(event: 'data', cb: (data: unknown) => void): void;
  on(event: 'close', cb: () => void): void;
  on(event: 'error', cb: (err: unknown) => void): void;
  write(data: unknown): void;
  destroy(): void;
}

/** Minimal shape of a react-native-tcp-socket server we use. */
export interface RnTcpServer {
  listen(opts: { port: number; host?: string }, cb?: () => void): void;
  address(): { port: number } | string | null;
  on(event: 'error', cb: (err: unknown) => void): void;
  close(): void;
}

/** Minimal shape of the react-native-tcp-socket module we use. */
export interface RnTcpModule {
  createServer(onConnection: (socket: RnSocket) => void): RnTcpServer;
  createConnection(opts: { host: string; port: number }, cb?: () => void): RnSocket;
}

/** Bytes <-> wire conversion. Injected because RN needs its Buffer polyfill and
 *  react-native-tcp-socket may deliver 'data' as a (base64) string on Android. */
export interface ByteCodec {
  /** Normalize an inbound 'data' payload (Buffer or string) to raw bytes. */
  toBytes(data: unknown): Uint8Array;
  /** Convert raw bytes into what socket.write() expects (a Buffer). */
  fromBytes(bytes: Uint8Array): unknown;
}

function wrap(socket: RnSocket, codec: ByteCodec): SyncConnection {
  socket.on('error', () => socket.destroy()); // surface errors as close, not crash
  return {
    id: socket.remoteAddress ?? 'rn-peer',
    remoteHost: socket.remoteAddress,
    send: (data) => socket.write(codec.fromBytes(data)),
    onData: (cb) => socket.on('data', (d) => cb(codec.toBytes(d))),
    onClose: (cb) => socket.on('close', cb),
    close: () => socket.destroy(),
  };
}

export class RnTcpTransport implements TransportBridge {
  private server?: RnTcpServer;
  /** Port actually bound after listen() (we listen on 0 and advertise this). */
  boundPort?: number;

  constructor(
    private readonly tcp: RnTcpModule,
    private readonly codec: ByteCodec
  ) {}

  listen(port: number, onConnection: (conn: SyncConnection) => void): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const server = this.tcp.createServer((socket) => onConnection(wrap(socket, this.codec)));
      server.on('error', reject);
      server.listen({ port, host: '0.0.0.0' }, () => {
        const addr = server.address();
        if (addr && typeof addr === 'object') this.boundPort = addr.port;
        this.server = server;
        resolve();
      });
    });
  }

  connect(host: string, port: number): Promise<SyncConnection> {
    return new Promise<SyncConnection>((resolve, reject) => {
      const socket = this.tcp.createConnection({ host, port }, () => resolve(wrap(socket, this.codec)));
      socket.on('error', reject);
    });
  }

  stop(): Promise<void> {
    return new Promise<void>((resolve) => {
      this.server?.close();
      this.server = undefined;
      resolve();
    });
  }
}
