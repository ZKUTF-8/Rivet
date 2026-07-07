/** Rivet 在前端工程侧的统一配置。 */
export interface RivetConfig {
    /** 后端服务和通讯端点配置。 */
    server: RivetServerConfig
    /** 生成代码配置。 */
    generated?: RivetGeneratedConfig
}

/** 前端开发服务配置。 */
export interface RivetWebConfig {
    /** Vite dev server 监听地址。 */
    host?: string
    /** Vite dev server 监听端口。 */
    port?: number
    /** Tauri 壳在开发模式下加载的前端地址。 */
    devUrl?: string
    /** 前端生产构建输出目录。 */
    dist?: string
}

/** 后端服务配置。 */
export interface RivetServerConfig {
    /** 后端项目路径。 */
    project?: string
    /** 后端服务根地址，不包含 SignalR Hub 路径；Rivet 会据此自动配置 Vite /bridge 代理。 */
    url: string
}

/** Rivet 内部解析后的后端访问配置。 */
export interface ResolvedRivetServerConfig {
    /** 后端项目路径。 */
    project?: string
    /** 后端服务根地址，不包含 SignalR Hub 路径。 */
    url: string
    /** Rivet Bridge Hub 固定路径；应用层不需要配置。 */
    bridgePath: '/bridge'
}

/** 生成代码配置。 */
export interface RivetGeneratedConfig {
    /** 生成的 TypeScript 代理文件。 */
    out?: string
    /** 契约文件路径。不写时由 server.project 推导。 */
    contract?: string
}

/** Rivet 关心的 Vite 配置片段。 */
export interface RivetViteDefaults {
    /** Vite dev server 配置。 */
    server?: {
        /** Vite dev server 监听地址。 */
        host?: string | boolean
        /** Vite dev server 监听端口。 */
        port?: number
        /** Vite dev server 代理配置。 */
        proxy?: Record<string, string | { target?: string; ws?: boolean }>
    }
    /** Vite build 配置。 */
    build?: {
        /** Vite build 输出目录。 */
        outDir?: string
    }
}

/** Rivet 可识别的 Vite proxy 配置。 */
export type RivetViteProxy = NonNullable<NonNullable<RivetViteDefaults['server']>['proxy']>

/** 填充默认值后的 Rivet 配置。 */
export interface ResolvedRivetConfig {
    /** 填充默认值后的前端配置。 */
    web: Required<RivetWebConfig>
    /** 填充默认值后的后端配置。 */
    server: ResolvedRivetServerConfig
    /** 填充默认值后的生成配置。 */
    generated: Required<Pick<RivetGeneratedConfig, 'out'>> & {
        contract?: string
    }
}

/** 合并用户配置、Vite 配置和框架默认值，得到 CLI 可直接消费的配置。 */
export function resolveRivetConfig(config: Partial<RivetConfig> = {}, vite: RivetViteDefaults = {}): ResolvedRivetConfig {
    const viteHost = resolveViteHost(vite.server?.host)
    const vitePort = vite.server?.port ?? 9720
    const serverUrl = config.server?.url ?? resolveServerUrlFromProxy(vite.server?.proxy)
    const webHost = viteHost
    const webPort = vitePort

    if (!serverUrl) {
        throw new Error('缺少 rivet.server.url，Rivet 需要它来自动配置 /bridge 代理目标。')
    }

    return {
        web: {
            host: webHost,
            port: webPort,
            devUrl: `http://${toBrowserHost(webHost)}:${webPort}`,
            dist: vite.build?.outDir ?? 'dist',
        },
        server: {
            project: config.server?.project,
            url: serverUrl,
            bridgePath: '/bridge',
        },
        generated: {
            out: config.generated?.out ?? '.rivet/generated/rv.generated.ts',
            contract: config.generated?.contract,
        },
    }
}

/** 将 Vite host 配置转换成可监听地址。 */
function resolveViteHost(host: string | boolean | undefined): string {
    if (typeof host === 'string') return host
    if (host === true) return '0.0.0.0'
    return '127.0.0.1'
}

/** 将监听地址转换成浏览器可访问地址。 */
function toBrowserHost(host: string): string {
    if (host === '0.0.0.0' || host === '::') return 'localhost'
    return host
}

/** 从旧版手写 Vite proxy 中兼容推导后端地址；新项目应使用 rivet.server.url。 */
function resolveServerUrlFromProxy(proxy?: RivetViteProxy): string | undefined {
    const proxyItem = proxy?.['/bridge']
    const url = typeof proxyItem === 'string' ? proxyItem : proxyItem?.target

    return url
}
