#!/usr/bin/env node
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { resolveRivetConfig } from "../src/config.ts";

const args = process.argv.slice(2);
const command = args[0] ?? "dev";
const options = parseOptions(args.slice(1));
const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const shellRoot = path.resolve(packageRoot, "../../../shell/core/rivet.shell");

if (command !== "dev") {
    console.error("\u6682\u4e0d\u652f\u6301 rivet " + command + "\uff0c\u5f53\u524d\u53ea\u5b9e\u73b0 dev\u3002");
    process.exit(1);
}

const viteConfig = await loadViteConfig(process.cwd(), options.config);
const config = resolveRivetConfig(viteConfig.rivet, viteConfig);
const webUrl = options.webUrl ?? process.env.RIVET_WEB_DEV_URL ?? config.web.devUrl;
const webPort = options.port ?? String(config.web.port);
const webHost = options.host ?? config.web.host;

if (options.shell) {
    await runDevWithShell(webUrl, webHost, webPort, config);
} else {
    spawnChild("pnpm", ["exec", "vite", "--host", webHost, "--port", webPort], {
        cwd: process.cwd(),
    });
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

/** 加载业务项目的 Vite 配置。 */
async function loadViteConfig(cwd, configPath) {
    const candidates = configPath
        ? [path.resolve(cwd, configPath)]
        : [
            path.resolve(cwd, "vite.config.ts"),
            path.resolve(cwd, "vite.config.js"),
            path.resolve(cwd, "vite.config.mjs"),
        ];

    const resolvedConfigPath = candidates.find((candidate) => existsSync(candidate));

    if (!resolvedConfigPath) {
        return {};
    }

    const configUrl = pathToFileURL(resolvedConfigPath).href;
    const configModule = await import(`${configUrl}?t=${Date.now()}`);
    return await resolveViteConfigExport(configModule.default);
}

/** 兼容 Vite 配置导出对象、Promise 或函数的几种写法。 */
async function resolveViteConfigExport(configExport) {
    const resolvedExport = await configExport;

    if (typeof resolvedExport !== "function") {
        return resolvedExport ?? {};
    }

    return await resolvedExport({
        command: "serve",
        mode: "development",
        isSsrBuild: false,
        isPreview: false,
    });
}

/** 启动 Vite，等待前端就绪后再启动 Tauri 壳。 */
async function runDevWithShell(webUrl, webHost, webPort, config) {
    const vite = spawnChild("pnpm", ["exec", "vite", "--host", webHost, "--port", webPort], {
        cwd: process.cwd(),
    });

    await waitForUrl(webUrl);

    const cargoManifestPath = config.shell.cargoManifestPath
        ? path.resolve(process.cwd(), config.shell.cargoManifestPath)
        : path.join(shellRoot, "Cargo.toml");

    const shell = spawnChild(
        "cargo",
        ["tauri", "dev", "--manifest-path", cargoManifestPath, ...config.shell.args],
        {
            cwd: path.resolve(path.dirname(cargoManifestPath), "../../.."),
            env: {
                ...process.env,
                RIVET_WEB_DEV_URL: webUrl,
                RIVET_SERVER_URL: config.server.url,
                RIVET_BRIDGE_PATH: config.server.bridgePath,
            },
        },
    );

    shell.on("exit", (code) => {
        vite.kill();
        process.exit(code ?? 0);
    });

    process.on("SIGINT", () => {
        vite.kill();
        shell.kill();
        process.exit(130);
    });
}

/** 创建子进程，并在 Windows 下使用 shell 兼容 `.cmd` 命令。 */
function spawnChild(command, childArgs, options) {
    return spawn(command, childArgs, {
        ...options,
        stdio: "inherit",
        shell: process.platform === "win32",
    });
}

/** 轮询指定 URL，直到前端开发服务可访问。 */
function waitForUrl(url) {
    const deadline = Date.now() + 30000;

    return new Promise((resolve, reject) => {
        const check = () => {
            const request = http.get(url, (response) => {
                response.resume();
                resolve();
            });

            request.on("error", (error) => {
                if (Date.now() > deadline) {
                    reject(error);
                    return;
                }

                setTimeout(check, 300);
            });

            request.setTimeout(1000, () => {
                request.destroy();
            });
        };

        check();
    });
}
