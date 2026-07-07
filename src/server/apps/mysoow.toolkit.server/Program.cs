using Microsoft.AspNetCore.Builder;
using Microsoft.Extensions.DependencyInjection;
using Mysoow.Toolkit.Server.Services;
using Rivet.Core;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddSingleton<ToolkitService>();

builder.AddRivet(options =>
{
    options.ApplicationName = "Mysoow.Toolkit Server";
    options.BridgePath = "/bridge";
});

var app = builder.Build();

app.MapRivet();

await app.RunAsync("http://localhost:9735");
