namespace Rivet.Core;

/// <summary>
/// Rivet 服务契约，描述一个后端服务暴露给前端的成员。
/// </summary>
internal sealed class RivetServiceContract
{
    /// <summary>
    /// CLR 服务类型名称。
    /// </summary>
    public required string ClrName { get; init; }

    /// <summary>
    /// 前端访问名称。
    /// </summary>
    public required string Name { get; init; }

    /// <summary>
    /// 可绑定变量。
    /// </summary>
    public required IReadOnlyList<RivetVariableContract> Variables { get; init; }

    /// <summary>
    /// 可调用方法。
    /// </summary>
    public required IReadOnlyList<RivetMethodContract> Methods { get; init; }
}

/// <summary>
/// Rivet 可绑定变量契约。
/// </summary>
internal sealed class RivetVariableContract
{
    /// <summary>
    /// 前后端统一变量键。
    /// </summary>
    public required string Key { get; init; }

    /// <summary>
    /// 前端变量名称。
    /// </summary>
    public required string Name { get; init; }

    /// <summary>
    /// 变量值类型。
    /// </summary>
    public required string Type { get; init; }
}

/// <summary>
/// Rivet 可调用方法契约。
/// </summary>
internal sealed class RivetMethodContract
{
    /// <summary>
    /// 前后端统一方法键。
    /// </summary>
    public required string Key { get; init; }

    /// <summary>
    /// 前端方法名称。
    /// </summary>
    public required string Name { get; init; }

    /// <summary>
    /// 方法参数。
    /// </summary>
    public required IReadOnlyList<RivetMethodParameter> Parameters { get; init; }

    /// <summary>
    /// 返回值类型。
    /// </summary>
    public required string ReturnType { get; init; }
}
