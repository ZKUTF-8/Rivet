# Rivet 运行机制说明

本文说明当前第一阶段开发运行机制。长期架构见 `FRAMEWORK_DESIGN.md`。

## 核心边界

- 业务后端项目负责注册 singleton 服务、配置 ASP.NET Core 监听地址、调用 `AddRivet` 和 `MapRivet`。
- `rivet.generator` 在后端构建时生成 `.rivet/rivet.contract.json`。
- `@rivet/cli` 提供 `rivet` 命令，负责生成 `.rivet/generated/rv.generated.ts`、启动 Vite，并在需要时启动 Tauri。
- `@rivet/cli/vite` 提供 `rivet()` 插件，把隐藏生成物注入到 `@rivet/client` 的默认生成入口。
- `@rivet/client` 是浏览器运行时，只负责连接、变量同步和方法调用。
- `@rivet/client` 安装后自动连接；首次连接失败和已连接后的断线都会按内部固定 2 秒间隔持续重试。
- `src/shell/core/rivet.shell` 是 CLI 在壳子模式下调用的内置 Tauri 壳工程，不再保留单独的 `@rivet/shell` npm 包。

## 命令入口

业务前端项目通过 `package.json` 调用：

```json
{
    "scripts": {
        "dev": "rivet dev",
        "dev:shell": "rivet dev --shell",
        "generate": "rivet generate",
        "build": "rivet generate && vue-tsc --noEmit -p tsconfig.json && vue-tsc --noEmit -p tsconfig.node.json && vite build"
    }
}
```

`rivet` 命令来自 `src/web/core/rivet.cli` 的 `@rivet/cli`。

## 配置来源

`vite.config.ts` 通过 `rivet()` 插件接入隐藏生成物，并自动注入 `/bridge` Vite 代理。`rivet` 字段只描述后端项目、后端访问地址和必要的生成配置：

```ts
plugins: [rivet(), vue()],
rivet: {
    server: {
        project: '../../../server/apps/mysoow.toolkit.server/Mysoow.Toolkit.Server.csproj',
        url: 'http://localhost:9735',
    },
}
```

不配置 `generated.out` 时默认写入 `.rivet/generated/rv.generated.ts`。这个文件属于框架管理的隐藏中间产物，不提交到仓库，也不要求业务代码导入。

`server.url` 只表示前端访问后端的地址，Rivet 会根据它自动配置 Vite `/bridge` 代理；它不配置 ASP.NET Core 监听端口。后端端口由后端宿主自己负责。

## 生成流程

`rivet generate` 会：

```text
dotnet build 后端项目
  -> rivet.generator 更新 .rivet/rivet.contract.json
  -> @rivet/cli 读取 contract
  -> 写入 .rivet/generated/rv.generated.ts
```

contract 或 TS 生成失败时保留上一份成功文件，避免前端拿到半截生成结果。

`rivet dev` 会先从已有 contract 生成一次 TypeScript，然后只监听后端项目 `.rivet/rivet.contract.json`，文件变化后刷新 `.rivet/generated/rv.generated.ts`，最后启动 Vite。CLI 不启动后端服务进程，也不监听后端源码、不主动构建后端项目。

后端 contract 由后端自己的构建链路刷新：开发时推荐用 `dotnet watch run --project ...` 或 IDE 的文件变更自动生成能力；CI、构建前或 Agent 需要显式刷新时使用 `rivet generate`。

`rivet generate` 会显式执行一次普通后端构建，用于触发 `rivet.generator`。开发时如果后端服务正在运行并锁定输出文件，应优先依赖 `dotnet watch run` 或 IDE 自动构建刷新 contract；需要手动 `rivet generate` 时再按应用自己的方式处理后端进程。

## 壳子启动

`rivet dev --shell` 在 `rivet dev` 的基础上启动：

```text
cargo tauri dev --config .rivet/tauri.dev.conf.json
```

临时 Tauri 配置会写入业务前端项目的 `.rivet/tauri.dev.conf.json`，其中包含实际 `devUrl` 和 `frontendDist`。

CLI 会把下面的环境变量传给 Tauri 进程：

```text
RIVET_WEB_DEV_URL
RIVET_SERVER_URL
RIVET_BRIDGE_PATH
```

## 调试入口

- 生成失败：看后端项目 `.rivet/rivet.contract.json`、前端项目 `.rivet/generated/rv.generated.ts` 和 `src/web/core/rivet.cli/cli/rivet.js`。
- 前端连接失败：看 `src/web/core/rivet.client/src/runtime.ts` 和 Vite proxy。
- Hub 行为异常：看 `src/server/core/rivet.core/Bridge` 和 `Runtime`。
- 壳子没加载正确地址：看 `.rivet/tauri.dev.conf.json` 和 `src/shell/core/rivet.shell/tauri.conf.json`。
