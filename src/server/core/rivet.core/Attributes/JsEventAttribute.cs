using System;

namespace Rivet.Core.Attributes;

/// <summary>
/// 标记一个事件用于自动广播到前端 JavaScript。
/// Source Generator 会自动生成：
///   - 事件订阅，将触发的事件通过 SignalR 转发到前端
///   - TypeScript 事件监听代理
/// </summary>
[AttributeUsage(AttributeTargets.Event, Inherited = false, AllowMultiple = false)]
public sealed class JsEventAttribute : Attribute
{
    /// <summary>
    /// 暴露给前端的事件名称。不设置时使用 C# 事件名称。
    /// </summary>
    public string? Name { get; set; }
}
