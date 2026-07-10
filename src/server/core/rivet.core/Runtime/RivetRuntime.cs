using System.Collections.Concurrent;
using System.Globalization;
using System.Reflection;
using System.Text.Json;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Rivet.Core.Attributes;

namespace Rivet.Core;

/// <summary>
/// Rivet 运行时注册表，负责绑定 singleton 服务、变量和方法。
/// </summary>
internal sealed class RivetRuntime
{
    /// <summary>
    /// 运行时需要扫描公开和非公开实例成员，以便对错误标记给出明确启动异常。
    /// </summary>
    private const BindingFlags AnyInstance = BindingFlags.Instance | BindingFlags.Public | BindingFlags.NonPublic;

    /// <summary>
    /// 用于通过当前传输实现发布后端变量变化。
    /// </summary>
    private readonly IRivetVariablePublisher _variablePublisher;

    /// <summary>
    /// 应用宿主的 DI 容器，用于取得已注册的 singleton 服务实例。
    /// </summary>
    private readonly IServiceProvider _serviceProvider;

    /// <summary>
    /// 运行时日志，用于记录方法调用失败和广播失败等诊断信息。
    /// </summary>
    private readonly ILogger<RivetRuntime> _logger;

    /// <summary>
    /// 已绑定的变量表，键为前后端统一名称，例如 toolkit.message。
    /// </summary>
    private readonly ConcurrentDictionary<string, VariableBinding> _variables = new(StringComparer.OrdinalIgnoreCase);

    /// <summary>
    /// 已绑定的方法表，键为前后端统一名称，例如 toolkit.echo。
    /// </summary>
    private readonly ConcurrentDictionary<string, MethodBinding> _methods = new(StringComparer.OrdinalIgnoreCase);

    /// <summary>
    /// 创建 Rivet 运行时注册表。
    /// </summary>
    public RivetRuntime(
        IServiceProvider serviceProvider,
        IRivetVariablePublisher variablePublisher,
        ILogger<RivetRuntime> logger)
    {
        _serviceProvider = serviceProvider;
        _variablePublisher = variablePublisher;
        _logger = logger;
    }

    /// <summary>
    /// 初始化运行时绑定。
    /// </summary>
    internal void Initialize(IEnumerable<RivetServiceRegistration> registrations, RivetOptions options)
    {
        foreach (var registration in registrations)
        {
            if (!RivetTypeInspector.HasRivetMembers(registration.ImplementationType))
            {
                continue;
            }

            if (registration.Lifetime != ServiceLifetime.Singleton)
            {
                throw new InvalidOperationException(
                    $"Rivet service '{registration.ImplementationType.FullName}' must be registered as Singleton.");
            }

            var instance = _serviceProvider.GetRequiredService(registration.ServiceType);
            RegisterVariables(instance, registration.ImplementationType, options);
            RegisterMethods(instance, registration.ImplementationType);
        }

        _logger.LogInformation(
            "Rivet runtime initialized with {VariableCount} variables and {MethodCount} callable methods.",
            _variables.Count,
            _methods.Count);
    }

    /// <summary>
    /// 获取当前所有可绑定变量快照。
    /// </summary>
    internal IReadOnlyDictionary<string, RivetVariableState> GetSnapshot()
    {
        return _variables.ToDictionary(pair => pair.Key, pair => pair.Value.ToState());
    }

    /// <summary>
    /// 从前端写入一个变量。
    /// </summary>
    internal RivetVariableState SetVariable(string name, string? valueJson, string? excludedConnectionId)
    {
        if (!_variables.TryGetValue(name, out var binding))
        {
            throw new InvalidOperationException($"Rivet variable '{name}' is not registered.");
        }

        binding.SetJson(valueJson, excludedConnectionId);
        return binding.ToState();
    }

