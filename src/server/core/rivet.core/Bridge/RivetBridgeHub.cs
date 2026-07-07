using Microsoft.AspNetCore.SignalR;

namespace Rivet.Core;

/// <summary>
/// Rivet 内置 Bridge Hub。业务项目不直接依赖这个类型，由 MapRivet 自动注册。
/// </summary>
internal sealed class RivetBridgeHub : Hub
{
    /// <summary>
    /// Bridge Hub 委托的运行时注册表，负责真正的变量读写和方法调用。
    /// </summary>
    private readonly RivetRuntime _runtime;

    /// <summary>
    /// 创建 Bridge Hub 实例。
    /// </summary>
    public RivetBridgeHub(RivetRuntime runtime)
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
    /// 调用一个业务方法。
    /// </summary>
    public Task<RivetMethodResult> InvokeMethod(string name, string? argsJson)
    {
        return _runtime.InvokeAsync(name, argsJson);
    }

    /// <summary>
    /// 新客户端连接时主动推送初始变量快照。
    /// </summary>
    public override async Task OnConnectedAsync()
    {
        await Clients.Caller.SendAsync(RivetHubEvents.InitialState, _runtime.GetSnapshot());
        await base.OnConnectedAsync();
    }
}
