using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;

namespace Rivet.Core;

/// <summary>
/// Rivet 服务端配置器，负责收集业务应用类型和运行配置。
/// </summary>
public sealed class RivetServerBuilder
{
    private readonly IServiceCollection _services;
    private readonly List<Type> _applicationTypes = [];

    internal RivetServerBuilder(IServiceCollection services)
    {
        _services = services;
    }

    /// <summary>
    /// 当前 Rivet 服务配置。
    /// </summary>
    public RivetOptions Options { get; } = new();

    internal IReadOnlyList<Type> ApplicationTypes => _applicationTypes;

    /// <summary>
    /// 配置 Rivet 服务端运行参数。
    /// </summary>
    public RivetServerBuilder Configure(Action<RivetOptions> configure)
    {
        configure(Options);
        return this;
    }

    /// <summary>
    /// 注册一个业务服务类型，让 Rivet 扫描其中的变量和可调用方法。
    /// </summary>
    public RivetServerBuilder UseApplication<TApplication>()
        where TApplication : class
    {
        _services.TryAddSingleton<TApplication>();
        _applicationTypes.Add(typeof(TApplication));
        return this;
    }
}
