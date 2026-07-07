namespace Rivet.Core;

/// <summary>
/// Rivet 服务端运行配置。端口和监听地址由 ASP.NET Core 宿主负责。
/// </summary>
public sealed class RivetOptions
{
    /// <summary>
    /// 前后端通信 Hub 路径。
    /// </summary>
    public string BridgePath { get; set; } = "/bridge";

    /// <summary>
    /// 当前服务的展示名称，用于根路径健康检查。
    /// </summary>
    public string ApplicationName { get; set; } = "Rivet Server";

    /// <summary>
    /// DateTime 和 DateTimeOffset 状态推送到前端时使用的格式。
    /// </summary>
    public string DateTimeFormat { get; set; } = "yyyy-MM-dd HH:mm:ss";
}
