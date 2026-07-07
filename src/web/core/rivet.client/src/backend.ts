import type { App, InjectionKey, Plugin } from 'vue'
import { inject } from 'vue'
import { createConnection, type CreateConnectionOptions, type RivetConnection } from './connection'
import { createRuntime, type RivetRuntimeClient } from './runtime'
import { createRv as createDefaultRv } from '@rivet/client/generated'

/** Rivet Vue 插件配置。 */
export interface CreateBackendOptions extends CreateConnectionOptions {
    /** 根据运行时创建业务侧 rv 对象。 */
    createRv?: (runtime: RivetRuntimeClient) => unknown
}

/** Rivet Vue 插件安装后可注入的运行时上下文。 */
export interface RivetBackend {
    /** Rivet 后端连接。 */
    connection: RivetConnection
    /** Rivet 浏览器运行时。 */
    runtime: RivetRuntimeClient
    /** 生成的业务访问对象。 */
    rv?: unknown
}

/** Rivet 后端上下文注入键。 */
export const rivetBackendKey: InjectionKey<RivetBackend> = Symbol('rivetBackend')

/** 创建 Rivet Vue 插件，业务入口通常只需要 `app.use(createBackend())`。 */
export function createBackend(options: CreateBackendOptions = {}): Plugin {
    const connection = createConnection(options)
    const runtime = createRuntime(connection)
    const createRv = options.createRv ?? createDefaultRv
    const backend: RivetBackend = {
        connection,
        runtime,
        rv: createRv(runtime),
    }

    return {
        install(app: App) {
            app.provide(rivetBackendKey, backend)
            app.config.globalProperties.$rivet = backend
            app.config.globalProperties.$rv = backend.rv
            app.config.globalProperties.rv = backend.rv

            if (backend.rv) {
                ;(globalThis as Record<string, unknown>).rv = backend.rv

                if (typeof window !== 'undefined') {
                    ;(window as unknown as Record<string, unknown>).rv = backend.rv
                }
            }

            void runtime.start()
        },
    }
}

/** 在 Vue 组件中读取 Rivet 后端上下文。 */
export function useRivetBackend(): RivetBackend {
    const backend = inject(rivetBackendKey)

    if (!backend) {
        throw new Error('Rivet backend is not installed. Call app.use(createBackend()) first.')
    }

    return backend
}
