#!/usr/bin/env node
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { resolveRivetConfig } from "../src/config.ts";

const cwd = process.cwd();
const args = process.argv.slice(2);
const command = args[0] ?? "dev";
const options = parseOptions(args.slice(1));
const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const shellRoot = path.resolve(packageRoot, "../../../shell/core/rivet.shell");

if (command !== "dev") {
    console.error(`暂不支持 rivet ${command}，当前只实现 dev。`);
    process.exit(1);
}

const vite = await loadProjectVite(cwd);
const viteConfigPath = resolveViteConfigPath(cwd, options.config);
const viteConfig = await loadViteConfig(vite, cwd, viteConfigPath);
const config = resolveRivetConfig(viteConfig.rivet, viteConfig);
const webPort = options.port ?? String(config.web.port);
const webHost = options.host ?? config.web.host;
const webUrl = resolveWebDevUrl(options, config, webHost, webPort);

if (options.shell) {
    await runDevWithShell(vite, viteConfigPath, webUrl, webHost, webPort, config);
} else {
    const viteServer = await startVite(vite, viteConfigPath, webHost, webPort, cwd);
    bindViteShutdown(viteServer);
}

/** 解析 `rivet` 命令行参数。 */
function parseOptions(rawArgs) {
    const parsed = {
        shell: false,
        webUrl: undefined,
        host: undefined,
        port: undefined,
        config: undefined,
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
        }
    }

    return parsed;
}

/** 加载业务项目本地安装的 Vite，避免把 Vite 固定成 shell 包自身依赖。 */
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
async function runDevWithShell(viteModule, viteConfigPath, webUrl, webHost, webPort, config) {
    const viteServer = await startVite(viteModule, viteConfigPath, webHost, webPort, cwd);
    const cargoManifestPath = config.shell.cargoManifestPath
        ? path.resolve(cwd, config.shell.cargoManifestPath)
        : path.join(shellRoot, "Cargo.toml");
    const cargoCwd = path.dirname(cargoManifestPath);
    const tauriConfigPath = writeTauriDevConfig(cwd, webUrl, config);

    const shell = spawnChild(
        resolveCargoCommand(),
        ["tauri", "dev", "--config", tauriConfigPath, ...config.shell.args],
        {
            cwd: cargoCwd,
            env: {
                ...process.env,
                RIVET_WEB_DEV_URL: webUrl,
                RIVET_SERVER_URL: config.server.url,
                RIVET_BRIDGE_PATH: config.server.bridgePath,
            },
        },
    );

    let shuttingDown = false;

    const shutdown = async (code) => {
        if (shuttingDown) {
            return;
        }

        shuttingDown = true;
        await closeVite(viteServer);
        process.exit(code ?? 0);
    };

    shell.on("exit", (code) => {
        void shutdown(code);
    });

    process.on("SIGINT", () => {
        shell.kill();
        void shutdown(130);
    });

    process.on("SIGTERM", () => {
        shell.kill();
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

/** 给非壳子模式绑定退出清理。 */
function bindViteShutdown(viteServer) {
    let shuttingDown = false;

    const shutdown = async (code) => {
        if (shuttingDown) {
            return;
        }

        shuttingDown = true;
        await closeVite(viteServer);
        process.exit(code);
    };

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
