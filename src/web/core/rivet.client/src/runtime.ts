import { HubConnectionState } from '@microsoft/signalr'
import { customRef, readonly, ref, type Ref } from 'vue'
import type { RivetConnection } from './connection'

/** Rivet 前端连接状态。 */
export type RivetConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'reconnecting'

/** 后端变量状态。 */
export interface RivetVariableState {
    /** 变量键，例如 `toolkit.message`。 */
    name: string
    /** 当前变量值。 */
    value: unknown
    /** 后端类型名。 */
    type: string
    /** 服务端更新时间戳。 */
    updatedAt: number
}

/** 后端方法调用结果。 */
export interface RivetMethodResult<T = unknown> {
    /** 调用是否成功。 */
    success: boolean
    /** 方法返回值。 */
    value?: T
    /** 失败原因。 */
    error?: string
}

/** Rivet 浏览器端运行时客户端。 */
export interface RivetRuntimeClient {
    /** 当前连接状态。 */
    readonly status: Readonly<Ref<RivetConnectionStatus>>
    /** 启动连接并拉取初始快照。 */
    start(): Promise<void>
    /** 停止连接。 */
    stop(): Promise<void>
    /** 创建一个后端变量的响应式绑定。 */
    bind<T>(name: string): Ref<T>
    /** 调用后端方法。 */
    call<T>(name: string, args?: unknown[]): Promise<T>
    /** 主动刷新后端变量快照。 */
    getSnapshot(): Promise<Record<string, RivetVariableState>>
}

/** 运行时保存的单个变量槽，负责连接后端值和 Vue ref 触发器。 */
interface RuntimeVariable<T> {
    value: T | undefined
    trigger?: () => void
    ref?: Ref<T>
}

/** 首次连接失败和断线后的固定重试间隔。 */
const reconnectIntervalMs = 2000

