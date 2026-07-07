#!/usr/bin/env node
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, renameSync, unwatchFile, watchFile, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { resolveRivetConfig } from "../src/config.ts";

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
/** 默认 Tauri 壳子工程目录；业务项目未覆盖时由 CLI 直接调用。 */
const shellRoot = path.resolve(packageRoot, "../../../shell/core/rivet.shell");

await main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
});

/** 根据子命令分派生成、浏览器开发和壳子开发流程。 */
async function main() {
    if (command === "generate") {
        const context = await loadProjectContext();
        await runGenerate(context, { build: !options.noBuild });
        process.exit(0);
    }

    if (command === "dev") {
        const context = await loadProjectContext();
        if (context.config.server.project) {
            await runGenerate(context, { build: false });
        }
        await runDev(context);
        return;
    }

    console.error(`暂不支持 rivet ${command}。`);
    process.exit(1);
}

/** 解析 `rivet` 命令行参数。 */
function parseOptions(rawArgs) {
    const parsed = {
        shell: false,
        webUrl: undefined,
        host: undefined,
        port: undefined,
        config: undefined,
        noBuild: false,
    };

    for (let index = 0; index < rawArgs.length; index += 1) {
        const arg = rawArgs[index];

        if (arg === "--shell") {
            parsed.shell = true;
            continue;
        }

        if (arg === "--web-url") {
            parsed.webUrl = rawArgs[index + 1];
            index += 1;
            continue;
        }

        if (arg === "--host") {
            parsed.host = rawArgs[index + 1];
            index += 1;
            continue;
        }

        if (arg === "--port") {
            parsed.port = rawArgs[index + 1];
            index += 1;
            continue;
        }

        if (arg === "--config") {
            parsed.config = rawArgs[index + 1];
            index += 1;
            continue;
        }

        if (arg === "--no-build") {
            parsed.noBuild = true;
        }
    }

    return parsed;
}

/** 加载业务项目上下文。 */
async function loadProjectContext() {
    const vite = await loadProjectVite(cwd);
    const viteConfigPath = resolveViteConfigPath(cwd, options.config);
    const viteConfig = await loadViteConfig(vite, cwd, viteConfigPath);
    const config = resolveRivetConfig(viteConfig.rivet, viteConfig);

    return {
        vite,
        viteConfigPath,
        viteConfig,
        config,
        projectCwd: cwd,
    };
}

/** 执行一次生成。 */
async function runGenerate(context, generateOptions) {
    if (generateOptions.build && context.config.server.project) {
        runDotnetBuild(context);
    }

    const contractPath = resolveContractPath(context);
    const outputPath = path.resolve(context.projectCwd, context.config.generated.out);

    if (!existsSync(contractPath)) {
        throw new Error(`找不到 Rivet contract：${contractPath}`);
    }

    const contract = JSON.parse(readFileSync(contractPath, "utf8").replace(/^\uFEFF/, ""));
    const content = renderGeneratedRv(contract);
    writeFileAtomically(outputPath, content);
    console.log(`Rivet 已生成 ${path.relative(context.projectCwd, outputPath)}`);
}

/** 启动开发模式。 */
async function runDev(context) {
    const contractWatcher = watchContract(context);
    const webPort = options.port ?? String(context.config.web.port);
    const webHost = options.host ?? context.config.web.host;
    const webUrl = resolveWebDevUrl(options, context.config, webHost, webPort);

    if (options.shell) {
        await runDevWithShell(context, webUrl, webHost, webPort, contractWatcher);
        return;
    }

    const viteServer = await startVite(context.vite, context.viteConfigPath, webHost, webPort, context.projectCwd);
    bindShutdown(async (code) => {
        contractWatcher.close();
        await closeVite(viteServer);
        process.exit(code);
    });
}

/** 监听 contract 文件并生成 TypeScript。 */
function watchContract(context) {
    if (!context.config.server.project && !context.config.generated.contract) {
        return {
            close() {
                return undefined;
            },
        };
    }

    const contractPath = resolveContractPath(context);
    let running = false;

    const generate = async () => {
        if (running) return;
        running = true;
        try {
            await runGenerate(context, { build: false });
        } catch (error) {
            console.error(error instanceof Error ? error.message : error);
        } finally {
            running = false;
        }
    };

    watchFile(contractPath, { interval: 300 }, () => {
        void generate();
    });

    return {
        close() {
            unwatchFile(contractPath);
        },
    };
}

/** 显式生成时运行一次后端构建，用于触发 rivet.generator 刷新 contract。 */
function runDotnetBuild(context) {
    const projectPath = path.resolve(context.projectCwd, context.config.server.project);
    const result = spawnSync("dotnet", [
        "build",
        projectPath,
        "--no-restore",
    ], {
        cwd: context.projectCwd,
        stdio: "inherit",
        shell: false,
    });

    if (result.status !== 0) {
        throw new Error("Rivet contract 生成前的 dotnet build 失败。");
    }
}

