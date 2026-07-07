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
    /**
     * 创建一个后端变量的响应式绑定。
     *
     * @param name 后端契约中的变量 key，例如 `toolkit.message`。
     * @returns 可直接用于 Vue 组件的响应式变量引用。
     */
    bind<T>(name: string): Ref<T>
    /**
     * 调用后端方法。
     *
     * @param name 后端契约中的方法 key，例如 `toolkit.echo`。
     * @param args 按顺序传给后端方法的参数列表。
     * @returns 后端方法成功执行后的业务返回值。
     */
    call<T>(name: string, args?: unknown[]): Promise<T>
    /** 主动刷新后端变量快照。 */
    getSnapshot(): Promise<Record<string, RivetVariableState>>
}

/** Rivet 运行时内部维护的单个后端变量状态，负责连接后端值和 Vue ref 触发器。 */
interface RuntimeVariable<T> {
    /** 当前变量值；连接建立前或后端快照尚未返回时可能为空。 */
    value: T | undefined
    /** Vue customRef 的更新触发器；远程推送或快照刷新时用它通知视图重新计算。 */
    trigger?: () => void
    /** 暴露给业务代码的响应式引用；重复 bind 同名变量时复用同一个 ref。 */
    ref?: Ref<T>
}

/**
 * 创建 Rivet 浏览器运行时。
 *
 * @param connection 已创建的 SignalR 连接封装，运行时只负责在其上绑定协议事件和业务 API。
 * @returns 可注入 Vue 应用和生成 `rv` 代理使用的浏览器端运行时客户端。
 */
export function createRuntime(connection: RivetConnection): RivetRuntimeClient {
    /** 对外暴露的连接状态；只通过 readonly 暴露，避免业务代码直接改状态。 */
    const status = ref<RivetConnectionStatus>('disconnected')
    /** 按后端变量 key 保存所有已绑定或已收到快照的变量槽。 */
    const variables = new Map<string, RuntimeVariable<unknown>>()
    /** 当前正在执行的启动任务；用于合并并发 start() 调用。 */
    let startTask: Promise<void> | undefined
    /** 标记用户是否主动停止连接；主动停止后 onclose 不再触发重连。 */
    let stopped = true
    /** 生命周期版本号；用于丢弃 stop/start 交错时已经过期的异步连接结果。 */
    let lifecycleVersion = 0

    /** 后端主动下发完整初始状态时，按快照逻辑刷新所有变量。 */
    connection.connection.on('RivetInitialState', applySnapshot)
    /** 后端主动推送单个变量变化时，只刷新对应变量槽。 */
    connection.connection.on('RivetVariableChanged', applyVariable)
    /** SignalR 进入自动重连时，同步对外连接状态。 */
    connection.connection.onreconnecting(() => {
        status.value = 'reconnecting'
    })
    /** SignalR 自动重连成功后，以后端快照为准重新校准本地变量。 */
    connection.connection.onreconnected(() => {
        status.value = 'connected'
        void getSnapshot()
    })
    /** 连接关闭后根据是否主动停止决定保持断开，还是重新进入底层启动重试。 */
    connection.connection.onclose(() => {
        if (stopped) {
            status.value = 'disconnected'
            return
        }

        status.value = 'reconnecting'
        void start()
    })

    /** 启动 SignalR 连接；首次连接失败重试由底层连接器负责。 */
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

        if (!startTask) {
            startTask = connectOnce(lifecycleVersion)
        }

        await startTask
    }

    /** 主动停止连接，并让当前生命周期里的重连任务全部失效。 */
    async function stop() {
        stopped = true
        lifecycleVersion++
        try {
            await connection.stop()
        } finally {
            status.value = 'disconnected'
        }
    }

    /**
     * 为指定后端变量创建 Vue ref；前端 set 时本地先更新，再异步写回后端。
     *
     * @param name 后端契约中的变量 key，例如 `toolkit.message`。
     * @returns 与后端变量槽绑定的 Vue ref；重复绑定同名变量会返回同一份 ref。
     */
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
                    void connection.connection.invoke('SetVariable', name, JSON.stringify(value))
                },
            }
        })

        return entry.ref
    }

    /**
     * 调用后端公开方法，并把统一方法结果解包成业务返回值。
     *
     * @param name 后端契约中的方法 key，例如 `toolkit.echo`。
     * @param args 按顺序传给后端方法的参数列表，调用前会整体序列化为 JSON。
     * @returns 后端方法成功执行后的业务返回值；失败时抛出后端返回的错误。
     */
    async function call<T>(name: string, args: unknown[] = []): Promise<T> {
        const raw = await connection.connection.invoke('InvokeMethod', name, JSON.stringify(args))
        const source = (raw ?? {}) as Record<string, unknown>
        const result: RivetMethodResult<T> = {
            success: Boolean(source.success ?? source.Success),
            value: (source.value ?? source.Value) as T,
            error: (source.error ?? source.Error) as string | undefined,
        }

        if (!result.success) {
            throw new Error(result.error ?? `Rivet method '${name}' failed.`)
        }

        return result.value as T
    }

    /**
     * 拉取后端完整变量快照，并同步更新当前运行时变量槽。
     *
     * @returns 以变量 key 索引、字段名已归一化的后端变量快照。
     */
    async function getSnapshot(): Promise<Record<string, RivetVariableState>> {
        const snapshot = await connection.connection.invoke<Record<string, unknown>>('GetSnapshot')
        applySnapshot(snapshot)
        return normalizeSnapshot(snapshot)
    }

    /**
     * 应用完整快照；不同协议返回结构先统一，再逐个刷新变量槽。
     *
     * @param raw SignalR `GetSnapshot` 或初始状态事件返回的原始快照。
     */
    function applySnapshot(raw: Record<string, unknown>) {
        for (const state of Object.values(normalizeSnapshot(raw))) {
            applyVariable(state)
        }
    }

    /**
     * 应用单个变量变化；远程更新只触发 ref，不再调用前端 setter 写回后端。
     *
     * @param raw 后端推送的变量状态，可能来自 JSON 或 MessagePack 协议。
     */
    function applyVariable(raw: unknown) {
        const state = normalizeVariableState(raw)
        if (!state.name) return

        const entry = ensureVariable(state.name)
        entry.value = state.value
        entry.trigger?.()
    }

    /**
     * 获取或创建变量槽；先收到快照后 bind 和先 bind 后收到快照都走同一份状态。
     *
     * @param name 后端变量 key。
     * @returns 当前运行时内部维护的变量槽。
     */
    function ensureVariable<T>(name: string): RuntimeVariable<T> {
        const existing = variables.get(name)
        if (existing) {
            return existing as RuntimeVariable<T>
        }

        const created: RuntimeVariable<T> = { value: undefined }
        variables.set(name, created as RuntimeVariable<unknown>)
        return created
    }

    /**
     * 执行一次连接尝试，并在连接成功后刷新后端快照。
     *
     * @param version 启动连接时捕获的生命周期版本号，用于丢弃 stop/start 交错导致的过期结果。
     */
    async function connectOnce(version: number) {
        try {
            status.value = status.value === 'reconnecting' ? 'reconnecting' : 'connecting'
            await connection.start({
                retry: true,
                shouldRetry: () => !stopped && version === lifecycleVersion,
                onRetry: () => {
                    if (!stopped && version === lifecycleVersion) {
                        status.value = 'reconnecting'
                    }
                },
            })

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
        } finally {
            startTask = undefined
        }
    }

    /** 连接成功后尽力刷新快照；失败只记录日志，避免打断后续重连生命周期。 */
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

