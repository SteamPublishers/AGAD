import { T as TransportBridge, S as SyncConnection } from '../transport-1cXLtrs5.js';

/** Minimal shape of a react-native-tcp-socket socket we use. */
interface RnSocket {
    remoteAddress?: string;
    on(event: 'data', cb: (data: unknown) => void): void;
    on(event: 'close', cb: () => void): void;
    on(event: 'error', cb: (err: unknown) => void): void;
    write(data: unknown): void;
    destroy(): void;
}
/** Minimal shape of a react-native-tcp-socket server we use. */
interface RnTcpServer {
    listen(opts: {
        port: number;
        host?: string;
    }, cb?: () => void): void;
    address(): {
        port: number;
    } | string | null;
    on(event: 'error', cb: (err: unknown) => void): void;
    close(): void;
}
/** Minimal shape of the react-native-tcp-socket module we use. */
interface RnTcpModule {
    createServer(onConnection: (socket: RnSocket) => void): RnTcpServer;
    createConnection(opts: {
        host: string;
        port: number;
    }, cb?: () => void): RnSocket;
}
/** Bytes <-> wire conversion. Injected because RN needs its Buffer polyfill and
 *  react-native-tcp-socket may deliver 'data' as a (base64) string on Android. */
interface ByteCodec {
    /** Normalize an inbound 'data' payload (Buffer or string) to raw bytes. */
    toBytes(data: unknown): Uint8Array;
    /** Convert raw bytes into what socket.write() expects (a Buffer). */
    fromBytes(bytes: Uint8Array): unknown;
}
declare class RnTcpTransport implements TransportBridge {
    private readonly tcp;
    private readonly codec;
    private server?;
    /** Port actually bound after listen() (we listen on 0 and advertise this). */
    boundPort?: number;
    constructor(tcp: RnTcpModule, codec: ByteCodec);
    listen(port: number, onConnection: (conn: SyncConnection) => void): Promise<void>;
    connect(host: string, port: number): Promise<SyncConnection>;
    stop(): Promise<void>;
}

export { type ByteCodec, type RnSocket, type RnTcpModule, type RnTcpServer, RnTcpTransport };
