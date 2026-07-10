using Microsoft.AspNetCore.SignalR;
using Microsoft.Extensions.Logging;

namespace Rivet.Core;

/// <summary>
/// 基于 SignalR 的变量变化发布器。
/// </summary>
internal sealed class RivetSignalRVariablePublisher : IRivetVariablePublisher
{
    /// <summary>
    /// SignalR Hub 上下文，用于向当前所有前端连接推送协议事件。
    /// </summary>
    private readonly IHubContext<RivetSignalRHub> _hubContext;

    /// <summary>
    /// 发布器日志，用于记录推送失败等传输层诊断信息。
    /// </summary>
    private readonly ILogger<RivetSignalRVariablePublisher> _logger;

    /// <summary>
    /// 创建 SignalR 变量变化发布器。
    /// </summary>
    public RivetSignalRVariablePublisher(
        IHubContext<RivetSignalRHub> hubContext,
        ILogger<RivetSignalRVariablePublisher> logger)
    {
        _hubContext = hubContext;
        _logger = logger;
    }

    /// <inheritdoc />
    public async Task PublishVariableChangedAsync(RivetVariableState state, string? excludedConnectionId)
    {
        try
        {
            if (string.IsNullOrWhiteSpace(excludedConnectionId))
            {
                await _hubContext.Clients.All.SendAsync(RivetProtocolEvents.VariableChanged, state).ConfigureAwait(false);
                return;
            }

            await _hubContext.Clients.AllExcept(excludedConnectionId)
                .SendAsync(RivetProtocolEvents.VariableChanged, state)
                .ConfigureAwait(false);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to publish Rivet variable {VariableName}.", state.Name);
        }
    }
}
