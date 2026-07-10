namespace Rivet.Core;

/// <summary>
/// Rivet 运行时发布变量变化的内部协议出口，由具体传输实现负责发送。
/// </summary>
internal interface IRivetVariablePublisher
{
    /// <summary>
    /// 把变量变化发布给前端连接。
    /// </summary>
    /// <param name="state">已经转换成协议模型的变量状态。</param>
    /// <param name="excludedConnectionId">需要排除的连接 ID，通常是发起前端写入的连接。</param>
    Task PublishVariableChangedAsync(RivetVariableState state, string? excludedConnectionId);
}
