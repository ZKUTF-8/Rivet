import type { App, InjectionKey, Plugin } from 'vue'
import { inject } from 'vue'
import { createConnection, type CreateConnectionOptions, type RivetConnection } from './connection'

/** Rivet Vue 插件配置。 */
export interface CreateBackendOptions extends CreateConnectionOptions {
    /** 是否在安装插件时自动启动连接，默认自动启动。 */
    autoStart?: boolean
}

/** Rivet Vue 插件安装后可注入的运行时上下文。 */
export interface RivetBackend {
    /** Rivet 后端连接。 */
    connection: RivetConnection
}

/** Rivet 后端上下文注入键。 */
export const rivetBackendKey: InjectionKey<RivetBackend> = Symbol('rivetBackend')

/** 创建 Rivet Vue 插件，业务入口通常只需要 `app.use(createBackend())`。 */
export function createBackend(options: CreateBackendOptions = {}): Plugin {
    const connection = createConnection(options)
    const backend: RivetBackend = { connection }

    return {
        install(app: App) {
            app.provide(rivetBackendKey, backend)
            app.config.globalProperties.$rivet = backend

            if (options.autoStart !== false) {
                void connection.start()
            }
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
