using Microsoft.AspNetCore.SignalR;
using Rivet.StressTest.Server.Services;
using System.Diagnostics;

namespace Rivet.StressTest.Server.Hubs;

/// <summary>
/// 手写的 SignalR Hub，用于压测阶段。
/// 正式版中这些方法将由 Source Generator 自动生成。
/// </summary>
public class BridgeHub : Hub
{
    private const int MaxBandwidthTestSizeInMB = 100;
    private static readonly Stopwatch Stopwatch = Stopwatch.StartNew();
    private static readonly SemaphoreSlim BandwidthTestLock = new(1, 1);
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
    /// 获取服务端当前时间，用于验证前后端调用链路是否正常。
    /// </summary>
    public string GetCurrentTime()
    {
        var now = DateTime.Now;
        var microseconds = Stopwatch.Elapsed.TotalMilliseconds % 1 * 1000;
        return $"{now:yyyy-MM-dd HH:mm:ss.fff}.{microseconds:000}";
    }

    /// <summary>
    /// 轻量延迟测试方法，前端用本地高精度计时计算 RTT。
    /// </summary>
    public double PingTest(double clientTimestamp)
    {
        return Stopwatch.Elapsed.TotalMilliseconds;
    }

    /// <summary>
    /// 最小负载回显方法，用于串行和并发吞吐量测试。
    /// </summary>
    public bool ThroughputTest()
    {
        return true;
    }

    /// <summary>
    /// 返回指定大小的数据块，用于测试服务端到前端的传输带宽。
    /// </summary>
    public async Task<byte[]> BandwidthTest(int sizeInMB)
    {
        var safeSizeInMB = Math.Clamp(sizeInMB, 1, MaxBandwidthTestSizeInMB);

        await BandwidthTestLock.WaitAsync(Context.ConnectionAborted);
        try
        {
            var data = new byte[safeSizeInMB * 1024 * 1024];
            Random.Shared.NextBytes(data);
            return data;
        }
        finally
        {
            BandwidthTestLock.Release();
        }
    }

    /// <summary>
    /// 客户端连接时，如果压测已启动则推送当前所有变量的快照。
    /// </summary>
    public override async Task OnConnectedAsync()
    {
        var snapshot = _stressTest.GetSnapshot();
        if (snapshot.Count > 0)
        {
            await Clients.Caller.SendAsync("InitialState", snapshot);
        }
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
