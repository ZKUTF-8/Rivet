namespace Rivet.Core;

/// <summary>
/// Rivet Bridge Hub 推送到前端的事件名。
/// </summary>
internal static class RivetHubEvents
{
    /// <summary>
    /// 初始状态事件。
    /// </summary>
    public const string InitialState = "RivetInitialState";

    /// <summary>
    /// 变量变化事件。
    /// </summary>
    public const string VariableChanged = "RivetVariableChanged";
}
