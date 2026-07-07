import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { renderGeneratedRv } from "./generators/rv.js";

/** 执行一次 contract 到 TypeScript 的生成流程。 */
export async function runGenerate(context, generateOptions) {
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

/** 根据配置推导 contract 路径。 */
export function resolveContractPath(context) {
    if (context.config.generated.contract) {
        return path.resolve(context.projectCwd, context.config.generated.contract);
    }

    if (!context.config.server.project) {
        throw new Error("缺少 rivet.server.project，无法推导 contract 路径。");
    }

    return path.join(path.dirname(path.resolve(context.projectCwd, context.config.server.project)), ".rivet", "rivet.contract.json");
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
