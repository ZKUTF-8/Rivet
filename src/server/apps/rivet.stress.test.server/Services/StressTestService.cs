using Microsoft.AspNetCore.SignalR;
using Rivet.StressTest.Server.Hubs;

namespace Rivet.StressTest.Server.Services;

/// <summary>
/// 压力测试服务，模拟真实上位机系统中 N 个可绑定变量按可配置频率更新的场景。
/// 变量包含 7 种数据类型：double、string、double[]、嵌套对象等，贴近真实序列化负载。
/// </summary>
public class StressTestService : BackgroundService
{
    private readonly IHubContext<BridgeHub> _hubContext;
    private readonly ILogger<StressTestService> _logger;
    private readonly Lock _configLock = new();

    private int _variableCount = 100;
    private int _updateIntervalMs = 100;
    private bool _useBatchMode = true;
    private volatile bool _running;

    private Dictionary<string, VariableState> _variables = new();
    private readonly Random _random = new();

    private static readonly string[] StatusMessages = ["运行中", "待机", "维护中", "预热中", "冷却中", "紧急停机", "自检中"];
    private static readonly string[] AlarmMessages = ["温度过高", "压力异常", "通信中断", "传感器故障", "液位低", "电流过载"];
    private static readonly string[] Locations = ["A区-1号", "A区-2号", "B区-1号", "B区-3号", "C区-1号", "主控室"];

    public StressTestService(IHubContext<BridgeHub> hubContext, ILogger<StressTestService> logger)
    {
        _hubContext = hubContext;
        _logger = logger;
        // 不在构造函数中创建变量，等用户点击"开始压测"后才创建
        _variables = [];
    }

    /// <summary>
    /// 重新配置压测参数。变量数量、更新间隔、批量模式均可在运行中动态调整。
    /// </summary>
    public void Configure(int variableCount, int updateIntervalMs, bool useBatchMode)
    {
        lock (_configLock)
        {
            _variableCount = Math.Clamp(variableCount, 1, 10000);
            _updateIntervalMs = Math.Clamp(updateIntervalMs, 5, 5000);
            _useBatchMode = useBatchMode;
            RebuildVariables();
        }
        _logger.LogInformation(
            "压测参数已更新: {Count} 个变量, {Interval}ms 间隔, 批量模式={Batch}",
            _variableCount, _updateIntervalMs, _useBatchMode);
    }

    public void StartRunning()
    {
        _running = true;
        _logger.LogInformation("压测已开始运行");
    }

    public void StopRunning()
    {
        _running = false;
        lock (_configLock)
        {
            _variables.Clear();
        }
        _logger.LogInformation("压测已停止，变量已清除");
    }

    public Dictionary<string, VariableState> GetSnapshot()
    {
        lock (_configLock)
        {
            return new Dictionary<string, VariableState>(_variables);
        }
    }

    /// <summary>
    /// 根据当前配置的变量数量重建变量字典，保留已存在的变量状态。
    /// 变量类型按 i % 7 均匀分配，确保每种类型都有足够的样本量。
    /// </summary>
    private void RebuildVariables()
    {
        var newVars = new Dictionary<string, VariableState>(_variableCount);
        for (int i = 0; i < _variableCount; i++)
        {
            string key = $"var_{i:D5}";
            if (_variables.TryGetValue(key, out var existing))
            {
                newVars[key] = existing;
            }
            else
            {
                var type = (VariableType)(i % 7);
                newVars[key] = new VariableState
                {
                    Name = key,
                    Type = type,
                    Value = InitializeValue(type, key),
                    UpdateCount = 0,
                    LastUpdated = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()
                };
            }
        }
        _variables = newVars;
    }

    /// <summary>
    /// 根据变量类型生成初始值。不同类型有不同的数据结构和大小。
    /// </summary>
    private object InitializeValue(VariableType type, string name)
    {
        return type switch
        {
            VariableType.Temperature => _random.NextDouble() * 30 + 10,
            VariableType.Pressure => _random.NextDouble() * 60 + 70,
            VariableType.Position => _random.NextDouble() * 1000,
            VariableType.Counter => 0.0,
            VariableType.Text => $"[{name}] 初始化完成",
            VariableType.DataArray => Enumerable.Range(0, 10).Select(_ => Math.Round(_random.NextDouble() * 100, 2)).ToArray(),
            VariableType.DeviceInfo => new DeviceInfo
            {
                DeviceName = $"设备-{name}",
                Status = "正常",
                Temperature = 25 + _random.NextDouble() * 5,
                Pressure = 100 + _random.NextDouble() * 10,
                Location = Locations[_random.Next(Locations.Length)],
                UptimeSeconds = 0,
                Alarms = []
            },
            _ => _random.NextDouble() * 100
        };
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        _logger.LogInformation("压测服务已启动，等待测试指令...");

        while (!stoppingToken.IsCancellationRequested)
        {
            if (!_running)
            {
                await Task.Delay(100, stoppingToken);
                continue;
            }

            int interval;
            bool batch;
            lock (_configLock)
            {
                interval = _updateIntervalMs;
                batch = _useBatchMode;
            }

            UpdateVariables();

            if (batch)
                await PushBatch();
            else
                await PushIndividual();

            await Task.Delay(interval, stoppingToken);
        }
    }

