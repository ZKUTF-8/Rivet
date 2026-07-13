# Tauri 桌面壳规则

本文件适用于 `src/shell`。当前只有 `core/rivet.shell`，它是由 `@rivet/cli` 在壳模式下编排的 Tauri v2 通用桌面壳。

## 技术与边界

- Rust crate 使用 snake_case；Rust 类型和函数遵循 Rust 命名规范，并严格执行根规则的中文文档注释要求。
- 使用系统 WebView2；`frontendDist`、`devUrl` 等开发配置由 CLI 生成的临时配置覆盖。
- 不把某个业务应用的临时路径、端口或发布产物固化为壳的通用能力。
- 当前壳只初始化必要插件并加载前端，尚未实现自动启动 .NET sidecar。
- 启用 sidecar 前必须同时完成发布产物命名、平台 target triple、capability、参数传递、进程退出和错误展示设计。
- Tauri capability 和 shell 权限坚持最小授权，不使用无边界的命令执行范围。
- 不手工修改 `gen/schemas`；修改依赖时同步维护已跟踪的 `Cargo.lock`。

## 验证

修改 Rust 代码、Tauri 配置或 capability 后，在 `src/shell/core/rivet.shell` 执行：

```powershell
cargo check
```
