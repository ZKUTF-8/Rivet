namespace Rivet.Core;

/// <summary>
/// Rivet 协议推送到前端的事件名，不绑定具体传输实现。
/// </summary>
internal static class RivetProtocolEvents
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
