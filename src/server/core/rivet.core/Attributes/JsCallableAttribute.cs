using System;

namespace Rivet.Core.Attributes;

/// <summary>
/// 标记一个方法可以从前端 JavaScript 通过 SignalR 调用。
/// Source Generator 会自动生成对应的 Hub 方法和 TypeScript 代理函数。
/// </summary>
[AttributeUsage(AttributeTargets.Method, Inherited = false, AllowMultiple = false)]
public sealed class JsCallableAttribute : Attribute
{
}
