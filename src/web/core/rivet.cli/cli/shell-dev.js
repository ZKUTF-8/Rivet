import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { closeVite, startVite } from "./dev-server.js";

/** 启动 Vite，等待监听完成后再启动 Tauri 壳。 */
export async function runDevWithShell(context, webUrl, webHost, webPort, contractWatcher, packageRoot) {
    const shellRoot = path.resolve(packageRoot, "../../../shell/core/rivet.shell");
    /** @tauri-apps/cli npm 包提供的本地 CLI 入口。 */
    const tauriCliPath = fileURLToPath(import.meta.resolve("@tauri-apps/cli/tauri.js"));

    const viteServer = await startVite(context.vite, context.viteConfigPath, webHost, webPort, context.projectCwd);
    const tauriConfigPath = writeTauriDevConfig(context.projectCwd, webUrl, context.config);

    const shell = spawnChild(
        process.execPath,
        [tauriCliPath, "dev", "--config", tauriConfigPath],
        {
            cwd: shellRoot,
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

/** 创建子进程。 */
function spawnChild(command, childArgs, options) {
    return spawn(command, childArgs, {
        ...options,
        stdio: "inherit",
        shell: false,
    });
}

/** Tauri 配置中的路径统一使用正斜杠，避免 Windows 反斜杠转义干扰。 */
function toTauriPath(value) {
    return value.replaceAll("\\", "/");
}