/** 创建 Rivet 浏览器运行时。 */
export function createRuntime(connection: RivetConnection): RivetRuntimeClient {
    const status = ref<RivetConnectionStatus>('disconnected')
    const variables = new Map<string, RuntimeVariable<unknown>>()
    let retryTimer: ReturnType<typeof setTimeout> | undefined
    let startTask: Promise<void> | undefined
    let stopped = true
    let lifecycleVersion = 0

    connection.connection.on('RivetInitialState', applySnapshot)
    connection.connection.on('RivetVariableChanged', applyVariable)
    connection.connection.onreconnecting(() => {
        clearRetryTimer()
        status.value = 'reconnecting'
    })
    connection.connection.onreconnected(() => {
        status.value = 'connected'
        void getSnapshot()
    })
    connection.connection.onclose(() => {
        if (stopped) {
            status.value = 'disconnected'
            return
        }

        status.value = 'reconnecting'
        scheduleReconnect(lifecycleVersion)
    })

    async function start() {
        stopped = false

        if (connection.connection.state === HubConnectionState.Connected) {
            status.value = 'connected'
            return
        }

        if (connection.connection.state !== HubConnectionState.Disconnected) {
            status.value = 'reconnecting'
            return
        }

        clearRetryTimer()

        if (!startTask) {
            startTask = connectOnce(lifecycleVersion)
        }

        await startTask
    }

    async function stop() {
        stopped = true
        lifecycleVersion++
        clearRetryTimer()
        try {
            await connection.stop()
        } finally {
            status.value = 'disconnected'
        }
    }

    function bind<T>(name: string): Ref<T> {
        const entry = ensureVariable<T>(name)
        if (entry.ref) {
            return entry.ref
        }

        entry.ref = customRef<T>((track, trigger) => {
            entry.trigger = trigger

            return {
                get() {
                    track()
                    return entry.value as T
                },
                set(value: T) {
                    entry.value = value
                    trigger()
                    void setRemoteVariable(name, value)
                },
            }
        })

        return entry.ref
    }

    async function call<T>(name: string, args: unknown[] = []): Promise<T> {
        const result = normalizeMethodResult<T>(
            await connection.connection.invoke('InvokeMethod', name, JSON.stringify(args)),
        )

        if (!result.success) {
            throw new Error(result.error ?? `Rivet method '${name}' failed.`)
        }

        return result.value as T
    }

    async function getSnapshot(): Promise<Record<string, RivetVariableState>> {
        const snapshot = await connection.connection.invoke<Record<string, unknown>>('GetSnapshot')
        applySnapshot(snapshot)
        return normalizeSnapshot(snapshot)
    }

    async function setRemoteVariable(name: string, value: unknown) {
        await connection.connection.invoke('SetVariable', name, JSON.stringify(value))
    }

    function applySnapshot(raw: Record<string, unknown>) {
        for (const state of Object.values(normalizeSnapshot(raw))) {
            applyVariable(state)
        }
    }

    function applyVariable(raw: unknown) {
        const state = normalizeVariableState(raw)
        if (!state.name) return

        const entry = ensureVariable(state.name)
        entry.value = state.value
        entry.trigger?.()
    }

    function ensureVariable<T>(name: string): RuntimeVariable<T> {
        const existing = variables.get(name)
        if (existing) {
            return existing as RuntimeVariable<T>
        }

        const created: RuntimeVariable<T> = { value: undefined }
        variables.set(name, created as RuntimeVariable<unknown>)
        return created
    }

    async function connectOnce(version: number) {
        try {
            status.value = status.value === 'reconnecting' ? 'reconnecting' : 'connecting'
            await connection.start()

            if (stopped || version !== lifecycleVersion) {
                return
            }

            status.value = 'connected'
            await refreshSnapshotSafely()
        } catch {
            if (stopped || version !== lifecycleVersion) {
                status.value = 'disconnected'
                return
            }

            status.value = 'reconnecting'
            scheduleReconnect(version)
        } finally {
            startTask = undefined
        }
    }

    function scheduleReconnect(version: number) {
        if (stopped || retryTimer) {
            return
        }

        retryTimer = setTimeout(() => {
            retryTimer = undefined

            if (!stopped && version === lifecycleVersion) {
                void start()
            }
        }, reconnectIntervalMs)
    }

    function clearRetryTimer() {
        if (!retryTimer) {
            return
        }

        clearTimeout(retryTimer)
        retryTimer = undefined
    }

    async function refreshSnapshotSafely() {
        try {
            await getSnapshot()
        } catch (error) {
            console.error('Rivet 初始变量快照获取失败：', error)
        }
    }

    return {
        status: readonly(status),
        start,
        stop,
        bind,
        call,
        getSnapshot,
    }
}

/** 兼容 SignalR 不同协议返回的快照结构，并统一补齐变量 key。 */
function normalizeSnapshot(raw: Record<string, unknown> | undefined): Record<string, RivetVariableState> {
    const result: Record<string, RivetVariableState> = {}

    for (const [key, value] of Object.entries(raw ?? {})) {
        const state = normalizeVariableState(value)
        result[state.name || key] = state.name ? state : { ...state, name: key }
    }

    return result
}

/** 把后端变量状态转换成前端固定的小驼峰协议形状。 */
function normalizeVariableState(raw: unknown): RivetVariableState {
    const source = (raw ?? {}) as Record<string, unknown>

    return {
        name: String(source.name ?? source.Name ?? ''),
        value: normalizeValue(source.value ?? source.Value),
        type: String(source.type ?? source.Type ?? ''),
        updatedAt: Number(source.updatedAt ?? source.UpdatedAt ?? 0),
    }
}

/** 统一 SignalR JSON 和 MessagePack 对日期值的前端表示。 */
function normalizeValue(value: unknown): unknown {
    if (value instanceof Date) {
        return value.toISOString()
    }

    return value
}

/** 把后端方法调用结果转换成前端固定的小驼峰协议形状。 */
function normalizeMethodResult<T>(raw: unknown): RivetMethodResult<T> {
    const source = (raw ?? {}) as Record<string, unknown>

    return {
        success: Boolean(source.success ?? source.Success),
        value: (source.value ?? source.Value) as T,
        error: (source.error ?? source.Error) as string | undefined,
    }
}
