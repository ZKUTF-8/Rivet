using Microsoft.AspNetCore.SignalR;

namespace Rivet.Core;

/// <summary>
/// Rivet 当前的 SignalR 传输端点。业务项目不直接依赖这个类型，由 MapRivet 自动注册。
/// </summary>
internal sealed class RivetSignalRHub : Hub
{
    /// <summary>
    /// 传输端点委托的运行时注册表，负责真正的变量读写和方法调用。
    /// </summary>
    private readonly RivetRuntime _runtime;

    /// <summary>
    /// 创建 SignalR 传输端点实例。
    /// </summary>
    public RivetSignalRHub(RivetRuntime runtime)
    {
        _runtime = runtime;
    }

    /// <summary>
    /// 获取当前变量快照。
    /// </summary>
    public IReadOnlyDictionary<string, RivetVariableState> GetSnapshot()
    {
        return _runtime.GetSnapshot();
    }

    /// <summary>
    /// 写入一个 JSON 形式的变量值。
    /// </summary>
    public RivetVariableState SetVariable(string name, string? valueJson)
    {
        return _runtime.SetVariable(name, valueJson, Context.ConnectionId);
    }

    /// <summary>
    /// 调用一个业务方法，成功时直接返回业务值，失败时交给 SignalR 错误通道。
    /// </summary>
    public async Task<object?> InvokeMethod(string name, string? argsJson)
    {
        try
        {
            return await _runtime.InvokeAsync(name, argsJson).ConfigureAwait(false);
        }
        catch (Exception ex)
        {
            throw new HubException(ex.Message);
        }
    }

    /// <summary>
    /// 新客户端连接时主动推送初始变量快照。
    /// </summary>
    public override async Task OnConnectedAsync()
    {
        await Clients.Caller.SendAsync(RivetProtocolEvents.InitialState, _runtime.GetSnapshot());
        await base.OnConnectedAsync();
    }
}
