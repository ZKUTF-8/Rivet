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
        shell: {
            enabled: true,
        },
    },
} as RivetViteConfig)