    /// <summary>
    /// 根据变量类型使用不同的模拟算法更新所有变量的值。
    /// 字符串、数组、嵌套对象每次更新都会产生新的序列化负载。
    /// </summary>
    private void UpdateVariables()
    {
        long now = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        lock (_configLock)
        {
            foreach (var kvp in _variables)
            {
                var v = kvp.Value;
                int hash = v.Name.GetHashCode();

                switch (v.Type)
                {
                    case VariableType.Temperature:
                        v.Value = 20 + Math.Sin(now * 0.001 + hash) * 15;
                        break;

                    case VariableType.Pressure:
                        v.Value = 100 + Math.Cos(now * 0.002 + hash) * 30;
                        break;

                    case VariableType.Position:
                        v.Value = (now * 0.01 + hash) % 1000;
                        break;

                    case VariableType.Counter:
                        v.Value = (double)v.Value! + 1;
                        break;

                    case VariableType.Text:
                        var status = StatusMessages[v.UpdateCount % StatusMessages.Length];
                        v.Value = $"[{v.Name}] {status} | 更新#{v.UpdateCount} | {DateTime.Now:HH:mm:ss.fff}";
                        break;

                    case VariableType.DataArray:
                        var arr = (double[])v.Value!;
                        Array.Copy(arr, 1, arr, 0, arr.Length - 1);
                        arr[^1] = Math.Round(_random.NextDouble() * 100, 2);
                        v.Value = arr;
                        break;

                    case VariableType.DeviceInfo:
                        var info = (DeviceInfo)v.Value!;
                        info.Temperature = Math.Round(20 + Math.Sin(now * 0.001 + hash) * 15, 2);
                        info.Pressure = Math.Round(100 + Math.Cos(now * 0.002 + hash) * 30, 2);
                        info.Status = StatusMessages[v.UpdateCount % StatusMessages.Length];
                        info.UptimeSeconds = (now - v.LastUpdated) / 1000;
                        if (v.UpdateCount % 10 == 0)
                        {
                            info.Alarms = _random.Next(3) == 0
                                ? [AlarmMessages[_random.Next(AlarmMessages.Length)]]
                                : [];
                        }
                        v.Value = info;
                        break;
                }

                v.UpdateCount++;
                v.LastUpdated = now;
            }
        }
    }

    private async Task PushBatch()
    {
        Dictionary<string, VariableState> snapshot;
        lock (_configLock)
        {
            snapshot = new Dictionary<string, VariableState>(_variables);
        }

        await _hubContext.Clients.All.SendAsync("VariableBatchUpdate", new BatchUpdate
        {
            Timestamp = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
            Variables = snapshot
        });
    }

    private async Task PushIndividual()
    {
        List<KeyValuePair<string, VariableState>> snapshot;
        lock (_configLock)
        {
            snapshot = _variables.ToList();
        }

        foreach (var kvp in snapshot)
        {
            await _hubContext.Clients.All.SendAsync("VariableUpdate", kvp.Key, kvp.Value);
        }
    }
}

/// <summary>
/// 单个变量的状态。Value 为 object 类型，支持 double、string、double[]、DeviceInfo 等多种数据结构。
/// </summary>
public class VariableState
{
    /// <summary>变量名称。</summary>
    public required string Name { get; set; }

    /// <summary>当前值（double / string / double[] / DeviceInfo）。</summary>
    public object? Value { get; set; }

    /// <summary>变量类型。</summary>
    public VariableType Type { get; set; }

    /// <summary>累计更新次数。</summary>
    public long UpdateCount { get; set; }

    /// <summary>最后更新的时间戳（毫秒）。</summary>
    public long LastUpdated { get; set; }
}

/// <summary>
/// 模拟真实设备信息的嵌套对象，包含多种属性类型（string、double、string[]）。
/// </summary>
public class DeviceInfo
{
    /// <summary>设备名称。</summary>
    public required string DeviceName { get; set; }

    /// <summary>运行状态。</summary>
    public string Status { get; set; } = "正常";

    /// <summary>当前温度。</summary>
    public double Temperature { get; set; }

    /// <summary>当前压力。</summary>
    public double Pressure { get; set; }

    /// <summary>安装位置。</summary>
    public string Location { get; set; } = "";

    /// <summary>运行时长（秒）。</summary>
    public long UptimeSeconds { get; set; }

    /// <summary>当前活跃的报警列表。</summary>
    public string[] Alarms { get; set; } = [];
}

/// <summary>
/// 批量更新的数据包。
/// </summary>
public class BatchUpdate
{
    /// <summary>服务端发送时的时间戳（毫秒）。</summary>
    public long Timestamp { get; set; }

    /// <summary>所有变量的当前状态。</summary>
    public required Dictionary<string, VariableState> Variables { get; set; }
}

/// <summary>
/// 变量类型枚举。7 种类型按 i%7 均匀分配，覆盖真实系统中常见的数据结构。
/// </summary>
public enum VariableType
{
    /// <summary>温度 — double，正弦波模拟。</summary>
    Temperature = 0,

    /// <summary>压力 — double，余弦波模拟。</summary>
    Pressure = 1,

    /// <summary>位置 — double，线性递增。</summary>
    Position = 2,

    /// <summary>计数器 — double，每次递增。</summary>
    Counter = 3,

    /// <summary>文本 — string，状态描述 + 时间戳，模拟日志/报警消息。</summary>
    Text = 4,

    /// <summary>数据数组 — double[10]，模拟历史趋势数据。</summary>
    DataArray = 5,

    /// <summary>设备信息 — 嵌套对象，包含 string/double/string[] 属性。</summary>
    DeviceInfo = 6
}
