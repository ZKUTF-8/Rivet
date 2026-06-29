#!/usr/bin/env node
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const command = process.argv[2] ?? "dev";
const shellRoot = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../../../../shell/core/rivet.shell",
);

if (command !== "dev") {
    console.error(`暂不支持 rivet-shell ${command}，当前只实现 dev。`);
    process.exit(1);
}

const tauri = spawn(
    "cargo",
    ["tauri", "dev", "--manifest-path", path.join(shellRoot, "Cargo.toml")],
    {
        cwd: path.resolve(shellRoot, "../../.."),
        stdio: "inherit",
        shell: process.platform === "win32",
    },
);

tauri.on("exit", (code) => {
    process.exit(code ?? 0);
});