    /// <summary>
    /// 从前端调用一个业务方法。
    /// </summary>
    internal async Task<object?> InvokeAsync(string name, string? argsJson)
    {
        if (!_methods.TryGetValue(name, out var binding))
        {
            throw new InvalidOperationException($"Rivet method '{name}' is not registered.");
        }

        try
        {
            var result = binding.Invoke(argsJson);

            if (result is Task task)
            {
                await task.ConfigureAwait(false);
                result = ReadTaskResult(task);
            }

            return result;
        }
        catch (TargetInvocationException ex) when (ex.InnerException is not null)
        {
            _logger.LogError(ex.InnerException, "Rivet method {MethodName} failed.", name);
            throw new InvalidOperationException(ex.InnerException.Message, ex.InnerException);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Rivet method {MethodName} failed.", name);
            throw;
        }
    }

    /// <summary>
    /// 扫描服务公开属性并绑定所有合法的 Rv<T> 状态。
    /// </summary>
    private void RegisterVariables(object instance, Type implementationType, RivetOptions options)
    {
        var serviceName = RivetNaming.ToServiceName(implementationType);

        foreach (var field in implementationType.GetFields(AnyInstance))
        {
            if (field.GetCustomAttribute<JsBindableAttribute>() is not null)
            {
                throw new InvalidOperationException(
                    $"Rivet bindable member '{implementationType.Name}.{field.Name}' must be a public Rv<T> property, fields are not supported.");
            }
        }

        foreach (var property in implementationType.GetProperties(AnyInstance))
        {
            var attribute = property.GetCustomAttribute<JsBindableAttribute>();
            if (attribute is null && !IsRvStateProperty(property))
            {
                continue;
            }

            if (!property.CanRead || property.GetMethod is null || !property.GetMethod.IsPublic || property.GetIndexParameters().Length > 0)
            {
                throw new InvalidOperationException(
                    $"Rivet bindable property '{implementationType.Name}.{property.Name}' must be a readable public instance property.");
            }

            if (!IsRvStateProperty(property))
            {
                throw new InvalidOperationException(
                    $"Rivet bindable property '{implementationType.Name}.{property.Name}' must be Rv<T>.");
            }

            var state = (IRvState?)property.GetValue(instance)
                ?? throw new InvalidOperationException($"Rivet bindable property '{implementationType.Name}.{property.Name}' returned null.");

            var memberName = RivetNaming.ToMemberName(attribute?.Name ?? property.Name);
            var key = $"{serviceName}.{memberName}";
            state.Attach(key, PublishVariableChanged);
            _variables[key] = new VariableBinding(key, state, options);
        }
    }

    /// <summary>
    /// 判断属性是否是 Rivet 状态容器。
    /// </summary>
    private static bool IsRvStateProperty(PropertyInfo property)
    {
        return property.PropertyType.IsGenericType
            && property.PropertyType.GetGenericTypeDefinition() == typeof(Rv<>);
    }

    /// <summary>
    /// 扫描服务公开方法并绑定所有可由前端调用的入口。
    /// </summary>
    private void RegisterMethods(object instance, Type implementationType)
    {
        var serviceName = RivetNaming.ToServiceName(implementationType);

        foreach (var method in implementationType.GetMethods(AnyInstance))
        {
            var attribute = method.GetCustomAttribute<JsCallableAttribute>();
            if (attribute is null)
            {
                continue;
            }

            if (!method.IsPublic)
            {
                throw new InvalidOperationException(
                    $"Rivet callable method '{implementationType.Name}.{method.Name}' must be public.");
            }

            if (method.ContainsGenericParameters)
            {
                throw new InvalidOperationException(
                    $"Rivet method '{implementationType.Name}.{method.Name}' must not be generic.");
            }

            var memberName = RivetNaming.ToMemberName(attribute.Name ?? method.Name);
            var key = $"{serviceName}.{memberName}";
            _methods[key] = new MethodBinding(key, instance, method);
        }
    }

    /// <summary>
    /// 接收 Rv<T> 的本地变更通知，并转换成前端协议状态。
    /// </summary>
    private void PublishVariableChanged(RvStateChange change)
    {
        if (!_variables.TryGetValue(change.Key, out var binding))
        {
            return;
        }

        var state = binding.ToState();
        _ = _variablePublisher.PublishVariableChangedAsync(state, change.ExcludedConnectionId);
    }

