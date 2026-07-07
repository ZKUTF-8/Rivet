import { defineConfig, type UserConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'path'
import type { RivetConfig } from '@rivet/cli/config'
import { rivet } from '@rivet/cli/vite'

/** Vite 用户配置扩展，允许样板项目在同一个文件里声明 Rivet 开发配置。 */
type RivetViteConfig = UserConfig & {
    rivet?: RivetConfig
}

export default defineConfig({
    plugins: [rivet(), vue()],
    resolve: {
        alias: {
            '@': resolve(import.meta.dirname!, 'src'),
        },
    },
    server: {
        host: '127.0.0.1',
        port: 9730,
        strictPort: true,
    },
    rivet: {
        server: {
            project: '../../../server/apps/mysoow.toolkit.server/Mysoow.Toolkit.Server.csproj',
            url: 'http://localhost:9735',
        },
    },
} as RivetViteConfig)
