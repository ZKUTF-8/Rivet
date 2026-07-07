import path from 'node:path'
import { resolveRivetConfig, type RivetConfig, type RivetViteDefaults } from '@rivet/cli/config'

/** rivet() Vite 插件的配置。 */
export interface RivetVitePluginOptions {
    /** 覆盖业务 Vite 配置中的 rivet 字段。通常不需要传。 */
    config?: RivetConfig
}

/** Vite 用户配置中 Rivet 插件实际需要读取的最小字段。 */
interface RivetViteUserConfig extends RivetViteDefaults {
    /** Vite 项目根目录。 */
    root?: string
    /** Rivet 前端工程配置。 */
    rivet?: RivetConfig
}

/** 避免 @rivet/cli 为了类型声明强依赖 Vite 包。 */
interface RivetVitePlugin {
    /** Vite 插件名称。 */
    name: string
    /** 在普通解析之前注入生成入口别名。 */
    enforce: 'pre'
    /** 返回需要合并到 Vite 配置中的别名。 */
    config(config: RivetViteUserConfig): unknown
}

/** Vite 插件：把 @rivet/client 的默认生成入口指向当前应用的隐藏生成文件。 */
export function rivet(options: RivetVitePluginOptions = {}): RivetVitePlugin {
    return {
        name: 'rivet',
        enforce: 'pre',
        config(config) {
            const root = path.resolve(process.cwd(), config.root ?? '.')
            const resolved = resolveRivetConfig(options.config ?? config.rivet, config)
            const generatedPath = path.resolve(root, resolved.generated.out)

            return {
                resolve: {
                    alias: [
                        {
                            find: '@rivet/client/generated',
                            replacement: generatedPath,
                        },
                    ],
                },
            }
        },
    }
}
