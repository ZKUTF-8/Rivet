# rivet.shell

`rivet.shell` 是 Rivet 的 Tauri 桌面壳工程。它负责把前端页面加载到系统 WebView 中，后续会负责拉起本地 `.NET server` 进程，并最终沉淀为 `@rivet/cli` 调用的壳模板。

当前阶段它还是一个固定壳工程，用来验证 Tauri 加载前端、窗口配置和后续 sidecar 方案。

## 目录说明

```text
rivet.shell/
  Cargo.toml          # Rust/Tauri 依赖声明
  Cargo.lock          # 实际锁定的完整依赖版本
  tauri.conf.json     # Tauri 应用配置
  build.rs            # Tauri 构建脚本
  src/
    main.rs           # 桌面程序入口
    lib.rs            # Tauri Builder 配置
  capabilities/       # Tauri 权限配置
  icons/              # 桌面应用图标
```

## 当前依赖

核心依赖在 `Cargo.toml`：

- `tauri`：Tauri 主框架
- `tauri-plugin-shell`：后续用于拉起本地 `.NET server` 进程
- `serde` / `serde_json`：配置和参数序列化
- `tauri-build`：Tauri 构建期工具

查看完整依赖树：

```powershell
cargo tree --manifest-path src\shell\core\rivet.shell\Cargo.toml
```

## 开发前准备

需要本机安装：

- Rust / Cargo
- Node.js / pnpm

通过 `pnpm dev:shell` 启动时，`@rivet/cli` 会检查 Tauri CLI；如果当前用户环境尚未安装或版本不一致，会提示后通过 Cargo 自动安装 `Cargo.toml` 中 `package.metadata.rivet.tauri-cli-version` 声明的版本。该过程需要能够访问 Rust crate 源，首次安装可能需要几分钟。

当前机器可用以下命令检查：

```powershell
rustc --version
cargo --version
cargo tauri --version
node -v
pnpm -v
```

## 启动方式

当前壳子的 `tauri.conf.json` 保留默认开发地址：

```json
{
  "build": {
    "devUrl": "http://localhost:9720",
    "frontendDist": "../../../web/apps/rivet.stress.test/dist"
  }
}
```

直接在壳子目录运行 `cargo tauri dev` 时，Tauri 会加载这个默认地址。业务前端通过 `@rivet/cli` 启动时，CLI 会根据业务项目的 `vite.config.ts` 生成 `.rivet/tauri.dev.conf.json`，并通过 `cargo tauri dev --config` 覆盖 `devUrl` 和 `frontendDist`。

业务前端可以直接通过统一 CLI 启动浏览器模式：

```powershell
pnpm --dir src\web --filter rivet.stress.test dev
```

也可以通过统一 CLI 启动壳子模式，它会先启动 Vite，再启动 Tauri 壳：

```powershell
pnpm --dir src\web --filter rivet.stress.test dev:shell
```

业务前端通过 `@rivet/cli/vite` 的 `rivet()` 插件接入壳子开发能力。通常只需要保留标准 Vite 监听配置，并在 `rivet.server.url` 填写后端地址；`/bridge` 代理由插件自动注入：

```ts
import { defineConfig } from 'vite'
import { rivet } from '@rivet/cli/vite'

export default defineConfig({
    plugins: [rivet()],
    server: {
        host: '127.0.0.1',
        port: 9720,
    },
    rivet: {
        server: {
            url: 'http://localhost:9710',
        },
    },
})
```

如果前端需要连接后端压测服务，还需要手动启动 server：

```powershell
dotnet run --project src\server\apps\rivet.stress.test.server\Rivet.StressTest.Server.csproj
```

当前阶段壳子不自动拉起 server。后续会通过 `@rivet/cli` 和 sidecar 配置，把 server 发布、复制、启动流程封装起来。

## 检查命令

只检查 Rust/Tauri 工程是否能编译：

```powershell
cargo check --manifest-path src\shell\core\rivet.shell\Cargo.toml
```

查看 Tauri CLI 版本：

```powershell
cargo tauri --version
```

## 后续方向

后续 `rivet.shell` 不会要求业务开发者直接修改 Rust 工程。计划中的使用方式是：

```text
web/apps/mysoow.toolkit
  package.json scripts 调用 rivet CLI
  vite.config.ts 的 rivet 字段配置前端 devUrl、dist、server 发布命令和 sidecar 参数

@rivet/cli
  读取配置
  生成或复用 Tauri 壳模板
  启动 Vite 和 Tauri dev，加载业务前端 devUrl
  打包时发布 server 并构建桌面应用
```

也就是说，业务项目的入口会逐步收敛到前端应用，壳子作为工程工具和模板存在。
