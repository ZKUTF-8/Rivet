import { defineConfig, type UserConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'path'
import type { RivetConfig } from '@rivet/cli/config'

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
        port: 9720,
        strictPort: true,
        proxy: {
            '/bridge': {
                target: 'http://localhost:9710',
                ws: true,
            },
        },
    },
    rivet: {
        web: {
            host: '127.0.0.1', // Vite dev server 监听地址；壳子开发模式会根据它生成 devUrl。
            port: 9720, // Vite dev server 监听端口；`rivet dev --shell` 会让 Tauri 加载这个端口。
            devUrl: 'http://127.0.0.1:9720', // Tauri 开发模式加载的前端地址；不写时由 host/port 自动推导。
            dist: 'dist', // 前端构建输出目录；后续 Tauri build 会把它写入 frontendDist。
        },
        server: {
            url: 'http://localhost:9710', // 后端服务根地址；前端代理和后续壳子 sidecar 都围绕这个地址工作。
            bridgePath: '/bridge', // SignalR Hub 路径；当前压测服务和未来 Rivet bridge 默认都使用这个端点。
        },
        shell: {
            enabled: true, // 当前业务是否启用 Tauri 壳子能力；`dev:shell` 会读取这组配置。
            cargoManifestPath: undefined, // 自定义壳子 Cargo.toml 路径；不配置时使用框架内置 `src/shell/core/rivet.shell`。
            args: [], // 追加给 `cargo tauri dev` 的参数；例如后续需要传 `--features xxx` 时使用。
        },
    },
} as RivetViteConfig)
