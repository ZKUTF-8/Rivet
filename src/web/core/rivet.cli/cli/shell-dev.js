import { spawn, spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { closeVite, startVite } from "./dev-server.js";

/** 启动 Vite，等待监听完成后再启动 Tauri 壳。 */
export async function runDevWithShell(context, webUrl, webHost, webPort, contractWatcher, packageRoot) {
    const shellRoot = path.resolve(packageRoot, "../../../shell/core/rivet.shell");
    const shellManifestPath = path.join(shellRoot, "Cargo.toml");
    const cargoCwd = path.dirname(shellManifestPath);
    const cargoCommand = resolveCargoCommand();
    ensureTauriCli(cargoCommand, cargoCwd, shellManifestPath);

    const viteServer = await startVite(context.vite, context.viteConfigPath, webHost, webPort, context.projectCwd);
    const tauriConfigPath = writeTauriDevConfig(context.projectCwd, webUrl, context.config);

    const shell = spawnChild(
        cargoCommand,
        ["tauri", "dev", "--config", tauriConfigPath],
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

/**
 * 确保当前用户环境已安装壳工程声明的 Tauri CLI 版本；缺失或不一致时通过 Cargo 自动安装。
 * @param cargoCommand 当前平台使用的 Cargo 命令。
 * @param cargoCwd 执行 Cargo 命令时使用的壳工程目录。
 * @param shellManifestPath 壳工程 Cargo.toml 的绝对路径。
 * @returns 无返回值；环境不可用或安装失败时抛出异常。
 */
function ensureTauriCli(cargoCommand, cargoCwd, shellManifestPath) {
    const cargoCheck = spawnSync(cargoCommand, ["--version"], {
        cwd: cargoCwd,
        stdio: "ignore",
        shell: false,
    });

    if (cargoCheck.status !== 0) {
        throw new Error("未检测到 Rust Cargo，请先安装 Rust 工具链后再启动桌面壳。");
    }

    const tauriCliVersion = resolveTauriCliVersion(cargoCommand, cargoCwd, shellManifestPath);
    const tauriCheck = spawnSync(cargoCommand, ["tauri", "--version"], {
        cwd: cargoCwd,
        encoding: "utf8",
        shell: false,
    });
    const installedVersion = tauriCheck.status === 0
        ? tauriCheck.stdout.trim().split(/\s+/).at(-1)
        : undefined;

    if (installedVersion === tauriCliVersion) {
        return;
    }

    if (installedVersion) {
        console.log(`当前 Tauri CLI 为 ${installedVersion}，正在自动切换到项目要求的 ${tauriCliVersion}...`);
    } else {
        console.log(`未检测到 Tauri CLI，正在自动安装 ${tauriCliVersion}，首次安装可能需要几分钟...`);
    }

    const install = spawnSync(
        cargoCommand,
        ["install", "tauri-cli", "--version", tauriCliVersion, "--locked"],
        {
            cwd: cargoCwd,
            stdio: "inherit",
            shell: false,
        },
    );

    if (install.status !== 0) {
        throw new Error("Tauri CLI 自动安装失败，请检查网络和 Rust 工具链后重试。");
    }

    const installedCheck = spawnSync(cargoCommand, ["tauri", "--version"], {
        cwd: cargoCwd,
        encoding: "utf8",
        shell: false,
    });
    const verifiedVersion = installedCheck.status === 0
        ? installedCheck.stdout.trim().split(/\s+/).at(-1)
        : undefined;

    if (verifiedVersion !== tauriCliVersion) {
        throw new Error(`Tauri CLI 安装后版本验证失败，期望 ${tauriCliVersion}，实际 ${verifiedVersion ?? "无法执行"}。`);
    }

    console.log(`Tauri CLI ${tauriCliVersion} 安装完成，继续启动桌面壳。`);
}

/**
 * 通过 Cargo 元数据读取壳工程声明的 Tauri CLI 版本。
 * @param cargoCommand 当前平台使用的 Cargo 命令。
 * @param cargoCwd 执行 Cargo 命令时使用的壳工程目录。
 * @param shellManifestPath 壳工程 Cargo.toml 的绝对路径。
 * @returns 壳工程要求安装的 Tauri CLI 版本。
 */
function resolveTauriCliVersion(cargoCommand, cargoCwd, shellManifestPath) {
    const metadataResult = spawnSync(
        cargoCommand,
        ["metadata", "--manifest-path", shellManifestPath, "--no-deps", "--format-version", "1"],
        {
            cwd: cargoCwd,
            encoding: "utf8",
            shell: false,
        },
    );

    if (metadataResult.status !== 0) {
        throw new Error("无法读取壳工程 Cargo 元数据，请检查 Cargo.toml 配置。");
    }

    const metadata = JSON.parse(metadataResult.stdout);
    const tauriCliVersion = metadata.packages[0]?.metadata?.rivet?.["tauri-cli-version"];

    if (typeof tauriCliVersion !== "string" || tauriCliVersion.length === 0) {
        throw new Error("壳工程未在 package.metadata.rivet 中配置 tauri-cli-version。");
    }

    return tauriCliVersion;
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

/** 解析 Cargo 可执行命令。 */
function resolveCargoCommand() {
    return process.platform === "win32" ? "cargo.exe" : "cargo";
}

/** Tauri 配置中的路径统一使用正斜杠，避免 Windows 反斜杠转义干扰。 */
function toTauriPath(value) {
    return value.replaceAll("\\", "/");
}
