using Rivet.Core.Attributes;

namespace Mysoow.Toolkit.Server.Services;

/// <summary>
/// Mysoow.Toolkit 的业务服务示例。这里只写业务变量和业务方法，不直接处理 SignalR。
/// </summary>
public sealed class ToolkitService
{
    /// <summary>
    /// 页面输入框绑定的示例变量。
    /// </summary>
    [JsBindable(Name = "message")]
    public string Message { get; set; } = "后端初始值";

    /// <summary>
    /// 把前端输入交给后端处理后返回。
    /// </summary>
    [JsCallable(Name = "echo")]
    public string Echo(string value)
    {
        Message = $"后端收到：{value}";
        return Message;
    }

    /// <summary>
    /// 模拟后端主动更新业务变量。
    /// </summary>
    [JsCallable(Name = "updateMessage")]
    public string UpdateMessage()
    {
        Message = $"后端更新于 {DateTime.Now:HH:mm:ss.fff}";
        return Message;
    }
}
