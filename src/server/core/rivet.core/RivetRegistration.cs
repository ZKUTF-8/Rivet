namespace Rivet.Core;

/// <summary>
/// Rivet 启动阶段收集到的运行配置和业务类型。
/// </summary>
internal sealed class RivetRegistration
{
    public RivetRegistration(RivetOptions options, IReadOnlyList<Type> applicationTypes)
    {
        Options = options;
        ApplicationTypes = applicationTypes;
    }

    public RivetOptions Options { get; }

    public IReadOnlyList<Type> ApplicationTypes { get; }
}
