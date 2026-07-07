/** 解析 `rivet` 命令行参数。 */
export function parseOptions(rawArgs) {
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
