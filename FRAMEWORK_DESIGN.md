# Rivet 框架设计思路

Rivet 的目标是让上位机项目用 .NET 写本地服务和硬件业务，用 Vue 写界面，用 Tauri 做可选桌面壳。框架本身不和具体业务绑定，业务项目只引用需要的核心能力。

## 目录结构

```text
src/
  server/
    core/
      rivet.core/                 # 服务端核心：Attribute、Rv<T>、宿主、传输端点、运行时
      rivet.generator/            # Source Generator：扫描 C# 标记并生成 rivet.contract.json
    apps/
      rivet.stress.test.server/   # 压测服务，用来验证通信性能
      mysoow.toolkit.server/      # 真实业务服务示例，验证应用层使用方式

  web/
    core/
      rivet.client/               # 浏览器运行时，未来发布 @rivet/client
      rivet.cli/                  # 开发 CLI，未来发布 @rivet/cli
    apps/
      rivet.stress.test/          # 压测前端
      mysoow.toolkit/             # 真实业务前端入口

  shell/
    core/
      rivet.shell/                # Tauri 壳工程，后续可作为模板复用
```

目录使用小写加点号。语言内部仍按各自生态命名：C# 用 PascalCase，Rust crate 使用 snake_case，npm 包按 npm 规范。

## 后端模型

业务服务由用户注册到 DI。Rivet 不创建业务实例，只扫描和使用已经注册的 singleton 服务：

```csharp
var builder = WebApplication.CreateBuilder(args);

builder.Services.AddSingleton<ToolkitService>();

builder.AddRivet(options =>
{
    options.ApplicationName = "Mysoow.Toolkit Server";
    options.BridgePath = "/bridge";
});

var app = builder.Build();
app.MapRivet();
await app.RunAsync("http://localhost:9735");
```

Rivet 不负责后端监听端口，端口和地址由 ASP.NET Core 宿主、配置文件、环境变量或部署系统决定。`RivetOptions` 只保留传输端点路径、应用名称等框架内配置。跨域策略属于应用层，业务项目按自己的部署方式显式配置。

第一阶段所有带 `[JsCallable]`、`[JsBindable]`、`[JsEvent]` 或公开 `Rv<T>` 状态的服务都必须是 singleton。未注册、scoped 或 transient 会在启动时失败。

可绑定状态使用 `Rv<T>`：

```csharp
public sealed class ToolkitService
{
    public Rv<string> Message { get; } = new("后端初始值");

    [JsCallable]
    public string Echo(string value)
    {
        Message.Value = $"后端收到：{value}";
        return Message.Value;
    }
}
```

`Rv<T>.Value` 变化会通知前端。集合内部变化不会被普通 `List<T>.Add()` 自动捕获，第一阶段需要重新赋值或调用 `NotifyChanged()`。

## 前端模型

前端业务运行时只依赖 `@rivet/client`，开发期依赖 `@rivet/cli`。`@rivet/client` 不读写文件，不依赖 CLI；应用专属生成物由 CLI 写入 `.rivet/generated`，再由 `@rivet/cli/vite` 插件把它接到运行时默认入口。

业务入口不需要导入生成文件：

```ts
import { createBackend } from '@rivet/client'

createApp(App)
    .use(createBackend())
    .mount('#app')
```

组件中直接使用全局 `rv`：

```ts
rv.toolkit.message.value = 'abc'
await rv.toolkit.echo('abc')
```

`@rivet/client` 负责连接状态、初始快照、变量 ref、方法调用和后端推送更新。`createBackend()` 安装后默认立即连接后端并拉取快照；当前传输实现使用 SignalR JSON，后续会抽象为可替换 transport。前端写变量时本地先更新，再调用后端 `SetVariable`；后端不会把同一次写入回推给发起连接。

## 契约和生成

契约源头在 C#。`rivet.generator` 编译期扫描 `[JsCallable]`、`[JsBindable]`、`[JsEvent]` 和公开 `Rv<T>` 属性，生成语言无关的 `rivet.contract.json`。运行时再校验这些服务是否已注册 singleton。

`@rivet/cli` 读取 contract 生成 TypeScript：

```text
C# Attribute
  -> rivet.contract.json
  -> @rivet/cli
  -> .rivet/generated/rv.generated.ts
  -> @rivet/cli/vite 注入 @rivet/client/generated
  -> 业务代码使用 rv
```

`rivet dev` 会先生成 TS，再启动 Vite，并监听 contract 变化继续更新生成文件。`rivet dev --shell` 在此基础上启动 Tauri 壳。

## 包边界

- `Rivet.Core`：服务端运行时、特性、`Rv<T>`、传输端点。
- `Rivet.Generator`：生成 `rivet.contract.json`。
- `@rivet/client`：浏览器运行时。
- `@rivet/cli`：开发命令、TS 生成、Vite 编排，并在壳子模式下调用内置 Tauri 壳工程。
- `src/shell/core/rivet.shell`：Tauri 壳工程，作为 CLI 调用的内置模板，不作为前端 npm 包暴露。
