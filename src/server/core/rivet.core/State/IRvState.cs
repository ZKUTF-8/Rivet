namespace Rivet.Core;

/// <summary>
/// Rivet 状态对象的内部接口。
/// </summary>
internal interface IRvState
{
    /// <summary>
    /// 状态值的 CLR 类型。
    /// </summary>
    Type ValueType { get; }

    /// <summary>
    /// 当前状态值。
    /// </summary>
    object? UntypedValue { get; }

    /// <summary>
    /// 绑定运行时发布器。
    /// </summary>
    void Attach(string key, Action<RvStateChange> publish);

    /// <summary>
    /// 使用 JSON 文本写入状态。
    /// </summary>
    void SetJson(string? valueJson, string? excludedConnectionId);
}
