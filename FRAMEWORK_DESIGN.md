# Rivet 框架设计思路

Rivet 的目标是让上位机项目用 .NET 写本地服务和硬件业务，用 Vue 写界面，用 Tauri 做可选桌面壳。框架本身不应该和具体业务绑定，业务项目只引用需要的核心能力。

## 目录结构

```text
src/
  server/
    core/
      rivet.core/                 # 服务端公开核心：Attribute、基础抽象
      rivet.generator/            # Source Generator：扫描 C# 标记并生成桥接代码
      rivet.hosting/              # 后续加入：SignalR/Kestrel/DI/BridgeContext 封装
    apps/
      rivet.stress.test.server/   # 压测服务，用来验证通信性能
      mysoow.toolkit.server/      # 后续真实业务服务示例

  web/
    core/
      rivet.client/               # 后续加入：前端运行时核心，未来发布 @rivet/client
      rivet.shell/                # 后续加入：shell CLI，未来发布 @rivet/shell
    apps/
      rivet.stress.test/          # 压测前端，用来验证通信性能
      mysoow.toolkit/             # 后续真实业务前端入口

  shell/
    core/
      rivet.shell/                # Tauri 壳工程，后续可作为模板由 @rivet/shell 生成
```

目录使用小写加点号，贴近 .NET 项目命名，也能统一 server、web、shell 三层的视觉风格。语言内部仍按各自生态命名：C# 用 PascalCase，Rust crate 用 snake_case，npm 包按 npm 规范。

## 分层原则

- `server/core` 是服务端框架能力，业务服务引用它，不把业务代码写进核心。
- `web/core` 是前端框架能力，业务前端引用它，不直接散落 SignalR 细节。
- `shell/core` 是桌面壳能力，业务前端通过 `@rivet/shell` CLI 或脚本使用它，而不是在浏览器代码里 import Rust 工程。
- `apps` 下放真实业务或验证程序。`rivet.stress.test` 验证性能边界，`mysoow.toolkit` 后续作为真实业务验证项目。

## 包和启动方式

后期包形态建议拆成：

- `Rivet.Core` / `Rivet.Hosting` / `Rivet.Generator`：NuGet 包，服务端业务引用。
- `@rivet/client`：npm 包，前端业务运行时引用，提供连接管理和 `rv` 对象。不使用桌面壳时，业务前端只依赖这个包即可。
- `@rivet/shell`：npm 工具包，提供统一的 `rivet` CLI，业务前端需要桌面壳或打包桌面程序时再引入。它可以依赖 `@rivet/client`，但业务代码如果直接 `import '@rivet/client'`，仍建议显式声明 `@rivet/client`。

浏览器开发模式只需要启动服务和前端：

```text
dotnet run  # 业务 server
pnpm dev    # 业务 web
```

桌面开发模式由前端项目脚本调用 shell CLI：

```text
pnpm dev:shell
```

这个命令由 `@rivet/shell` 提供的 `rivet dev --shell` 编排：先启动本业务的 Vite dev server，确认 `devUrl` 可访问后，再启动 Tauri 壳。业务项目只保留简单的 package scripts，框架配置集中写在 `vite.config.ts` 的 `rivet` 字段里，用于配置前端端口、后端进程、打包命令和 sidecar 参数。开发阶段可以不自动拉起 server，开发者手动启动服务；打包阶段再根据配置发布 server、复制 sidecar、生成 Tauri 配置并构建桌面程序。

`vite.config.ts` 是业务前端的配置入口。当前 `rivet` 字段先用于共享 Vite 端口、后端地址和壳子启动参数；后续 `@rivet/client` 如需读取这些配置，应通过 Vite 插件、虚拟模块或生成文件注入到浏览器代码中，而不是让浏览器运行时直接读取本地配置文件。

## 代码生成归属

TypeScript 代理和契约信息的源头在服务端，因为只有 C# 侧知道哪些方法、字段、事件被 `[JsCallable]`、`[JsBindable]`、`[JsEvent]` 暴露。

MVP 阶段可以由 `Rivet.Generator` 直接生成前端需要的 `rv.generated.ts` 到业务前端配置的目录。后续再升级为：

```text
C# Attribute -> rivet.contract.json -> Vite plugin / @rivet/client 消费 -> 业务代码使用 rv
```

这样服务端负责定义契约，前端负责消费契约，边界清晰。
