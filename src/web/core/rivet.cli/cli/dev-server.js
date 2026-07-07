/** 启动 Vite，listen 完成后就代表开发服务已经可以被壳子加载。 */
export async function startVite(viteModule, configPath, webHost, webPort, projectCwd) {
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

/** 根据 CLI 参数和 Rivet 配置得到壳子实际加载的前端地址。 */
export function resolveWebDevUrl(parsedOptions, config, webHost, webPort) {
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

/** 绑定进程退出清理。 */
export function bindShutdown(shutdown) {
    process.on("SIGINT", () => {
        void shutdown(130);
    });

    process.on("SIGTERM", () => {
        void shutdown(143);
    });
}

/** 关闭 Vite 服务。 */
export async function closeVite(viteServer) {
    try {
        await viteServer.close();
    } catch (error) {
        console.error("关闭 Vite 服务失败：", error);
    }
}

/** 将监听地址转换成浏览器可访问地址。 */
function toBrowserHost(host) {
    if (host === "0.0.0.0" || host === "::") {
        return "localhost";
    }

    return host;
}
