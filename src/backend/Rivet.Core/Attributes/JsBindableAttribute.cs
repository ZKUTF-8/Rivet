using System;

namespace Rivet.Core.Attributes;

/// <summary>
/// 标记一个字段用于 .NET 与前端 JavaScript 之间的双向同步。
/// Source Generator 会自动生成：
///   - 带变更追踪的属性 setter，值变化时通过 SignalR 推送到前端
///   - Hub 方法，用于接收前端发来的属性修改
///   - TypeScript 响应式绑定（Vue ref）
/// </summary>
[AttributeUsage(AttributeTargets.Field, Inherited = false, AllowMultiple = false)]
public sealed class JsBindableAttribute : Attribute
{
    /// <summary>
    /// 向前端推送更新的节流间隔（毫秒）。
    /// 设为 0 表示每次变更都立即推送。
    /// </summary>
    public int ThrottleMs { get; set; } = 0;

    /// <summary>
    /// 若为 true，则每次变更都立即推送，忽略 ThrottleMs 设置。
    /// </summary>
    public bool Immediate { get; set; } = true;
}
