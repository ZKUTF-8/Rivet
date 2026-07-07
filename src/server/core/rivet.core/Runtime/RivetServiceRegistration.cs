using Microsoft.Extensions.DependencyInjection;

namespace Rivet.Core;

/// <summary>
/// Rivet 识别到的 DI 服务注册。
/// </summary>
internal sealed class RivetServiceRegistration
{
    /// <summary>
    /// 创建一个 Rivet 候选服务注册描述。
    /// </summary>
    public RivetServiceRegistration(Type serviceType, Type implementationType, ServiceLifetime lifetime)
    {
        ServiceType = serviceType;
        ImplementationType = implementationType;
        Lifetime = lifetime;
    }

    /// <summary>
    /// DI 服务类型。
    /// </summary>
    public Type ServiceType { get; }

    /// <summary>
    /// 实际实现类型。
    /// </summary>
    public Type ImplementationType { get; }

    /// <summary>
    /// DI 生命周期。
    /// </summary>
    public ServiceLifetime Lifetime { get; }
}
