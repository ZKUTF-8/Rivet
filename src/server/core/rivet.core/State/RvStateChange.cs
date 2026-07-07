namespace Rivet.Core;

/// <summary>
/// Rivet 状态变更消息。
/// </summary>
internal sealed class RvStateChange
{
    /// <summary>
    /// 创建一次状态变更通知。
    /// </summary>
    public RvStateChange(string key, string? excludedConnectionId)
    {
        Key = key;
        ExcludedConnectionId = excludedConnectionId;
    }

    /// <summary>
    /// 发生变化的变量键。
    /// </summary>
    public string Key { get; }

    /// <summary>
    /// 不应接收本次推送的连接。
    /// </summary>
    public string? ExcludedConnectionId { get; }
}
