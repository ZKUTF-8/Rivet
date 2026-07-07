using System.Text.Json;

namespace Rivet.Core;

/// <summary>
/// Rivet 可绑定状态。后端业务代码通过 Value 读写，框架负责把变更同步到前端。
/// </summary>
public sealed class Rv<T> : IRvState
{
    /// <summary>
    /// 保护状态读写的同步对象，避免后端线程和 Hub 写入同时修改同一个值。
    /// </summary>
    private readonly object _syncRoot = new();

    /// <summary>
    /// 运行时注入的发布回调；未绑定前允许业务代码先修改值但不推送。
    /// </summary>
    private Action<RvStateChange>? _publish;

    /// <summary>
    /// 当前状态在前后端协议中的变量键，由运行时绑定时写入。
    /// </summary>
    private string? _key;

    /// <summary>
    /// 后端持有的真实状态值。
    /// </summary>
    private T _value;

    /// <summary>
    /// 创建一个可绑定状态。
    /// </summary>
    public Rv(T value)
    {
        _value = value;
    }

    /// <summary>
    /// 当前状态值。设置此属性会通知前端。
    /// </summary>
    public T Value
    {
        get
        {
            lock (_syncRoot)
            {
                return _value;
            }
        }
        set
        {
            SetValue(value, null);
        }
    }

    Type IRvState.ValueType => typeof(T);

    object? IRvState.UntypedValue => Value;

    /// <summary>
    /// 手动通知前端当前值已经变化。集合内部变更后可以调用此方法。
    /// </summary>
    public void NotifyChanged()
    {
        Publish(null);
    }

    void IRvState.Attach(string key, Action<RvStateChange> publish)
    {
        _key = key;
        _publish = publish;
    }

    void IRvState.SetJson(string? valueJson, string? excludedConnectionId)
    {
        var value = valueJson is null
            ? default
            : JsonSerializer.Deserialize<T>(valueJson, RivetJson.Options);

        SetValue(value!, excludedConnectionId);
    }

    /// <summary>
    /// 统一写入后端状态，并携带需要排除的前端连接，避免前端写入后被原样回推。
    /// </summary>
    private void SetValue(T value, string? excludedConnectionId)
    {
        lock (_syncRoot)
        {
            _value = value;
        }

        Publish(excludedConnectionId);
    }

    /// <summary>
    /// 将当前状态变更交给运行时发布；未完成运行时绑定时直接忽略。
    /// </summary>
    private void Publish(string? excludedConnectionId)
    {
        if (_key is null || _publish is null)
        {
            return;
        }

        _publish(new RvStateChange(_key, excludedConnectionId));
    }
}
