using Rivet.Core.Attributes;
using Rivet.Core;

namespace Mysoow.Toolkit.Server.Services;

/// <summary>
/// Mysoow.Toolkit 的业务服务示例。这里只写业务变量和业务方法，不直接处理 SignalR。
/// </summary>
public sealed class ToolkitService
{
    /// <summary>
    /// 后台时间刷新任务，用于验证后端主动写入 Rv 状态后前端自动更新。
    /// </summary>
    private readonly Task _clockTask;

    /// <summary>
    /// 创建样板业务服务，并启动时间变量刷新任务。
    /// </summary>
    public ToolkitService()
    {
        _clockTask = Task.Run(async () =>
        {
            while (true)
            {
                ThisTime.Value = DateTime.Now;
                await Task.Delay(1000);
            }
        });
    }

    /// <summary>
    /// 页面输入框绑定的示例变量。
    /// </summary>
    public Rv<string> Message { get; } = new("后端初始值");

    /// <summary>
    /// 计数器示例变量，用于验证前端直接写变量和后端方法写变量的同步路径。
    /// </summary>
    public Rv<int> Counter { get; } = new(0);

    /// <summary>
    /// 当前后端时间，用于验证后端主动推送变量变更。
    /// </summary>
    public Rv<DateTime> ThisTime { get; set; } = new(DateTime.Now);

    /// <summary>
    /// 把前端输入交给后端处理后返回。
    /// </summary>
    /// <param name="value">前端传入的测试文本。</param>
    /// <returns>后端处理后的消息内容。</returns>
    [JsCallable]
    public string Echo(string value)
    {
        Message.Value = $"后端收到：{value}";
        return Message.Value;
    }

    /// <summary>
    /// 模拟后端主动更新业务变量。
    /// </summary>
    [JsCallable]
    public string UpdateMessage()
    {
        Message.Value = $"后端更新于 {DateTime.Now:HH:mm:ss.fff}";
        return Message.Value;
    }

    /// <summary>
    /// 在后端把计数器加一，并通过 Rv 状态同步给前端。
    /// </summary>
    [JsCallable]
    public int IncrementCounter()
    {
        Counter.Value++;
        return Counter.Value;
    }
}
