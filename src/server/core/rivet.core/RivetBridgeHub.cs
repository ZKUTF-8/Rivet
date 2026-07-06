using Microsoft.AspNetCore.SignalR;

namespace Rivet.Core;

/// <summary>
/// Rivet 内置 Bridge Hub。业务项目不直接依赖这个类型，由 MapRivet 自动注册。
/// </summary>
public sealed class RivetBridgeHub : Hub
{
    private readonly RivetRuntime _runtime;

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
    /// 写入一个字符串形式的变量值。MVP 阶段先覆盖常见基础类型。
    /// </summary>
    public async Task<RivetVariableState> SetVariable(string name, string? value)
    {
        var state = _runtime.SetVariable(name, value);
        await Clients.All.SendAsync("RivetVariableChanged", state);
        return state;
    }

    /// <summary>
    /// 调用一个业务方法。
    /// </summary>
    public async Task<RivetMethodResult> InvokeMethod(string name, string? value)
    {
        var result = await _runtime.InvokeAsync(name, value);
        await Clients.All.SendAsync("RivetSnapshot", _runtime.GetSnapshot());
        return result;
    }

    /// <summary>
    /// 新客户端连接时主动推送初始变量快照。
    /// </summary>
    public override async Task OnConnectedAsync()
    {
        await Clients.Caller.SendAsync("RivetInitialState", _runtime.GetSnapshot());
        await base.OnConnectedAsync();
    }
}
