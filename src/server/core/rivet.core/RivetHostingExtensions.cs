using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;

namespace Rivet.Core;

/// <summary>
/// Rivet 对 ASP.NET Core 原生宿主的扩展入口。
/// </summary>
public static class RivetHostingExtensions
{
    private const string CorsPolicyName = "RivetDevelopmentCors";

    /// <summary>
    /// 向现有 WebApplicationBuilder 注入 Rivet 服务。适合业务项目已有自己的 ASP.NET Core 启动流程时使用。
    /// </summary>
    public static WebApplicationBuilder AddRivet(this WebApplicationBuilder builder, Action<RivetServerBuilder> configure)
    {
        var rivet = new RivetServerBuilder(builder.Services);
        configure(rivet);
        AddRivetCore(builder, rivet);
        return builder;
    }

    /// <summary>
    /// 使用默认配置向现有 WebApplicationBuilder 注入 Rivet 服务。
    /// </summary>
    public static WebApplicationBuilder AddRivet(this WebApplicationBuilder builder)
    {
        AddRivetCore(builder, new RivetServerBuilder(builder.Services));
        return builder;
    }

    /// <summary>
    /// 在 WebApplication 上挂载 Rivet Bridge Hub 和默认健康检查端点。
    /// </summary>
    public static WebApplication MapRivet(this WebApplication app)
    {
        var registration = app.Services.GetRequiredService<RivetRegistration>();
        var runtime = app.Services.GetRequiredService<RivetRuntime>();
        runtime.Initialize(registration.ApplicationTypes);

        if (registration.Options.UseDevelopmentCors)
        {
            app.UseCors(CorsPolicyName);
        }

        app.MapHub<RivetBridgeHub>(NormalizePath(registration.Options.BridgePath));
        app.MapGet("/", () => $"{registration.Options.ApplicationName} is running.");

        return app;
    }

    internal static void AddRivetCore(WebApplicationBuilder builder, RivetServerBuilder rivet)
    {
        builder.WebHost.UseUrls(rivet.Options.Url);

        builder.Services.TryAddSingleton<RivetRuntime>();
        builder.Services.AddSingleton(new RivetRegistration(rivet.Options, rivet.ApplicationTypes));
        builder.Services.AddSignalR()
            .AddMessagePackProtocol();

        if (rivet.Options.UseDevelopmentCors)
        {
            builder.Services.AddCors(cors =>
            {
                cors.AddPolicy(CorsPolicyName, policy =>
                {
                    policy.SetIsOriginAllowed(_ => true)
                        .AllowAnyHeader()
                        .AllowAnyMethod()
                        .AllowCredentials();
                });
            });
        }
    }

    private static string NormalizePath(string path)
    {
        return path.StartsWith('/') ? path : $"/{path}";
    }
}
