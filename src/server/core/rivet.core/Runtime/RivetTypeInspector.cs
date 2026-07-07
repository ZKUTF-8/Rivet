using System.Reflection;
using Rivet.Core.Attributes;

namespace Rivet.Core;

/// <summary>
/// Rivet 类型扫描工具。
/// </summary>
internal static class RivetTypeInspector
{
    /// <summary>
    /// 扫描实例成员时需要同时看到公开和非公开成员，才能给非法标记返回明确错误。
    /// </summary>
    private const BindingFlags AnyInstance = BindingFlags.Instance | BindingFlags.Public | BindingFlags.NonPublic;

    /// <summary>
    /// 查找当前已加载程序集中的 Rivet 服务候选类型。
    /// </summary>
    internal static IReadOnlyList<Type> FindCandidateTypes()
    {
        return AppDomain.CurrentDomain
            .GetAssemblies()
            .Where(static assembly => !assembly.IsDynamic)
            .SelectMany(GetLoadableTypes)
            .Where(static type => type is { IsClass: true, IsAbstract: false })
            .Where(HasRivetMembers)
            .ToArray();
    }

    /// <summary>
    /// 判断类型是否包含任何 Rivet 特性成员或公开 Rv 状态属性。
    /// </summary>
    internal static bool HasRivetMembers(Type type)
    {
        return type.GetMethods(AnyInstance).Any(method => method.GetCustomAttribute<JsCallableAttribute>() is not null)
            || type.GetProperties(AnyInstance).Any(static property => property.GetCustomAttribute<JsBindableAttribute>() is not null || IsPublicRvProperty(property))
            || type.GetFields(AnyInstance).Any(field => field.GetCustomAttribute<JsBindableAttribute>() is not null)
            || type.GetEvents(AnyInstance).Any(evt => evt.GetCustomAttribute<JsEventAttribute>() is not null);
    }

    /// <summary>
    /// 判断属性是否是默认暴露给前端的公开 Rv 状态。
    /// </summary>
    private static bool IsPublicRvProperty(PropertyInfo property)
    {
        return property.GetMethod?.IsPublic == true
            && property.GetIndexParameters().Length == 0
            && property.PropertyType.IsGenericType
            && property.PropertyType.GetGenericTypeDefinition() == typeof(Rv<>);
    }

    /// <summary>
    /// 安全读取程序集类型，避免某些依赖缺失时整个候选类型扫描失败。
    /// </summary>
    private static IEnumerable<Type> GetLoadableTypes(Assembly assembly)
    {
        try
        {
            return assembly.GetTypes();
        }
        catch (ReflectionTypeLoadException ex)
        {
            return ex.Types.Where(static type => type is not null)!;
        }
    }
}
