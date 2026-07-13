# Web 前端通用规则

本文件适用于 `src/web` 下的 pnpm workspace、核心包和应用，在根规则基础上说明 Web 公共约定和各项目差异。

## 技术与编码

- 使用 Vue 3.5、Vite 8、TypeScript 和 pnpm workspace。
- 前端应用默认使用 Ant Design Vue 作为 UI 框架和设计体系。新增页面、表单、弹窗、表格、反馈和布局组件时，优先复用 Ant Design Vue，不重复实现已有的通用组件。
- UI 约定只适用于 `src/web/apps` 中的应用；`@rivet/client` 和 `@rivet/cli` 是无 UI 的框架核心，不得依赖 Ant Design Vue。
- 视觉样式应基于 Ant Design Vue 的 token、尺寸和交互语义扩展；业务品牌样式可以定制，但不要另建一套互相冲突的基础设计系统。
- npm 包名遵循 npm 规范；类型导出使用 `export type` 与值导出明确区分。
- 严格执行根规则的强制 JSDoc/TSDoc 要求；内部函数、箭头函数、参数、状态和属性也不例外。
- Vue 组件使用 `<script setup lang="ts">`；props 和 emits 优先使用泛型形式的 `defineProps<T>()`、`defineEmits<T>()`。
- 业务前端访问后端的全局对象统一命名为 `rv`，不要恢复旧名称 `ms`。
- 不直接导入或手工修改 `.rivet/generated`；生成物由 `@rivet/cli` 管理。
- 前端核心包和应用通过 pnpm workspace 本地引用，不擅自改成远程包版本。

## 验证

修改 Web 代码后，根据影响范围至少执行一个对应构建：

```powershell
pnpm --dir src/web --filter mysoow.toolkit build
pnpm --dir src/web --filter rivet.stress.test build
```

修改 `@rivet/client` 或 `@rivet/cli` 时，应构建所有受影响应用；修改生成链路时还要确认旧的成功生成物不会被失败流程破坏。

## 核心项目

### `core/rivet.client`

- `@rivet/client` 是浏览器运行时，负责 SignalR 连接、Vue 响应式状态、方法调用和全局 `rv` 注入。
- 只负责浏览器运行时，不读取文件、不生成代码，也不依赖 `@rivet/cli`。
- 使用 SignalR JSON 协议；压测应用的 MessagePack 支持不属于该包默认能力。
- `vue` 保持为 `peerDependency`，不得引入 Ant Design Vue 等 UI 框架。
- `createBackend()` 安装后自动连接；首次失败和断线后都以内部固定 2 秒间隔持续重试。
- 应用生成物默认位于 `.rivet/generated/rv.generated.ts`，通过 `@rivet/cli/vite` 注入 `@rivet/client/generated`。
- 业务入口不直接导入生成文件；生成文件只能依赖 `@rivet/client` 的运行时类型和方法，不能反向依赖 CLI。
- 使用 Vue Composition API；`use` 前缀只用于真正的 Composable。

### `core/rivet.cli`

- `@rivet/cli` 负责 contract 读取、TypeScript 代理生成、Vite 插件、开发进程和 Tauri 壳编排，不承担浏览器运行时职责。
- `rivet generate` 可以构建后端以刷新 contract；`rivet dev` 不应隐式长期托管后端进程。
- 文件生成采用先写临时结果、校验成功后替换的方式；失败时保留上一份可用生成物。
- 所有用户输入路径都按调用项目目录解析并规范化，不假定 CLI 总是在仓库根目录运行。
- 启动子进程时正确转发退出码、终止信号和必要环境变量，不遗留 Vite、dotnet 或 Tauri 子进程。
- Vite 插件注入 `/bridge` 代理时，应保留用户已有代理配置，并对冲突给出明确错误或稳定的合并行为。
- JavaScript 实现同样严格执行根规则的 JSDoc 要求。
- 修改 contract 解析或代理生成格式时，同步检查 Generator、Client 和 Mysoow.Toolkit。

## 应用项目

### `apps/rivet.stress.test`

- 该应用用于验证 SignalR 通信性能、协议差异和浏览器渲染开销，不代表普通业务应用的接入方式。
- 开发服务器使用 `http://localhost:9720`，后端目标为 `http://localhost:9710`，Hub 路径为 `/bridge`。
- 新增或重构通用 UI 时遵循 Ant Design Vue 默认约定；不得为了引入 UI 框架改变压测指标口径。
- 同时支持 JSON 和 MessagePack，默认使用 MessagePack；协议切换逻辑保留在压测专属连接封装中。
- 压测页面可以直接使用专属 SignalR 封装，但不要让压测逻辑污染 `@rivet/client`。
- 性能指标计算应区分采样误差、网络往返时间、服务端处理时间和浏览器渲染开销。

### `apps/mysoow.toolkit`

- 该应用是 Mysoow 内部工具，也是 Rivet 第一个真实落地的实验应用，不是一次性 Demo。
- 开发服务器使用 `http://localhost:9730`，后端目标为 `http://localhost:9735`。
- UI 基于 Ant Design Vue 构建，优先使用其组件和设计 token，业务样式在该体系上扩展。
- 通过 `createBackend()` 和生成的全局 `rv` 使用后端能力，不在组件中散落 SignalR 调用。
- 业务入口不直接导入 `.rivet/generated/rv.generated.ts`，也不为了展示框架机制而泄漏运行时实现细节。
- 后端公开契约变化后，重新生成代理并执行完整构建，确认模板、类型和运行时命名一致。
