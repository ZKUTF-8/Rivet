using System.Globalization;

namespace Rivet.Core;

/// <summary>
/// Rivet 前后端命名转换工具。
/// </summary>
internal static class RivetNaming
{
    /// <summary>
    /// 把服务 CLR 类型名转换成前端服务名。
    /// </summary>
    internal static string ToServiceName(Type serviceType)
    {
        var name = serviceType.Name.EndsWith("Service", StringComparison.Ordinal)
            ? serviceType.Name[..^"Service".Length]
            : serviceType.Name;

        return ToCamelCase(name);
    }

    /// <summary>
    /// 把成员名转换成前端成员名。
    /// </summary>
    internal static string ToMemberName(string name)
    {
        return ToCamelCase(name);
    }

    /// <summary>
    /// 保持 C# 命名主体不变，只把首字母转为前端对象使用的 camelCase。
    /// </summary>
    private static string ToCamelCase(string value)
    {
        if (string.IsNullOrEmpty(value) || char.IsLower(value[0]))
        {
            return value;
        }

        return string.Create(value.Length, value, static (span, source) =>
        {
            source.AsSpan().CopyTo(span);
            span[0] = char.ToLower(span[0], CultureInfo.InvariantCulture);
        });
    }
}
