namespace Rivet.Core;

/// <summary>
/// Rivet 服务端运行配置。业务项目通常只需要按需覆盖端口、地址和 Bridge 路径。
/// </summary>
public sealed class RivetOptions
{
    /// <summary>
    /// 服务监听主机名，开发阶段默认只监听本机。
    /// </summary>
    public string Host { get; set; } = "localhost";

    /// <summary>
    /// 服务监听端口。
    /// </summary>
    public int Port { get; set; } = 9710;

    /// <summary>
    /// 前后端通信 Hub 路径。
    /// </summary>
    public string BridgePath { get; set; } = "/bridge";

    /// <summary>
    /// 是否启用开发阶段跨域策略。
    /// </summary>
    public bool UseDevelopmentCors { get; set; } = true;

    /// <summary>
    /// 当前服务的展示名称，用于根路径健康检查。
    /// </summary>
    public string ApplicationName { get; set; } = "Rivet Server";

    internal string Url => $"http://{Host}:{Port}";
}
