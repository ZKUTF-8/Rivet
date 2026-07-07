#!/usr/bin/env node
import path from "node:path";
import { fileURLToPath } from "node:url";
import { watchContract } from "./contract-watch.js";
import { closeVite, bindShutdown, resolveWebDevUrl, startVite } from "./dev-server.js";
import { runGenerate } from "./generation.js";
import { parseOptions } from "./options.js";
import { loadProjectContext } from "./project-context.js";
import { runDevWithShell } from "./shell-dev.js";

/** 当前业务前端项目目录，所有相对路径配置都以它为基准解析。 */
const cwd = process.cwd();
/** 命令行原始参数，不包含 node 和脚本路径。 */
const args = process.argv.slice(2);
/** Rivet CLI 子命令；未指定时默认进入开发模式。 */
const command = args[0] ?? "dev";
/** 已解析的命令行选项，供 generate/dev/shell 流程共享。 */
const options = parseOptions(args.slice(1));
/** @rivet/cli 包根目录，用于定位随包分发的辅助能力。 */
const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

await main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
});

/** 根据子命令分派生成、浏览器开发和壳子开发流程。 */
async function main() {
    if (command === "generate") {
        const context = await loadProjectContext(cwd, options.config);
        await runGenerate(context, { build: !options.noBuild });
        process.exit(0);
    }

    if (command === "dev") {
        const context = await loadProjectContext(cwd, options.config);

        if (context.config.server.project) {
            await runGenerate(context, { build: false });
        }

        await runDev(context);
        return;
    }

    console.error(`暂不支持 rivet ${command}。`);
    process.exit(1);
}

/** 启动开发模式；壳子模式在 Vite 监听完成后再启动 Tauri。 */
async function runDev(context) {
    const contractWatcher = watchContract(context);
    const webPort = options.port ?? String(context.config.web.port);
    const webHost = options.host ?? context.config.web.host;
    const webUrl = resolveWebDevUrl(options, context.config, webHost, webPort);

    if (options.shell) {
        await runDevWithShell(context, webUrl, webHost, webPort, contractWatcher, packageRoot);
        return;
    }

    const viteServer = await startVite(context.vite, context.viteConfigPath, webHost, webPort, context.projectCwd);
    bindShutdown(async (code) => {
        contractWatcher.close();
        await closeVite(viteServer);
        process.exit(code);
    });
}
