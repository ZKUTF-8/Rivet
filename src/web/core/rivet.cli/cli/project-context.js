import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { resolveRivetConfig } from "../src/config.ts";

/** 加载业务项目上下文，包括 Vite 模块、Vite 配置和 Rivet 解析配置。 */
export async function loadProjectContext(projectCwd, configPath) {
    const vite = await loadProjectVite(projectCwd);
    const viteConfigPath = resolveViteConfigPath(projectCwd, configPath);
    const viteConfig = await loadViteConfig(vite, projectCwd, viteConfigPath);
    const config = resolveRivetConfig(viteConfig.rivet, viteConfig);

    return {
        vite,
        viteConfigPath,
        viteConfig,
        config,
        projectCwd,
    };
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
