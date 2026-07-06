# Rivet 运行机制说明

本文只说明当前框架在开发阶段的运行机制，重点是命令如何进入、配置如何解析、Vite 和 Tauri 如何被启动、参数如何传递。架构分层和长期设计见 `FRAMEWORK_DESIGN.md`。

## 核心边界

当前运行时边界分为三层：

- 业务前端项目：例如 `src/web/apps/rivet.stress.test`，负责写业务代码和 `vite.config.ts`。
- `@rivet/shell`：位于 `src/web/core/rivet.shell`，负责提供 `rivet` 命令，编排 Vite 和 Tauri 壳子。
- Tauri 壳子：位于 `src/shell/core/rivet.shell`，负责真正打开桌面窗口。

浏览器开发模式只需要启动 Vite。壳子开发模式会先启动业务项目的 Vite，再启动 Tauri 壳子加载这个前端地址。

## 命令入口

业务项目通过 `package.json` 调用命令：

```json
{
    "scripts": {
        "dev": "vite",
        "dev:shell": "rivet dev --shell"
    }
}
```

`rivet` 命令来自 `@rivet/shell` 的 `package.json`：

```json
{
    "bin": {
        "rivet": "./cli/rivet.js",
        "rivet-shell": "./cli/rivet.js"
    }
}
```

所以执行 `pnpm dev:shell` 时，实际进入的是：

```text
src/web/core/rivet.shell/cli/rivet.js
```

`rivet.js` 目前只实现 `dev` 命令。`--shell` 表示需要同时启动桌面壳子。

## 配置来源

当前配置来源有四层，优先级从高到低：

```text
CLI 参数
> vite.config.ts 的 rivet 配置
> vite.config.ts 的 server/build 配置
> Rivet 默认值
```

目前 CLI 支持这些参数：

```text
--shell      启动 Tauri 壳子
--web-url    指定壳子加载的前端 URL
--host       指定 Vite dev server host
--port       指定 Vite dev server port
--config     指定 Vite 配置文件路径
```

业务项目的 `vite.config.ts` 可以同时写 Vite 配置和 Rivet 配置：

```ts
export default defineConfig({
    server: {
        host: '127.0.0.1',
        port: 9720,
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
```

`src/web/core/rivet.shell/src/config.ts` 中的 `resolveRivetConfig()` 负责把这些配置合并成 CLI 可以直接使用的运行时配置。

## Vite 如何启动

`@rivet/shell` 不通过 `pnpm exec vite` 启动 Vite，而是加载业务项目本地安装的 Vite：

```text
loadProjectVite(projectCwd)
```

这样可以避免把 Vite 固定成 `@rivet/shell` 自己的依赖，也能使用业务项目自己的 Vite 版本。

启动 Vite 时使用 Vite Node API：

```text
vite.createServer(...)
await server.listen()
server.printUrls()
```

`server.listen()` 完成后，说明 Vite 开发服务器已经完成监听，可以被浏览器或 Tauri 壳子加载。当前实现不再使用 HTTP 轮询检测 URL。

传给 `createServer()` 的关键配置是：

```text
configFile: 业务项目 vite.config.ts
root: 业务项目目录
server.host: 最终解析出的 host
server.port: 最终解析出的 port
```

因此业务项目自己的 Vite 配置会被加载，`host` 和 `port` 会按 Rivet 的配置优先级统一覆盖。

## 壳子如何启动

当执行 `rivet dev --shell` 时，CLI 会在 Vite 启动完成后启动 Tauri：

```text
cargo tauri dev
```

执行目录是 Tauri 壳子所在目录：

```text
src/shell/core/rivet.shell
```

如果业务项目配置了 `rivet.shell.cargoManifestPath`，则可以改用指定的 Tauri 工程。当前默认使用框架内置壳子：

```text
src/shell/core/rivet.shell/Cargo.toml
```

`rivet.shell.args` 会被追加到 `cargo tauri dev` 后面，用于后续传递 Tauri CLI 参数。

## 参数如何传给壳子

当前 CLI 会在业务项目目录下生成临时 Tauri 配置：

```text
.rivet/tauri.dev.conf.json
```

然后通过 Tauri CLI 的 `--config` 参数合并到内置壳子的 `tauri.conf.json`：

```text
cargo tauri dev --config .rivet/tauri.dev.conf.json
```

临时配置当前写入：

```json
{
    "build": {
        "devUrl": "业务项目实际 devUrl",
        "frontendDist": "业务项目实际 dist 目录",
        "beforeDevCommand": "",
        "beforeBuildCommand": ""
    }
}
```

这样 `vite.config.ts` 中的 `server.port`、`server.host`、`rivet.web.devUrl` 和 `rivet.web.dist` 会真实影响 Tauri 壳子加载的前端地址，而不是继续使用内置壳子 `tauri.conf.json` 里的固定默认值。

CLI 仍会把下面这些信息作为环境变量传给 Tauri 进程，后续可供 Rust 侧或 sidecar 逻辑读取：

```text
RIVET_WEB_DEV_URL    壳子加载的前端地址
RIVET_SERVER_URL     后端服务根地址
RIVET_BRIDGE_PATH    SignalR Bridge Hub 路径
```

## 进程关系

壳子开发模式下，进程关系可以理解为：

```text
业务项目 pnpm dev:shell
  -> @rivet/shell cli/rivet.js
      -> Vite dev server
      -> cargo tauri dev
          -> rivet_shell.exe
```

`@rivet/shell` 是编排者。Vite 和 Tauri 都是被它启动和管理的子流程。

当 Tauri 进程退出时，CLI 会关闭 Vite。收到 `SIGINT` 或 `SIGTERM` 时，CLI 也会尝试同时关闭 Tauri 和 Vite。

## 调试时看哪里

如果命令没有进入正确入口，先看：

```text
src/web/core/rivet.shell/package.json
src/web/apps/rivet.stress.test/package.json
src/web/pnpm-workspace.yaml
```

如果配置没有按预期生效，先看：

```text
src/web/apps/rivet.stress.test/vite.config.ts
src/web/core/rivet.shell/src/config.ts
```

如果 Vite 没启动或端口不对，先看：

```text
src/web/core/rivet.shell/cli/rivet.js
```

重点关注：

```text
loadProjectVite()
loadViteConfig()
startVite()
```

如果 Tauri 没启动或壳子没有加载正确前端地址，先看：

```text
runDevWithShell()
.rivet/tauri.dev.conf.json
src/shell/core/rivet.shell/tauri.conf.json
```

## 当前暂未完成的边界

当前文档描述的是开发阶段机制。下面这些能力后续还需要继续明确：

- 打包阶段如何构建业务前端并生成 Tauri build 配置。
- 后端进程如何配置、发布、作为 sidecar 随壳子一起打包。
- `rivet dev` 是否最终替代业务项目直接使用 `vite`。
- 是否增加 `rivet dev --debug` 输出最终解析后的运行配置。

这些不影响当前验证方向，但在进入正式业务样板前需要逐步补齐。
