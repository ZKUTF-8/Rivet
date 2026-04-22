# Rivet

**A .NET + Vue framework for industrial HMI development. Attribute-marked C# → auto-generated frontend-backend bridge, zero boilerplate.**

> 🚧 This project is in early development. No release is available yet.

[中文文档](./README.md)

---

## What Problem Does It Solve?

In industrial HMI development, .NET (C#) dominates the backend, but desktop UI frameworks (WPF / Avalonia) fall short in layout flexibility, component ecosystem, and dev efficiency compared to the web.

Rivet lets you use .NET for hardware & business logic, and Vue for modern UI, with all communication code auto-generated — developers focus on business, not glue code.

## What It Looks Like

```csharp
// .NET backend: write business logic, add attributes
public class DeviceService
{
    [JsCallable]
    public async Task<bool> StartCollection(int channel) { /* ... */ }

    [JsBindable]
    private double _temperature;

    [JsEvent]
    public event Action<double[]> OnDataReceived;
}
```

```vue
<!-- Vue frontend: just use it, no communication code needed -->
<script setup>
await rv.device.startCollection(1)
rv.device.onDataReceived.listen((data) => { /* ... */ })
</script>

<template>
  <div>Temperature: {{ rv.device.temperature.value }} ℃</div>
</template>
```

## License

- **Open Source**: [AGPL-3.0](./LICENSE) — Free for personal, educational, and open-source projects
- **Commercial**: A commercial license is required for closed-source commercial use. See [LICENSE_COMMERCIAL.md](./LICENSE_COMMERCIAL.md)
