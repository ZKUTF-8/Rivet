using Microsoft.Extensions.DependencyInjection;

namespace Rivet.Core;

/// <summary>
/// Rivet 宿主注册信息。
/// </summary>
internal sealed class RivetRegistration
{
    /// <summary>
    /// 创建启动阶段保存到 DI 的 Rivet 注册上下文。
    /// </summary>
    public RivetRegistration(RivetOptions options, IServiceCollection services)
    {
        Options = options;
        Services = services;
    }

    /// <summary>
    /// Rivet 运行配置。
    /// </summary>
    public RivetOptions Options { get; }

    /// <summary>
    /// ASP.NET Core 服务注册集合；MapRivet 时再读取，避免 AddRivet 后追加注册被遗漏。
    /// </summary>
    public IServiceCollection Services { get; }
}
