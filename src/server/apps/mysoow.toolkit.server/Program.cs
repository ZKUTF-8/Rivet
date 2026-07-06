using Microsoft.AspNetCore.Builder;
using Mysoow.Toolkit.Server.Services;
using Rivet.Core;

var builder = WebApplication.CreateBuilder(args);

builder.AddRivet(rivet =>
{
    rivet.Configure(options =>
    {
        options.ApplicationName = "Mysoow.Toolkit Server";
        options.Port = 9735;
        options.BridgePath = "/bridge";
    })
    .UseApplication<ToolkitService>();
});

var app = builder.Build();

app.MapRivet();

await app.RunAsync();
