namespace Rivet.Core;

/// <summary>
/// 传给前端的 Rivet 变量状态。
/// </summary>
internal sealed class RivetVariableState
{
    /// <summary>
    /// 前后端统一变量键。
    /// </summary>
    public required string Name { get; init; }

    /// <summary>
    /// 当前变量值。
    /// </summary>
    public object? Value { get; init; }
}
