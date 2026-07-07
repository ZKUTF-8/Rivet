# Codex 项目规则

本项目统一使用中文沟通、中文注释和中文文档；代码标识符、包名、类型名、协议名等行业关键词可以保留英文。

Codex 在处理本仓库时，应优先读取并遵守 `.cursor/rules` 下的规则文件。`.cursor/rules/global.mdc` 是全局规则，其余规则按文件路径和模块范围适用。

如果 `.cursor/rules` 与当前仓库实现不一致，应以当前真实代码和项目目标为依据修正规则；不要为了迎合过期规则去改业务代码。

当前约定：

- 前端暴露给业务代码的全局对象统一命名为 `rv`。
- 后端监听地址和端口由 ASP.NET Core 宿主配置；Rivet 只负责 Bridge Hub 路径，默认端点为 `/bridge`。
- 后端核心公开面保持最小：除业务项目必须直接引用的 API 外，类型和成员优先使用 `internal` 或 `private`。
- C# 私有字段、私有方法、内部类型和内部成员也需要中文 XML 文档注释；前端 TypeScript/Vue 的内部状态、内部函数、非导出常量也需要中文 JSDoc/TSDoc 或必要注释；注释解释职责和设计原因，不要翻译代码。
- 不要为了单次调用的一行逻辑额外封装私有方法；只有能表达边界、隐藏复杂度或复用时才拆方法。
- Rivet.Core 不内置 CORS，跨域由应用层自行配置。
- 前端开发服务器默认使用 `http://localhost:9720`。
- Mysoow.Toolkit 样板当前由宿主监听 `http://localhost:9735`，前端使用 `http://localhost:9730`。
- 框架核心实现与业务示例先放在同一仓库内，通过本地引用协作；成熟后再拆分为 npm 包、NuGet 包和 Tauri 模板。
- 目录命名统一使用小写加点号，例如 `rivet.core`、`rivet.stress.test.server`、`mysoow.toolkit`。
- 根目录结构以 `src/server`、`src/web`、`src/shell` 为主，避免继续新增 `src/backend` 或 `src/tauri`。
