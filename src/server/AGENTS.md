# .NET 服务端通用规则

本文件适用于 `src/server` 下的全部 .NET 项目，在根规则基础上说明服务端公共边界和各项目差异。

## 技术与编码

- 当前服务端目标框架为 .NET 10；只有 Source Generator 因 Roslyn 兼容要求使用 `netstandard2.0`。
- C# 项目和命名空间使用 PascalCase。
- 保持公开 API 最小。业务项目不需要直接引用的类型和成员优先使用 `internal` 或 `private`。
- 严格执行根规则的强制 XML 文档注释要求；私有字段、私有方法和内部实现也不例外。
- 异步 I/O 使用 `Task`、`Task<T>` 和 `async/await`，不要用同步等待阻塞异步调用。

## 宿主与协议边界

- 后端监听地址和端口由 ASP.NET Core 宿主、配置文件、环境变量或部署环境负责。
- Rivet 只负责 Bridge 传输端点路径，默认且当前固定使用 `/bridge`；不要向 `RivetOptions` 添加 Host 或 Port。
- `Rivet.Core` 不调用 `AddCors` 或 `UseCors`；跨域策略由应用层按部署方式配置。
- Rivet 不创建业务服务实例，只扫描和使用已经注册到 DI 的 singleton 服务。
- 带 `[JsCallable]`、`[JsBindable]`、`[JsEvent]` 或公开 `Rv<T>` 状态的服务必须注册为 singleton。
- 修改 SignalR 方法名、事件名、contract 字段或序列化形状时，同步检查生成器、CLI、客户端、测试项目和落地应用。

## 验证

修改服务端核心、生成器或服务端应用后，至少执行：

```powershell
dotnet build src/server/Rivet.slnx
```

若修改 contract 或生成链路，还要执行对应应用的前端生成或完整构建，确认上下游兼容。

## 核心项目

### `core/rivet.core`

- `Rivet.Core` 是 `net10.0` 框架核心，提供 Attribute、`Rv<T>`、宿主扩展、运行时和 SignalR Bridge。
- 对业务公开的入口限于 Attribute、`Rv<T>`、`RivetOptions`、`AddRivet`、`MapRivet` 及协议序列化确实需要公开的模型。
- `[JsBindable]` 当前只是可选显式标记；被标记成员仍必须符合公开实例 `Rv<T>` 属性约定。
- 新增 Attribute 时沿用 `Js` + 动词或形容词 + `Attribute` 的命名模式。
- 运行时扫描、服务解析、连接状态和变量推送代码必须明确线程安全与生命周期边界。
- 核心当前使用 SignalR JSON 协议；不要把压测项目的 MessagePack 依赖引入核心，除非传输抽象设计已经同步落地。

### `core/rivet.generator`

- `Rivet.Generator` 是目标为 `netstandard2.0` 的 Roslyn Source Generator，生成语言无关的 `rivet.contract.json`。
- 使用 `IIncrementalGenerator`，不要改回 `ISourceGenerator`。
- 扫描 `[JsCallable]`、`[JsBindable]`、`[JsEvent]` 和公开 `Rv<T>` 属性。
- singleton 注册是否合法由运行时校验，生成器不分析 DI 生命周期。
- contract 生成成功后才覆盖旧文件；失败时保留上一份成功结果，不能写入半截文件。
- contract 应携带可获得的 C# XML 文档，供 CLI 生成前端 TSDoc。
- 修改 contract schema 时必须同步检查 `@rivet/cli` 的解析和生成逻辑，并为不兼容输入提供明确诊断。

## 应用项目

### `apps/rivet.stress.test.server`

- 该项目是本地通信和性能测试服务，不代表 Rivet 核心的默认传输配置。
- 后端监听 `http://localhost:9710`，Hub 路径为 `/bridge`。
- 同时支持 SignalR JSON 和 MessagePack；MessagePack 用于默认压测，但没有替代或移除 JSON。
- 宽松 CORS 仅用于本地开发和性能测试，不得复制到落地应用或框架核心。
- Hub 方法使用 PascalCase，异步方法使用 `Task` 或 `Task<T>`。
- `StressTestService` 的共享状态和统计数据必须保持线程安全；性能优化不得绕过现有同步边界。
- Hub 当前为手写实现，不代表框架核心公开 API；是否迁移生成代码以实际生成能力为准。

### `apps/mysoow.toolkit.server`

- 该项目是 Mysoow 内部工具的服务端，也是 Rivet 第一个真实落地实验应用的一部分。
- 当前宿主监听 `http://localhost:9735`，Bridge 路径为 `/bridge`。
- 业务服务由应用显式注册为 singleton，并通过 `AddRivet`、`MapRivet` 接入框架。
- 不在应用中复制 Rivet 核心运行时、反射扫描或 SignalR Hub 实现。
- 不添加宽松的全来源 CORS；如部署方式需要跨域，由应用按明确来源配置。
- 修改公开契约成员后，重新生成 contract 和 TypeScript 代理，并验证前后端命名一致。