    /// <summary>
    /// 从已完成的 Task 中读取泛型返回值；非泛型 Task 视为无返回值。
    /// </summary>
    private static object? ReadTaskResult(Task task)
    {
        var type = task.GetType();
        if (!type.IsGenericType)
        {
            return null;
        }

        return type.GetProperty("Result")?.GetValue(task);
    }

    /// <summary>
    /// 运行时变量绑定，隔离协议键和真实后端状态对象。
    /// </summary>
    private sealed class VariableBinding
    {
        /// <summary>
        /// 变量协议输出使用的服务端格式配置。
        /// </summary>
        private readonly RivetOptions _options;

        /// <summary>
        /// 绑定的后端状态对象。
        /// </summary>
        private readonly IRvState _state;

        /// <summary>
        /// 创建变量绑定。
        /// </summary>
        public VariableBinding(string name, IRvState state, RivetOptions options)
        {
            Name = name;
            _state = state;
            _options = options;
        }

        /// <summary>
        /// 变量在前后端协议中的完整键。
        /// </summary>
        public string Name { get; }

        /// <summary>
        /// 从前端 JSON 写入后端状态。
        /// </summary>
        public void SetJson(string? valueJson, string? excludedConnectionId)
        {
            _state.SetJson(valueJson, excludedConnectionId);
        }

        /// <summary>
        /// 生成可发送给前端的变量状态快照。
        /// </summary>
        public RivetVariableState ToState()
        {
            return new RivetVariableState
            {
                Name = Name,
                Value = ToProtocolValue(_state.UntypedValue, _options)
            };
        }

        /// <summary>
        /// 把后端 CLR 值转换成前端协议中稳定可显示的值。
        /// </summary>
        private static object? ToProtocolValue(object? value, RivetOptions options)
        {
            return value switch
            {
                DateTime dateTime => dateTime.ToString(options.DateTimeFormat, CultureInfo.InvariantCulture),
                DateTimeOffset dateTimeOffset => dateTimeOffset.ToString(options.DateTimeFormat, CultureInfo.InvariantCulture),
                _ => value,
            };
        }
    }

    /// <summary>
    /// 运行时方法绑定，负责把 JSON 参数映射到真实 C# 方法调用。
    /// </summary>
    private sealed class MethodBinding
    {
        /// <summary>
        /// 承载可调用方法的 singleton 服务实例。
        /// </summary>
        private readonly object _instance;

        /// <summary>
        /// 被 [JsCallable] 标记的公开实例方法。
        /// </summary>
        private readonly MethodInfo _method;

        /// <summary>
        /// 创建方法绑定。
        /// </summary>
        public MethodBinding(string name, object instance, MethodInfo method)
        {
            Name = name;
            _instance = instance;
            _method = method;
        }

        /// <summary>
        /// 方法在前后端协议中的完整键。
        /// </summary>
        public string Name { get; }

        /// <summary>
        /// 按方法签名反序列化参数并调用后端业务方法。
        /// </summary>
        public object? Invoke(string? argsJson)
        {
            var parameters = _method.GetParameters();
            var args = new object?[parameters.Length];

            using var document = string.IsNullOrWhiteSpace(argsJson)
                ? JsonDocument.Parse("[]")
                : JsonDocument.Parse(argsJson);

            if (document.RootElement.ValueKind != JsonValueKind.Array)
            {
                throw new InvalidOperationException($"Rivet method '{Name}' expects JSON array arguments.");
            }

            if (document.RootElement.GetArrayLength() != parameters.Length)
            {
                throw new InvalidOperationException(
                    $"Rivet method '{Name}' expects {parameters.Length} arguments, but received {document.RootElement.GetArrayLength()}.");
            }

            for (var index = 0; index < parameters.Length; index++)
            {
                args[index] = document.RootElement[index].Deserialize(parameters[index].ParameterType, RivetJson.Options);
            }

            return _method.Invoke(_instance, args);
        }
    }
}