/** 根据配置推导 contract 路径。 */
function resolveContractPath(context) {
    if (context.config.generated.contract) {
        return path.resolve(context.projectCwd, context.config.generated.contract);
    }

    if (!context.config.server.project) {
        throw new Error("缺少 rivet.server.project，无法推导 contract 路径。");
    }

    return path.join(path.dirname(path.resolve(context.projectCwd, context.config.server.project)), ".rivet", "rivet.contract.json");
}

/** 生成 rv.generated.ts 内容。 */
function renderGeneratedRv(contract) {
    const lines = [
        "import type { RivetRuntimeClient } from '@rivet/client'",
        "",
        "export function createRv(runtime: RivetRuntimeClient) {",
        "    return {",
    ];

    for (const service of contract.services ?? []) {
        lines.push(...renderTsDoc(service.description, 8));
        lines.push(`        ${service.name}: {`);

        for (const variable of service.variables ?? []) {
            lines.push(...renderTsDoc(variable.description, 12));
            lines.push(`            ${variable.name}: runtime.bind<${variable.tsType ?? "unknown"}>('${variable.key}'),`);
        }

        for (const method of service.methods ?? []) {
            const parameters = method.parameters ?? [];
            const parameterList = parameters.map((parameter) => `${parameter.name}: ${parameter.tsType ?? "unknown"}`).join(", ");
            const argumentList = parameters.map((parameter) => parameter.name).join(", ");
            lines.push(...renderTsDoc(method.description, 12, [
                ...parameters
                    .filter((parameter) => hasDocText(parameter.description))
                    .map((parameter) => `@param ${parameter.name} ${normalizeDocText(parameter.description)}`),
                ...(hasDocText(method.returnDescription) ? [`@returns ${normalizeDocText(method.returnDescription)}`] : []),
            ]));
            lines.push(`            ${method.name}: (${parameterList}) => runtime.call<${method.returnType ?? "unknown"}>('${method.key}', [${argumentList}]),`);
        }

        lines.push("        },");
    }

    lines.push("    }");
    lines.push("}");
    lines.push("");
    lines.push("export type Rv = ReturnType<typeof createRv>");
    lines.push("");
    lines.push("declare global {");
    lines.push("    var rv: Rv");
    lines.push("");
    lines.push("    interface Window {");
    lines.push("        rv: Rv");
    lines.push("    }");
    lines.push("}");
    lines.push("");
    lines.push("export {}");
    lines.push("");
    return lines.join("\n");
}

/** 将 contract 中的说明文本渲染成 TSDoc 注释行。 */
function renderTsDoc(description, indent, tags = []) {
    const docLines = normalizeDocText(description)
        .split("\n")
        .filter((line) => line.length > 0);
    const tagLines = tags.map((tag) => normalizeDocText(tag)).filter((tag) => tag.length > 0);

    if (docLines.length === 0 && tagLines.length === 0) {
        return [];
    }

    const prefix = " ".repeat(indent);
    const lines = [`${prefix}/**`];

    for (const line of docLines) {
        lines.push(`${prefix} * ${escapeTsDocLine(line)}`);
    }

    if (docLines.length > 0 && tagLines.length > 0) {
        lines.push(`${prefix} *`);
    }

    for (const tag of tagLines) {
        lines.push(`${prefix} * ${escapeTsDocLine(tag)}`);
    }

    lines.push(`${prefix} */`);
    return lines;
}

/** 判断 contract 文档字段是否包含有效说明。 */
function hasDocText(value) {
    return normalizeDocText(value).length > 0;
}

/** 清理说明文本中的换行和缩进，避免生成的注释出现松散空白。 */
function normalizeDocText(value) {
    return String(value ?? "")
        .replace(/\r\n/g, "\n")
        .replace(/\r/g, "\n")
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line.length > 0)
        .join("\n");
}