// TODO: 联调 JSON 和 MessagePack 时重点验证字段命名。MessagePack 可能直接保留后端 PascalCase 字段，
// 而 JSON 通常会按后端序列化配置转成小驼峰；这里的兼容逻辑需要用真实协议输出再确认一遍。
/**
 * 兼容 SignalR 不同协议返回的快照结构，并统一补齐变量 key。
 *
 * @param raw SignalR 返回的原始快照；连接异常或后端空响应时可能为空。
 * @returns 以变量 key 索引、每一项都符合前端 `RivetVariableState` 形状的快照。
 */
function normalizeSnapshot(raw: Record<string, unknown> | undefined): Record<string, RivetVariableState> {
    const result: Record<string, RivetVariableState> = {}

    for (const [key, value] of Object.entries(raw ?? {})) {
        const state = normalizeVariableState(value)
        result[state.name || key] = state.name ? state : { ...state, name: key }
    }

    return result
}

/**
 * 把后端变量状态转换成前端固定的小驼峰协议形状。
 *
 * @param raw 单个后端变量状态，兼容 PascalCase 和 camelCase 字段。
 * @returns 字段名已归一化的前端变量状态。
 */
function normalizeVariableState(raw: unknown): RivetVariableState {
    const source = (raw ?? {}) as Record<string, unknown>

    return {
        name: String(source.name ?? source.Name ?? ''),
        value: normalizeValue(source.value ?? source.Value),
        type: String(source.type ?? source.Type ?? ''),
        updatedAt: Number(source.updatedAt ?? source.UpdatedAt ?? 0),
    }
}

/**
 * 统一 SignalR JSON 和 MessagePack 对日期值的前端表示。
 *
 * @param value SignalR 协议层返回的原始变量值。
 * @returns 前端运行时内部保存的变量值；日期对象会转成 ISO 字符串。
 */
function normalizeValue(value: unknown): unknown {
    if (value instanceof Date) {
        return value.toISOString()
    }

    return value
}
