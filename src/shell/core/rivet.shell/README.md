# rivet.shell

`rivet.shell` 是 Rivet 的 Tauri 桌面壳工程。它负责把前端页面加载到系统 WebView 中，后续会负责拉起本地 `.NET server` 进程，并最终沉淀为 `@rivet/shell` CLI 使用的壳模板。

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
- Tauri CLI
- Node.js / pnpm

当前机器可用以下命令检查：

```powershell
rustc --version
cargo --version
cargo tauri --version
node -v
pnpm -v
```

## 启动方式

当前壳子的 `tauri.conf.json` 配置：

```json
{
  "build": {
    "devUrl": "http://localhost:9720",
    "frontendDist": "../../../web/apps/rivet.stress.test/dist"
  }
}
```

开发模式下，Tauri 会加载 `http://localhost:9720`。因此需要先启动前端：

```powershell
pnpm --dir src\web --filter rivet.stress.test dev
```

然后在另一个终端启动壳子：

```powershell
cargo tauri dev --manifest-path src\shell\core\rivet.shell\Cargo.toml
```

如果前端需要连接后端压测服务，还需要手动启动 server：

```powershell
dotnet run --project src\server\apps\rivet.stress.test.server\Rivet.StressTest.Server.csproj
```

当前阶段壳子不自动拉起 server。后续会通过 `@rivet/shell` CLI 和 sidecar 配置，把 server 发布、复制、启动流程封装起来。

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
  package.json scripts 先启动业务前端，再调用 @rivet/shell
  rivet.config.ts 配置前端 devUrl、dist、server 发布命令和 sidecar 参数

@rivet/shell
  读取配置
  生成或复用 Tauri 壳模板
  启动 Tauri dev，加载业务前端已经启动好的 devUrl
  打包时发布 server 并构建桌面应用
```

也就是说，业务项目的入口会逐步收敛到前端应用，壳子作为工程工具和模板存在。