/** 转义会提前结束 TSDoc 块的字符序列。 */
function escapeTsDocLine(value) {
    return value.replace(/\*\//g, "*\\/");
}

/** 使用临时文件覆盖生成结果，避免读取到半截内容。 */
function writeFileAtomically(outputPath, content) {
    mkdirSync(path.dirname(outputPath), { recursive: true });

    if (existsSync(outputPath) && readFileSync(outputPath, "utf8") === content) {
        return;
    }

    const tempPath = `${outputPath}.tmp`;
    writeFileSync(tempPath, content, "utf8");
    renameSync(tempPath, outputPath);
}

/** 加载业务项目本地安装的 Vite，避免把 Vite 固定成 CLI 包自身依赖。 */
async function loadProjectVite(projectCwd) {
    const projectRequire = createRequire(path.join(projectCwd, "package.json"));
    const viteEntry = projectRequire.resolve("vite");
    return await import(pathToFileURL(viteEntry).href);
}

/** 查找业务项目的 Vite 配置文件。 */
function resolveViteConfigPath(projectCwd, configPath) {
    if (configPath) {
        const resolved = path.resolve(projectCwd, configPath);

        if (!existsSync(resolved)) {
            throw new Error(`找不到 Vite 配置文件：${resolved}`);
        }

        return resolved;
    }

    return [
        path.resolve(projectCwd, "vite.config.ts"),
        path.resolve(projectCwd, "vite.config.js"),
        path.resolve(projectCwd, "vite.config.mjs"),
    ].find((candidate) => existsSync(candidate));
}

/** 通过 Vite 自身加载配置，兼容 TS 配置和插件解析。 */
async function loadViteConfig(viteModule, projectCwd, configPath) {
    if (!configPath) {
        return {};
    }

    const result = await viteModule.loadConfigFromFile(
        {
            command: "serve",
            mode: "development",
            isSsrBuild: false,
            isPreview: false,
        },
        configPath,
        projectCwd,
    );

    return result?.config ?? {};
}

/** 启动 Vite，listen 完成后就代表开发服务已经可以被壳子加载。 */
async function startVite(viteModule, configPath, webHost, webPort, projectCwd) {
    const server = await viteModule.createServer({
        configFile: configPath,
        root: projectCwd,
        clearScreen: false,
        server: {
            host: webHost,
            port: Number(webPort),
        },
    });

    await server.listen();
    server.printUrls();

    if (typeof server.bindCLIShortcuts === "function") {
        server.bindCLIShortcuts({ print: true });
    }

    return server;
}

/** 启动 Vite，等待监听完成后再启动 Tauri 壳。 */
async function runDevWithShell(context, webUrl, webHost, webPort, contractWatcher) {
    const viteServer = await startVite(context.vite, context.viteConfigPath, webHost, webPort, context.projectCwd);
    const cargoManifestPath = context.config.shell.cargoManifestPath
        ? path.resolve(context.projectCwd, context.config.shell.cargoManifestPath)
        : path.join(shellRoot, "Cargo.toml");
    const cargoCwd = path.dirname(cargoManifestPath);
    const tauriConfigPath = writeTauriDevConfig(context.projectCwd, webUrl, context.config);

    const shell = spawnChild(
        resolveCargoCommand(),
        ["tauri", "dev", "--config", tauriConfigPath, ...context.config.shell.args],
        {
            cwd: cargoCwd,
            env: {
                ...process.env,
                RIVET_WEB_DEV_URL: webUrl,
                RIVET_SERVER_URL: context.config.server.url,
                RIVET_BRIDGE_PATH: context.config.server.bridgePath,
            },
        },
    );

    let shuttingDown = false;

    const shutdown = async (code) => {
        if (shuttingDown) {
            return;
        }

        shuttingDown = true;
        contractWatcher.close();
        shell.kill();
        await closeVite(viteServer);
        process.exit(code ?? 0);
    };

    shell.on("exit", (code) => {
        void shutdown(code);
    });

    process.on("SIGINT", () => {
        void shutdown(130);
    });

    process.on("SIGTERM", () => {
        void shutdown(143);
    });
}

/** 根据 CLI 参数和 Rivet 配置得到壳子实际加载的前端地址。 */
function resolveWebDevUrl(parsedOptions, config, webHost, webPort) {
    if (parsedOptions.webUrl) {
        return parsedOptions.webUrl;
    }

    if (process.env.RIVET_WEB_DEV_URL) {
        return process.env.RIVET_WEB_DEV_URL;
    }

    if (parsedOptions.host || parsedOptions.port) {
        return `http://${toBrowserHost(webHost)}:${webPort}`;
    }

    return config.web.devUrl;
}

/** 写入 Tauri dev 临时配置，让业务项目端口和 dist 真正传给壳子。 */
function writeTauriDevConfig(projectCwd, webUrl, config) {
    const rivetDir = path.join(projectCwd, ".rivet");
    mkdirSync(rivetDir, { recursive: true });

    const configPath = path.join(rivetDir, "tauri.dev.conf.json");
    const tauriConfig = {
        build: {
            devUrl: webUrl,
            frontendDist: toTauriPath(path.resolve(projectCwd, config.web.dist)),
            beforeDevCommand: "",
            beforeBuildCommand: "",
        },
    };

    writeFileSync(configPath, `${JSON.stringify(tauriConfig, null, 4)}\n`, "utf8");
    return configPath;
}

/** 将监听地址转换成浏览器可访问地址。 */
function toBrowserHost(host) {
    if (host === "0.0.0.0" || host === "::") {
        return "localhost";
    }

    return host;
}

/** Tauri 配置中的路径统一使用正斜杠，避免 Windows 反斜杠转义干扰。 */
function toTauriPath(value) {
    return value.replaceAll("\\", "/");
}

/** 绑定退出清理。 */
function bindShutdown(shutdown) {
    process.on("SIGINT", () => {
        void shutdown(130);
    });

    process.on("SIGTERM", () => {
        void shutdown(143);
    });
}

/** 关闭 Vite 服务。 */
async function closeVite(viteServer) {
    try {
        await viteServer.close();
    } catch (error) {
        console.error("关闭 Vite 服务失败：", error);
    }
}

/** 创建子进程。 */
function spawnChild(command, childArgs, options) {
    return spawn(command, childArgs, {
        ...options,
        stdio: "inherit",
        shell: false,
    });
}

/** 解析 Cargo 可执行命令。 */
function resolveCargoCommand() {
    return process.platform === "win32" ? "cargo.exe" : "cargo";
}
