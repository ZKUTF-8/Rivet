import { defineConfig, type UserConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'path'
import type { RivetConfig } from '@rivet/shell/config'

type RivetViteConfig = UserConfig & {
    rivet?: RivetConfig
}

export default defineConfig({
    plugins: [vue()],
    resolve: {
        alias: {
            '@': resolve(import.meta.dirname!, 'src'),
        },
    },
    server: {
        host: '127.0.0.1',
        port: 9730,
        strictPort: true,
        proxy: {
            '/bridge': {
                target: 'http://localhost:9735',
                ws: true,
            },
        },
    },
    rivet: {
        web: {
            host: '127.0.0.1', // Vite dev server 监听地址；壳子开发模式会根据它生成 devUrl。
            port: 9730, // Vite dev server 监听端口；`rivet dev --shell` 会让 Tauri 加载这个端口。
            devUrl: 'http://127.0.0.1:9730', // Tauri 开发模式加载的前端地址；不写时由 host/port 自动推导。
            dist: 'dist', // 前端构建输出目录；后续 Tauri build 会把它写入 frontendDist。
        },
        server: {
            url: 'http://localhost:9735', // Mysoow.Toolkit 后端服务根地址。
            bridgePath: '/bridge', // Rivet Bridge Hub 路径。
            process: {
                command: 'dotnet', // 后续自动拉起后端进程时使用。
                args: ['run', '--project', '../../../server/apps/mysoow.toolkit.server/Mysoow.Toolkit.Server.csproj'], // 后端启动参数；路径相对当前业务前端项目。
                cwd: '.', // 后端进程工作目录；当前开发阶段保留前端项目目录。
            },
        },
        shell: {
            enabled: true, // 当前业务是否启用 Tauri 壳子能力；`dev:shell` 会读取这组配置。
            cargoManifestPath: undefined, // 不配置时使用框架内置 `src/shell/core/rivet.shell`。
            args: [], // 追加给 `cargo tauri dev` 的参数。
        },
    },
} as RivetViteConfig)
