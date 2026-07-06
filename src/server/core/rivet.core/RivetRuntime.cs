using System.Collections.Concurrent;
using System.Globalization;
using System.Reflection;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Rivet.Core.Attributes;

namespace Rivet.Core;

/// <summary>
/// Rivet 运行时注册表，负责发现业务变量和方法，并在 Bridge Hub 调用时转发到业务对象。
/// </summary>
public sealed class RivetRuntime
{
    private readonly IServiceProvider _serviceProvider;
    private readonly ILogger<RivetRuntime> _logger;
    private readonly ConcurrentDictionary<string, VariableBinding> _variables = new(StringComparer.OrdinalIgnoreCase);
    private readonly ConcurrentDictionary<string, MethodBinding> _methods = new(StringComparer.OrdinalIgnoreCase);

    public RivetRuntime(IServiceProvider serviceProvider, ILogger<RivetRuntime> logger)
    {
        _serviceProvider = serviceProvider;
        _logger = logger;
    }

    /// <summary>
    /// 扫描并注册业务应用类型。
    /// </summary>
    public void Initialize(IEnumerable<Type> applicationTypes)
    {
        foreach (var applicationType in applicationTypes.Distinct())
        {
            var instance = _serviceProvider.GetRequiredService(applicationType);
            RegisterVariables(instance, applicationType);
            RegisterMethods(instance, applicationType);
        }

        _logger.LogInformation("Rivet runtime initialized with {VariableCount} variables and {MethodCount} callable methods.",
            _variables.Count,
            _methods.Count);
    }

    /// <summary>
    /// 获取当前所有可绑定变量快照。
    /// </summary>
    public IReadOnlyDictionary<string, RivetVariableState> GetSnapshot()
    {
        return _variables.ToDictionary(
            pair => pair.Key,
            pair => pair.Value.ToState());
    }

    /// <summary>
    /// 从前端写入一个变量。
    /// </summary>
    public RivetVariableState SetVariable(string name, string? value)
    {
        if (!_variables.TryGetValue(name, out var binding))
        {
            throw new InvalidOperationException($"Rivet variable '{name}' is not registered.");
        }

        binding.Set(value);
        return binding.ToState();
    }

    /// <summary>
    /// 从前端调用一个业务方法。
    /// </summary>
    public async Task<RivetMethodResult> InvokeAsync(string name, string? value)
    {
        if (!_methods.TryGetValue(name, out var binding))
        {
            return RivetMethodResult.Fail($"Rivet method '{name}' is not registered.");
        }

        try
        {
            var result = binding.Invoke(value);

            if (result is Task task)
            {
                await task.ConfigureAwait(false);
                result = ReadTaskResult(task);
            }

            return RivetMethodResult.Ok(result);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Rivet method {MethodName} failed.", name);
            return RivetMethodResult.Fail(ex.Message);
        }
    }

    private void RegisterVariables(object instance, Type applicationType)
    {
        const BindingFlags flags = BindingFlags.Instance | BindingFlags.Public | BindingFlags.NonPublic;

        foreach (var property in applicationType.GetProperties(flags))
        {
            var attribute = property.GetCustomAttribute<JsBindableAttribute>();
            if (attribute is null) continue;

            if (!property.CanRead || !property.CanWrite)
            {
                throw new InvalidOperationException($"Rivet property '{applicationType.Name}.{property.Name}' must be readable and writable.");
            }

            var name = ResolveName(attribute.Name, property.Name);
            _variables[name] = VariableBinding.FromProperty(name, instance, property);
        }

        foreach (var field in applicationType.GetFields(flags))
        {
            var attribute = field.GetCustomAttribute<JsBindableAttribute>();
            if (attribute is null) continue;

            var name = ResolveName(attribute.Name, field.Name);
            _variables[name] = VariableBinding.FromField(name, instance, field);
        }
    }

    private void RegisterMethods(object instance, Type applicationType)
    {
        const BindingFlags flags = BindingFlags.Instance | BindingFlags.Public | BindingFlags.NonPublic;

        foreach (var method in applicationType.GetMethods(flags))
        {
            var attribute = method.GetCustomAttribute<JsCallableAttribute>();
            if (attribute is null) continue;

            var name = ResolveName(attribute.Name, method.Name);
            _methods[name] = new MethodBinding(name, instance, method);
        }
    }

    private static string ResolveName(string? configuredName, string memberName)
    {
        return string.IsNullOrWhiteSpace(configuredName) ? memberName : configuredName;
    }

    private static object? ReadTaskResult(Task task)
    {
        var type = task.GetType();
        if (!type.IsGenericType) return null;
        return type.GetProperty("Result")?.GetValue(task);
    }

    private sealed class VariableBinding
    {
        private readonly Func<object?> _getValue;
        private readonly Action<string?> _setValue;

        private VariableBinding(string name, Type valueType, Func<object?> getValue, Action<string?> setValue)
        {
            Name = name;
            ValueType = valueType;
            _getValue = getValue;
            _setValue = setValue;
        }

        public string Name { get; }

        public Type ValueType { get; }

        public static VariableBinding FromProperty(string name, object instance, PropertyInfo property)
        {
            return new VariableBinding(
                name,
                property.PropertyType,
                () => property.GetValue(instance),
                value => property.SetValue(instance, ConvertText(value, property.PropertyType)));
        }

        public static VariableBinding FromField(string name, object instance, FieldInfo field)
        {
            return new VariableBinding(
                name,
                field.FieldType,
                () => field.GetValue(instance),
                value => field.SetValue(instance, ConvertText(value, field.FieldType)));
        }

        public void Set(string? value)
        {
            _setValue(value);
        }

        public RivetVariableState ToState()
        {
            return new RivetVariableState
            {
                Name = Name,
                Value = _getValue(),
                Type = ValueType.Name,
                UpdatedAt = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()
            };
        }
    }

    private sealed class MethodBinding
    {
        private readonly object _instance;
        private readonly MethodInfo _method;

        public MethodBinding(string name, object instance, MethodInfo method)
        {
            Name = name;
            _instance = instance;
            _method = method;
        }

        public string Name { get; }

        public object? Invoke(string? value)
        {
            var parameters = _method.GetParameters();
            object?[] args = parameters.Length switch
            {
                0 => [],
                1 => [ConvertText(value, parameters[0].ParameterType)],
                _ => throw new NotSupportedException($"Rivet method '{Name}' currently supports at most one argument.")
            };

            return _method.Invoke(_instance, args);
        }
    }

    private static object? ConvertText(string? value, Type targetType)
    {
        var nullableType = Nullable.GetUnderlyingType(targetType);
        var actualType = nullableType ?? targetType;

        if (value is null)
        {
            return nullableType is not null || !actualType.IsValueType
                ? null
                : Activator.CreateInstance(actualType);
        }

        if (actualType == typeof(string)) return value;
        if (actualType.IsEnum) return Enum.Parse(actualType, value);

        return Convert.ChangeType(value, actualType, CultureInfo.InvariantCulture);
    }
}
