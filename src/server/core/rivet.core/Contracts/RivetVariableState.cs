namespace Rivet.Core;

/// <summary>
/// 传给前端的 Rivet 变量状态。MessagePack 动态序列化要求 Hub 返回类型为公开类型。
/// </summary>
public sealed class RivetVariableState
{
    /// <summary>
    /// 前后端统一变量键。
    /// </summary>
    public required string Name { get; init; }

    /// <summary>
    /// 当前变量值。
    /// </summary>
    public object? Value { get; init; }

    /// <summary>
    /// 后端 CLR 类型名。
    /// </summary>
    public required string Type { get; init; }

    /// <summary>
    /// 生成快照时的服务端时间戳。
    /// </summary>
    public long UpdatedAt { get; init; }
}
