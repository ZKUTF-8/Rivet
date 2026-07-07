namespace Rivet.Core;

/// <summary>
/// Rivet 方法参数契约。
/// </summary>
internal sealed class RivetMethodParameter
{
    /// <summary>
    /// 参数名称。
    /// </summary>
    public required string Name { get; init; }

    /// <summary>
    /// 参数的 CLR 类型名称。
    /// </summary>
    public required string Type { get; init; }
}
