using System.Text.Json;

namespace Rivet.Core;

/// <summary>
/// Rivet 内部 JSON 选项。
/// </summary>
internal static class RivetJson
{
    /// <summary>
    /// 框架内部统一使用的序列化选项。
    /// </summary>
    internal static readonly JsonSerializerOptions Options = new(JsonSerializerDefaults.Web);
}
