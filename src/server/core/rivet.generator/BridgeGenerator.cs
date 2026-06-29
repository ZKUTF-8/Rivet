using Microsoft.CodeAnalysis;

namespace Rivet.Generator;

/// <summary>
/// Rivet Source Generator 占位实现。
/// 后续将扫描 [JsCallable]、[JsBindable]、[JsEvent] 特性并自动生成：
///   - SignalR Hub 方法
///   - TypeScript 类型定义和代理函数
/// </summary>
[Generator]
public class BridgeGenerator : IIncrementalGenerator
{
    public void Initialize(IncrementalGeneratorInitializationContext context)
    {
        // TODO: 实现代码生成逻辑
        // 1. 查找所有标记了 [JsCallable] / [JsBindable] / [JsEvent] 的成员
        // 2. 生成 partial BridgeHub 类，包含对应的 Hub 方法
        // 3. 生成 TypeScript 类型定义和代理代码
    }
}
