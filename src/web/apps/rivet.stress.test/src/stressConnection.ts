import * as signalR from '@microsoft/signalr'
import { MessagePackHubProtocol } from '@microsoft/signalr-protocol-msgpack'

/** 压测程序支持的 SignalR 序列化协议。 */
export type Protocol = 'json' | 'msgpack'

/** 创建压测 SignalR 连接需要的配置。 */
export interface CreateStressConnectionOptions {
    /** SignalR Hub 完整地址。 */
    url: string
    /** 序列化协议，默认使用 MessagePack。 */
    protocol?: Protocol
}

/** 压测程序使用的 SignalR 连接封装。 */
export interface StressConnection {
    /** 底层 SignalR 连接，压测页面需要直接注册事件和调用 Hub 方法。 */
    connection: signalR.HubConnection
    /** 启动 SignalR 连接。 */
    start(): Promise<void>
    /** 停止 SignalR 连接。 */
    stop(): Promise<void>
}

/** 创建压测程序自己的 SignalR 连接，避免压测逻辑污染 `@rivet/client`。 */
export function createStressConnection(options: CreateStressConnectionOptions): StressConnection {
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
