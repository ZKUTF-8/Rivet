import * as signalR from '@microsoft/signalr'
import { MessagePackHubProtocol } from '@microsoft/signalr-protocol-msgpack'

/** SignalR 通信协议。 */
export type Protocol = 'json' | 'msgpack'

/** Rivet 内部固定重连间隔。 */
const reconnectIntervalMs = 2000

/** 启动 SignalR 连接时的生命周期控制。 */
export interface StartConnectionOptions {
    /** 每次启动失败并准备重试前触发，用于上层同步状态。 */
    onRetry?: (error: unknown) => void
    /** 判断当前重试循环是否仍然有效，通常用于响应用户主动停止。 */
    shouldRetry?: () => boolean
}

/** 创建 Rivet SignalR 连接所需的配置。 */
export interface CreateConnectionOptions {
    /** SignalR Hub 完整地址。传入后优先级最高。 */
    url?: string
    /** 后端主机地址。不传时默认使用当前前端来源和 Vite proxy。 */
    host?: string
    /** 后端端口。与 host 一起传入时生成完整后端地址。 */
    port?: number
    /** 是否使用 HTTPS，默认使用 HTTP。 */
    https?: boolean
    /** SignalR Hub 路径，默认使用 `/bridge`。 */
    bridgePath?: string
    /** 序列化协议，默认使用 MessagePack。 */
    protocol?: Protocol
}

/** Rivet 前端连接对象，封装底层 SignalR HubConnection。 */
export interface RivetConnection {
    /** 底层 SignalR 连接，框架内部和调试阶段可以直接访问。 */
    connection: signalR.HubConnection
    /** 启动连接；首次连接失败也会按 Rivet 固定间隔持续重试。 */
    start(options?: StartConnectionOptions): Promise<void>
    /** 停止连接。 */
    stop(): Promise<void>
}

/** 创建到 Rivet server 的 SignalR 连接。 */
export function createConnection(options: CreateConnectionOptions = {}): RivetConnection {
    const protocol = options.protocol ?? 'msgpack'
    let builder = new signalR.HubConnectionBuilder()
        .withUrl(resolveConnectionUrl(options))
        .withAutomaticReconnect({
            nextRetryDelayInMilliseconds: () => reconnectIntervalMs,
        })

    if (protocol === 'msgpack') {
        builder = builder.withHubProtocol(new MessagePackHubProtocol())
    }

    const connection = builder.build()

    return {
        connection,
        start: (startOptions) => startConnection(connection, startOptions),
        stop: () => connection.stop(),
    }
}

/** 启动底层 SignalR 连接，并补齐 SignalR 不处理的“首次连接失败”重试。 */
async function startConnection(connection: signalR.HubConnection, options: StartConnectionOptions = {}): Promise<void> {
    while (true) {
        if (options.shouldRetry?.() === false) {
            return
        }

        try {
            await connection.start()
            return
        } catch (error) {
            if (options.shouldRetry?.() === false) {
                return
            }

            options.onRetry?.(error)
            await delay(reconnectIntervalMs)
        }
    }
}

/** 等待下一次首次连接重试。 */
function delay(milliseconds: number): Promise<void> {
    return new Promise((resolve) => {
        setTimeout(resolve, milliseconds)
    })
}

/** 根据端口、路径等配置推导 SignalR Hub 完整地址。 */
export function resolveConnectionUrl(options: CreateConnectionOptions = {}): string {
    if (options.url) return options.url

    const bridgePath = normalizeBridgePath(options.bridgePath ?? '/bridge')

    if (!options.host && !options.port) {
        return bridgePath
    }

    const scheme = options.https ? 'https' : 'http'
    const host = options.host ?? 'localhost'
    const port = options.port ? `:${options.port}` : ''

    return `${scheme}://${host}${port}${bridgePath}`
}

/** 规范化 SignalR Hub 路径，保证以 `/` 开头。 */
function normalizeBridgePath(path: string): string {
    return path.startsWith('/') ? path : `/${path}`
}
