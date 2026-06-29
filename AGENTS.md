# Codex 项目规则

本项目统一使用中文沟通、中文注释和中文文档；代码标识符、包名、类型名、协议名等行业关键词可以保留英文。

Codex 在处理本仓库时，应优先读取并遵守 `.cursor/rules` 下的规则文件。`.cursor/rules/global.mdc` 是全局规则，其余规则按文件路径和模块范围适用。

如果 `.cursor/rules` 与当前仓库实现不一致，应以当前真实代码和项目目标为依据修正规则；不要为了迎合过期规则去改业务代码。

当前约定：

- 前端暴露给业务代码的全局对象统一命名为 `rv`。
- 开发阶段后端默认监听 `http://localhost:9710`，SignalR Hub 端点为 `/bridge`。
- 前端开发服务器默认使用 `http://localhost:9720`。
- 框架核心实现与业务示例先放在同一仓库内，通过本地引用协作；成熟后再拆分为 npm 包、NuGet 包和 Tauri 模板。
- 目录命名统一使用小写加点号，例如 `rivet.core`、`rivet.stress.test.server`、`mysoow.toolkit`。
- 根目录结构以 `src/server`、`src/web`、`src/shell` 为主，避免继续新增 `src/backend` 或 `src/tauri`。
