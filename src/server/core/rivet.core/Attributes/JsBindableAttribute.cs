using System;

namespace Rivet.Core.Attributes;

/// <summary>
/// 标记一个 Rv&lt;T&gt; 属性用于 .NET 与前端 JavaScript 之间的双向同步。
/// Source Generator 会据此生成 TypeScript 响应式绑定。
/// </summary>
[AttributeUsage(AttributeTargets.Property, Inherited = false, AllowMultiple = false)]
public sealed class JsBindableAttribute : Attribute
{
    /// <summary>
    /// 暴露给前端的变量名称。不设置时使用字段或属性名称。
    /// </summary>
    public string? Name { get; set; }

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
