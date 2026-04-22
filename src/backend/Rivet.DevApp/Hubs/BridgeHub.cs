using Microsoft.AspNetCore.SignalR;
using Rivet.DevApp.Services;

namespace Rivet.DevApp.Hubs;

/// <summary>
/// 手写的 SignalR Hub，用于压测阶段。
/// 正式版中这些方法将由 Source Generator 自动生成。
/// </summary>
public class BridgeHub : Hub
{
    private readonly StressTestService _stressTest;

    public BridgeHub(StressTestService stressTest)
    {
        _stressTest = stressTest;
    }

    /// <summary>
    /// 使用指定参数启动压力测试。
    /// </summary>
    public async Task StartStressTest(int variableCount, int updateIntervalMs, bool useBatchMode)
    {
        _stressTest.Configure(variableCount, updateIntervalMs, useBatchMode);
        _stressTest.StartRunning();
        await Clients.Caller.SendAsync("StressTestStarted", variableCount, updateIntervalMs);
    }

    /// <summary>
    /// 停止正在运行的压力测试。
    /// </summary>
    public async Task StopStressTest()
    {
        _stressTest.StopRunning();
        await Clients.Caller.SendAsync("StressTestStopped");
    }

    /// <summary>
    /// 在运行中动态更新压测参数。
    /// </summary>
    public void UpdateConfig(int variableCount, int updateIntervalMs, bool useBatchMode)
    {
        _stressTest.Configure(variableCount, updateIntervalMs, useBatchMode);
    }

    /// <summary>
    /// 前端写入变量测试。模拟真实系统中操作员修改参数/设定值的场景。
    /// 返回服务端时间戳用于计算往返延迟。
    /// </summary>
    public WriteResult WriteVariable(string key, double value, long clientTimestamp)
    {
        return new WriteResult
        {
            Key = key,
            Value = value,
            ClientTimestamp = clientTimestamp,
            ServerTimestamp = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
            Success = true
        };
    }

    /// <summary>
    /// 模拟 [JsCallable] 方法调用，返回服务端时间戳用于计算往返延迟。
    /// </summary>
    public CallResult TestCall(string methodName, long clientTimestamp)
    {
        return new CallResult
        {
            MethodName = methodName,
            ClientTimestamp = clientTimestamp,
            ServerTimestamp = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
            Success = true
        };
    }

    /// <summary>
    /// 客户端连接时，推送当前所有变量的快照。
    /// </summary>
    public override async Task OnConnectedAsync()
    {
        var snapshot = _stressTest.GetSnapshot();
        await Clients.Caller.SendAsync("InitialState", snapshot);
        await base.OnConnectedAsync();
    }
}

/// <summary>
/// 前端写入变量的返回结果。
/// </summary>
public record WriteResult
{
    /// <summary>被写入的变量名。</summary>
    public required string Key { get; init; }

    /// <summary>写入的值。</summary>
    public double Value { get; init; }

    /// <summary>客户端发起写入时的时间戳（毫秒）。</summary>
    public long ClientTimestamp { get; init; }

    /// <summary>服务端处理时的时间戳（毫秒）。</summary>
    public long ServerTimestamp { get; init; }

    /// <summary>写入是否成功。</summary>
    public bool Success { get; init; }
}

/// <summary>
/// 方法调用的返回结果，包含往返延迟计算所需的时间戳。
/// </summary>
public record CallResult
{
    /// <summary>被调用的方法名称。</summary>
    public required string MethodName { get; init; }

    /// <summary>客户端发起调用时的时间戳（毫秒）。</summary>
    public long ClientTimestamp { get; init; }

    /// <summary>服务端处理时的时间戳（毫秒）。</summary>
    public long ServerTimestamp { get; init; }

    /// <summary>调用是否成功。</summary>
    public bool Success { get; init; }
}
