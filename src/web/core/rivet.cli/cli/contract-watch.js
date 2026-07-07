import { unwatchFile, watchFile } from "node:fs";
import { resolveContractPath, runGenerate } from "./generation.js";

/** 监听 contract 文件变化，并在变化后刷新前端 TypeScript 代理。 */
export function watchContract(context) {
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
