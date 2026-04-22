using Rivet.DevApp.Hubs;
using Rivet.DevApp.Services;

var builder = WebApplication.CreateBuilder(args);

builder.WebHost.UseUrls("http://localhost:9710");

builder.Services.AddSignalR()
    .AddMessagePackProtocol();

builder.Services.AddSingleton<StressTestService>();
builder.Services.AddHostedService(sp => sp.GetRequiredService<StressTestService>());

builder.Services.AddCors(options =>
{
    options.AddDefaultPolicy(policy =>
    {
        policy.SetIsOriginAllowed(_ => true)
              .AllowAnyHeader()
              .AllowAnyMethod()
              .AllowCredentials();
    });
});

var app = builder.Build();

app.UseCors();
app.MapHub<BridgeHub>("/bridge");

app.MapGet("/", () => "Rivet DevApp is running.");

app.Run();
