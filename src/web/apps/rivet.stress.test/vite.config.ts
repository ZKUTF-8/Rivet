import { defineConfig, type UserConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'path'
import type { RivetConfig } from '@rivet/cli/config'
import { rivet } from '@rivet/cli/vite'

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
        port: 9720,
        strictPort: true,
    },
    rivet: {
        server: {
            url: 'http://localhost:9710',
        },
    },
} as RivetViteConfig)
