// 这里生成的是前端项目的 `.rivet/generated/rv.generated.ts`。
// 下面是一个典型生成结果示例，保留为注释是为了直接看到生成文件的最终形状和调用关系。
//
// import type { RivetRuntimeClient } from '@rivet/client'
//
// export function createRv(runtime: RivetRuntimeClient) {
//     return {
//         toolkit: {
//             /**
//              * 后端计数器。
//              */
//             counter: runtime.bind<number>('toolkit.counter'),
//             /**
//              * 调用后端 Echo 方法。
//              *
//              * @param value 要发送给后端的文本。
//              * @returns 后端返回的文本。
//              */
//             echo: (value: string) => runtime.call<string>('toolkit.echo', [value]),
//         },
//     }
// }
//
// export type Rv = ReturnType<typeof createRv>
//
// declare global {
//     var rv: Rv
//
//     interface Window {
//         rv: Rv
//     }
// }
//
// export {}

/** 生成 rv.generated.ts 内容；后续 DTO 生成应拆到同级 generator。 */
export function renderGeneratedRv(contract) {
    const lines = [
        "import type { RivetRuntimeClient } from '@rivet/client'",
        "",
        "export function createRv(runtime: RivetRuntimeClient) {",
        "    return {",
    ];

    for (const service of contract.services ?? []) {
        lines.push(...renderTsDoc(service.description, 8));
        lines.push(`        ${service.name}: {`);

        for (const variable of service.variables ?? []) {
            lines.push(...renderTsDoc(variable.description, 12));
            lines.push(`            ${variable.name}: runtime.bind<${variable.tsType ?? "unknown"}>('${variable.key}'),`);
        }

        for (const method of service.methods ?? []) {
            const parameters = method.parameters ?? [];
            const parameterList = parameters.map((parameter) => `${parameter.name}: ${parameter.tsType ?? "unknown"}`).join(", ");
            const argumentList = parameters.map((parameter) => parameter.name).join(", ");
            lines.push(...renderTsDoc(method.description, 12, [
                ...parameters
                    .filter((parameter) => hasDocText(parameter.description))
                    .map((parameter) => `@param ${parameter.name} ${normalizeDocText(parameter.description)}`),
                ...(hasDocText(method.returnDescription) ? [`@returns ${normalizeDocText(method.returnDescription)}`] : []),
            ]));
            lines.push(`            ${method.name}: (${parameterList}) => runtime.call<${method.returnType ?? "unknown"}>('${method.key}', [${argumentList}]),`);
        }

        lines.push("        },");
    }

    lines.push("    }");
    lines.push("}");
    lines.push("");
    lines.push("export type Rv = ReturnType<typeof createRv>");
    lines.push("");
    lines.push("declare global {");
    lines.push("    var rv: Rv");
    lines.push("");
    lines.push("    interface Window {");
    lines.push("        rv: Rv");
    lines.push("    }");
    lines.push("}");
    lines.push("");
    lines.push("export {}");
    lines.push("");
    return lines.join("\n");
}

/** 将 contract 中的说明文本渲染成 TSDoc 注释行。 */
function renderTsDoc(description, indent, tags = []) {
    const docLines = normalizeDocText(description)
        .split("\n")
        .filter((line) => line.length > 0);
    const tagLines = tags.map((tag) => normalizeDocText(tag)).filter((tag) => tag.length > 0);

    if (docLines.length === 0 && tagLines.length === 0) {
        return [];
    }

    const prefix = " ".repeat(indent);
    const lines = [`${prefix}/**`];

    for (const line of docLines) {
        lines.push(`${prefix} * ${escapeTsDocLine(line)}`);
    }

    if (docLines.length > 0 && tagLines.length > 0) {
        lines.push(`${prefix} *`);
    }

    for (const tag of tagLines) {
        lines.push(`${prefix} * ${escapeTsDocLine(tag)}`);
    }

    lines.push(`${prefix} */`);
    return lines;
}

/** 判断 contract 文档字段是否包含有效说明。 */
function hasDocText(value) {
    return normalizeDocText(value).length > 0;
}

/** 清理说明文本中的换行和缩进，避免生成的注释出现松散空白。 */
function normalizeDocText(value) {
    return String(value ?? "")
        .replace(/\r\n/g, "\n")
        .replace(/\r/g, "\n")
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line.length > 0)
        .join("\n");
}

/** 转义会提前结束 TSDoc 块的字符序列。 */
function escapeTsDocLine(value) {
    return value.replace(/\*\//g, "*\\/");
}
