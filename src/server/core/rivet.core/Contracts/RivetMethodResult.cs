namespace Rivet.Core;

/// <summary>
/// 前端调用后端业务方法的返回结果。MessagePack 动态序列化要求 Hub 返回类型为公开类型。
/// </summary>
public sealed class RivetMethodResult
{
    /// <summary>
    /// 调用是否成功。
    /// </summary>
    public bool Success { get; init; }

    /// <summary>
    /// 方法返回值。
    /// </summary>
    public object? Value { get; init; }

    /// <summary>
    /// 失败原因。
    /// </summary>
    public string? Error { get; init; }

    /// <summary>
    /// 创建成功结果。
    /// </summary>
    public static RivetMethodResult Ok(object? value)
    {
        return new RivetMethodResult { Success = true, Value = value };
    }

    /// <summary>
    /// 创建失败结果。
    /// </summary>
    public static RivetMethodResult Fail(string error)
    {
        return new RivetMethodResult { Success = false, Error = error };
    }
}
