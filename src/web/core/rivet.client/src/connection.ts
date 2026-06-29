import * as signalR from '@microsoft/signalr'
import { MessagePackHubProtocol } from '@microsoft/signalr-protocol-msgpack'

/** SignalR 通信协议。 */
export type Protocol = 'json' | 'msgpack'

/** 创建 Rivet SignalR 连接所需的配置。 */
export interface CreateConnectionOptions {
    /** SignalR Hub 地址。 */
    url: string
    /** 序列化协议，默认使用 MessagePack。 */
    protocol?: Protocol
}

/** Rivet 前端连接对象，封装底层 SignalR HubConnection。 */
export interface RivetConnection {
    /** 底层 SignalR 连接，压测阶段保留直接访问能力。 */
    connection: signalR.HubConnection
    /** 启动连接。 */
    start(): Promise<void>
    /** 停止连接。 */
    stop(): Promise<void>
}

/** 创建到 Rivet server 的 SignalR 连接。 */
export function createConnection(options: CreateConnectionOptions): RivetConnection {
    const protocol = options.protocol ?? 'msgpack'
    let builder = new signalR.HubConnectionBuilder()
        .withUrl(options.url)
        .withAutomaticReconnect()

    if (protocol === 'msgpack') {
        builder = builder.withHubProtocol(new MessagePackHubProtocol())
    }

    const connection = builder.build()

    return {
        connection,
        start: () => connection.start(),
        stop: () => connection.stop(),
    }
}
