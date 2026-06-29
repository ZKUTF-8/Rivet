#!/usr/bin/env node
import { spawn } from 'node:child_process'
import http from 'node:http'

const devUrl = process.env.RIVET_WEB_DEV_URL ?? 'http://localhost:9720'
const port = new URL(devUrl).port || '9720'

const vite = spawn('pnpm', ['exec', 'vite', '--host', '127.0.0.1', '--port', port], {
  cwd: process.cwd(),
  stdio: 'inherit',
  shell: process.platform === 'win32',
})

await waitForUrl(devUrl)

const shell = spawn('pnpm', ['exec', 'rivet-shell', 'dev'], {
  cwd: process.cwd(),
  stdio: 'inherit',
  shell: process.platform === 'win32',
})

shell.on('exit', code => {
  vite.kill()
  process.exit(code ?? 0)
})

process.on('SIGINT', () => {
  vite.kill()
  shell.kill()
  process.exit(130)
})

function waitForUrl(url) {
  const deadline = Date.now() + 30000

  return new Promise((resolve, reject) => {
    const check = () => {
      const request = http.get(url, response => {
        response.resume()
        resolve()
      })

      request.on('error', error => {
        if (Date.now() > deadline) {
          reject(error)
          return
        }

        setTimeout(check, 300)
      })

      request.setTimeout(1000, () => {
        request.destroy()
      })
    }

    check()
  })
}
