/** Rivet 在前端工程侧的统一配置。 */
export interface RivetConfig {
    /** 前端开发服务和构建产物配置。通常不用写，默认从 Vite 配置推导。 */
    web?: RivetWebConfig
    /** 后端服务和通讯端点配置。通常不用写，默认从 Vite proxy 或框架默认值推导。 */
    server?: RivetServerConfig
    /** 桌面壳启动和打包配置。 */
    shell?: RivetShellConfig
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
    /** 后端服务根地址，不包含 SignalR Hub 路径。 */
    url?: string
    /** SignalR Bridge Hub 路径。 */
    bridgePath?: string
    /** 后端进程启动配置，后续打包和开发联动时使用。 */
    process?: RivetServerProcessConfig
}

/** 后端进程启动配置。 */
export interface RivetServerProcessConfig {
    /** 后端启动命令，例如 `dotnet` 或某个发布后的 exe。 */
    command?: string
    /** 传给后端启动命令的参数。 */
    args?: string[]
    /** 后端进程工作目录。 */
    cwd?: string
}

/** 桌面壳配置。 */
export interface RivetShellConfig {
    /** 当前业务是否启用桌面壳能力。 */
    enabled?: boolean
    /** 自定义 Tauri Cargo.toml 路径，不配置时使用框架内置壳。 */
    cargoManifestPath?: string
    /** 传给 `cargo tauri dev` 的附加参数。 */
    args?: string[]
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
    server: Required<Pick<RivetServerConfig, 'url' | 'bridgePath'>> & {
        process?: RivetServerProcessConfig
    }
    /** 填充默认值后的桌面壳配置。 */
    shell: Required<Pick<RivetShellConfig, 'enabled'>> & {
        cargoManifestPath?: string
        args: string[]
    }
}

/** 合并用户配置、Vite 配置和框架默认值，得到 CLI 可直接消费的配置。 */
export function resolveRivetConfig(config: RivetConfig = {}, vite: RivetViteDefaults = {}): ResolvedRivetConfig {
    const viteHost = resolveViteHost(vite.server?.host)
    const vitePort = vite.server?.port ?? 9720
    const proxyServer = resolveServerFromProxy(vite.server?.proxy)
    const webHost = config.web?.host ?? viteHost
    const webPort = config.web?.port ?? vitePort

    return {
        web: {
            host: webHost,
            port: webPort,
            devUrl: config.web?.devUrl ?? `http://${toBrowserHost(webHost)}:${webPort}`,
            dist: config.web?.dist ?? vite.build?.outDir ?? 'dist',
        },
        server: {
            url: config.server?.url ?? proxyServer.url,
            bridgePath: config.server?.bridgePath ?? proxyServer.bridgePath,
            process: config.server?.process,
        },
        shell: {
            enabled: config.shell?.enabled ?? false,
            cargoManifestPath: config.shell?.cargoManifestPath,
            args: config.shell?.args ?? [],
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

/** 从 Vite proxy 配置里推导默认后端地址和 Bridge Hub 路径。 */
function resolveServerFromProxy(proxy?: RivetViteProxy): Required<Pick<RivetServerConfig, 'url' | 'bridgePath'>> {
    if (!proxy) {
        return {
            url: 'http://localhost:9710',
            bridgePath: '/bridge',
        }
    }

    const bridgePath = '/bridge' in proxy ? '/bridge' : Object.keys(proxy)[0] ?? '/bridge'
    const proxyItem = proxy[bridgePath]
    const url = typeof proxyItem === 'string' ? proxyItem : proxyItem?.target

    return {
        url: url ?? 'http://localhost:9710',
        bridgePath,
    }
}
