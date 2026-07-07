# Rivet

**.NET + Vue 上位机快速开发框架。标记 C# 特性，自动生成前后端桥接代码，零胶水代码。**

> 🚧 本项目处于早期开发阶段，尚未发布可用版本。

[English](./README_EN.md)

---

## 它解决什么问题？

上位机开发中，.NET (C#) 是后端主力，但桌面 UI 框架（WPF / Avalonia）的布局能力、组件生态和开发效率远不如 Web 前端。

Rivet 让你用 .NET 处理硬件和业务逻辑，用 Vue 构建现代 UI，中间的通信代码全部自动生成——开发者只关注业务，不写胶水。

## 最终体验

```csharp
// .NET 后端：写业务逻辑，打标记
public class DeviceService
{
    [JsCallable]
    public async Task<bool> StartCollection(int channel) { /* ... */ }

    public Rv<double> Temperature { get; } = new(0);

    [JsEvent]
    public event Action<double[]> OnDataReceived;
}
```

```vue
<!-- Vue 前端：直接用，无需手写任何通信代码 -->
<script setup>
await rv.device.startCollection(1)
rv.device.onDataReceived.listen((data) => { /* ... */ })
</script>

<template>
  <div>温度: {{ rv.device.temperature.value }} ℃</div>
</template>
```

## 当前验证项目

仓库内已经拆出一个真实业务样板 `Mysoow.Toolkit`，用于验证应用层是否可以只关心业务代码：

- 后端：`src/server/apps/mysoow.toolkit.server`
- 前端：`src/web/apps/mysoow.toolkit`
- 壳子：复用 `src/shell/core/rivet.shell`

启动后端：

```powershell
dotnet run --project src/server/apps/mysoow.toolkit.server/Mysoow.Toolkit.Server.csproj
```

后端入口使用 ASP.NET Core 原生宿主，Rivet 只是注入进去：

```csharp
var builder = WebApplication.CreateBuilder(args);

builder.Services.AddSingleton<ToolkitService>();

builder.AddRivet(rivet =>
{
    rivet.ApplicationName = "Mysoow.Toolkit Server";
    rivet.BridgePath = "/bridge";
});

var app = builder.Build();
app.MapRivet();
await app.RunAsync("http://localhost:9735");
```

启动前端浏览器模式：

```powershell
pnpm --dir src/web --filter mysoow.toolkit dev
```

启动前端壳子模式：

```powershell
pnpm --dir src/web --filter mysoow.toolkit dev:shell
```

## 许可证

- **开源使用**：[AGPL-3.0](./LICENSE) — 个人学习、开源项目免费使用
- **商业使用**：闭源商业项目需购买商业许可，详见 [商业许可说明](./LICENSE_COMMERCIAL.md)
