using Microsoft.AspNetCore.Builder;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;

namespace Rivet.Core;

/// <summary>
/// Rivet 对 ASP.NET Core 原生宿主的扩展入口。
/// </summary>
public static class RivetHostingExtensions
{
    /// <summary>
    /// 向现有 WebApplicationBuilder 注入 Rivet 服务。
    /// </summary>
    public static WebApplicationBuilder AddRivet(this WebApplicationBuilder builder, Action<RivetOptions>? configure = null)
    {
        var options = new RivetOptions();
        configure?.Invoke(options);

        builder.Services.TryAddSingleton<RivetRuntime>();
        builder.Services.TryAddSingleton<IRivetVariablePublisher, RivetSignalRVariablePublisher>();
        builder.Services.AddSingleton(new RivetRegistration(options, builder.Services));
        builder.Services.AddSignalR()
            .AddJsonProtocol(protocolOptions =>
            {
                protocolOptions.PayloadSerializerOptions = RivetJson.Options;
            });

        return builder;
    }

    /// <summary>
    /// 在 WebApplication 上挂载 Rivet 传输端点和默认健康检查端点。
    /// </summary>
    public static WebApplication MapRivet(this WebApplication app)
    {
        var registration = app.Services.GetRequiredService<RivetRegistration>();
        var runtime = app.Services.GetRequiredService<RivetRuntime>();
        var services = CaptureServiceRegistrations(registration.Services);
        ValidateRivetServices(services);
        runtime.Initialize(services, registration.Options);

        var bridgePath = registration.Options.BridgePath.StartsWith('/')
            ? registration.Options.BridgePath
            : $"/{registration.Options.BridgePath}";

        app.MapHub<RivetSignalRHub>(bridgePath);
        app.MapGet("/", () => $"{registration.Options.ApplicationName} is running.");

        return app;
    }

    /// <summary>
    /// 捕获当前容器中可能包含 Rivet 特性的服务注册，供启动校验和运行时绑定使用。
    /// </summary>
    private static IReadOnlyList<RivetServiceRegistration> CaptureServiceRegistrations(IServiceCollection services)
    {
        return services
            .Select(CreateRegistration)
            .Where(registration => registration is not null)
            .Cast<RivetServiceRegistration>()
            .ToArray();
    }

    /// <summary>
    /// 从 DI 注册描述中解析真实实现类型，只保留包含 Rivet 特性的候选服务。
    /// </summary>
    private static RivetServiceRegistration? CreateRegistration(ServiceDescriptor descriptor)
    {
        var implementationType = descriptor.ImplementationType
            ?? descriptor.ImplementationInstance?.GetType()
            ?? (RivetTypeInspector.HasRivetMembers(descriptor.ServiceType) ? descriptor.ServiceType : null);

        if (implementationType is null || !RivetTypeInspector.HasRivetMembers(implementationType))
        {
            return null;
        }

        return new RivetServiceRegistration(descriptor.ServiceType, implementationType, descriptor.Lifetime);
    }

    /// <summary>
    /// 校验所有带 Rivet 特性的类型都已经以 singleton 生命周期注册到 DI。
    /// </summary>
    private static void ValidateRivetServices(IReadOnlyList<RivetServiceRegistration> registrations)
    {
        foreach (var candidate in RivetTypeInspector.FindCandidateTypes())
        {
            var registration = registrations.FirstOrDefault(item => item.ImplementationType == candidate);

            if (registration is null)
            {
                throw new InvalidOperationException(
                    $"Rivet service '{candidate.FullName}' contains Rivet attributes but is not registered as Singleton.");
            }

            if (registration.Lifetime != ServiceLifetime.Singleton)
            {
                throw new InvalidOperationException(
                    $"Rivet service '{candidate.FullName}' must be registered as Singleton.");
            }
        }
    }
}
