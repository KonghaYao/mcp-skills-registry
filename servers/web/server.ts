/**
 * web 子 server —— 公网搜索与读页 MCP 工具。
 *
 * 形态：动态 tool server（与 image-recognition 同类）。
 * 服务端只做协议与校验：query/URL 约束、SSRF、体积截断、MCP 错误语义；
 * 搜索与正文抽取委托给 WebProvider（默认 Tavily 兼容口）。
 *
 * 经聚合网关在 /web/mcp 端点暴露。
 */
import { McpServer } from "@modelcontextprotocol/server";
import { createMcppServerFactory } from "@peri-code/mcpp";
import { z } from "zod";
import { createDefaultWebProvider } from "./providers/tavily.ts";
import { SEARCH_DEPTHS, type WebProvider } from "./web-provider.ts";

const SERVER_NAME = "web";
const SERVER_VERSION = "1.0.0";
const FETCH_TIMEOUT_NOTE_MS = 30_000;
/** 读页正文截断，避免整页打进 MCP 响应。 */
const MAX_FETCH_CHARS = 80_000;

export interface WebServerOptions {
    provider?: WebProvider;
    /** 允许 fetch 内网/环回 URL（默认 false）。仅测试用。 */
    allowPrivateNetworks?: boolean;
}

function toolError(message: string) {
    return { content: [{ type: "text" as const, text: message }], isError: true };
}

/**
 * 基本 SSRF 防护：拒绝 IP 字面量的内网/环回/保留段与 localhost 主机名。
 * Cloudflare Worker 出站请求天然到不了私网，此处主要防护 Bun/Docker 本机形态，
 * 并避免把内网 URL 转交给上游抽取服务。
 */
function isBlockedUrl(rawUrl: string): boolean {
    let url: URL;
    try {
        url = new URL(rawUrl);
    } catch {
        return true;
    }
    if (url.protocol !== "http:" && url.protocol !== "https:") return true;
    const host = url.hostname.toLowerCase();
    if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local")) return true;
    if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) {
        const [a, b] = host.split(".").map(Number);
        if (a === 10 || a === 127 || a === 0) return true;
        if (a === 169 && b === 254) return true;
        if (a === 192 && b === 168) return true;
        if (a === 172 && b !== undefined && b >= 16 && b <= 31) return true;
    }
    return false;
}

function truncate(text: string): { text: string; truncated: boolean } {
    if (text.length <= MAX_FETCH_CHARS) return { text, truncated: false };
    return {
        text: `${text.slice(0, MAX_FETCH_CHARS)}\n\n[truncated at ${MAX_FETCH_CHARS} chars]`,
        truncated: true,
    };
}

function formatSearchText(query: string, answer: string | null | undefined, results: Array<{ title: string; url: string; content: string }>): string {
    const lines: string[] = [`# Search: ${query}`, ""];
    if (answer) {
        lines.push("## Answer", answer, "");
    }
    if (results.length === 0) {
        lines.push("No results.");
        return lines.join("\n");
    }
    lines.push("## Results");
    for (const [index, hit] of results.entries()) {
        lines.push(`${index + 1}. ${hit.title}`, `   ${hit.url}`);
        if (hit.content) lines.push(`   ${hit.content.replace(/\s+/g, " ").trim()}`);
        lines.push("");
    }
    return lines.join("\n").trimEnd();
}

const WEB_SEARCH_INPUT_SCHEMA = z.object({
    query: z.string().min(1).max(500),
    search_depth: z.enum(SEARCH_DEPTHS).default("basic"),
    max_results: z.number().int().min(1).max(10).default(5),
    include_answer: z.boolean().default(false),
});

const WEB_FETCH_INPUT_SCHEMA = z.object({
    url: z.url({ message: "url 必须是合法的 http(s) 地址" }),
});

export function createWebServer(options: WebServerOptions = {}) {
    const provider = options.provider ?? createDefaultWebProvider();
    const allowPrivateNetworks = options.allowPrivateNetworks === true;

    return createMcppServerFactory(
        {
            cacheVersion: "web@1.0.0",
            ttlMs: 0,
            scope: "public",
        },
        (_request, mcpp) => {
            const server = new McpServer(
                { name: SERVER_NAME, version: SERVER_VERSION },
                { capabilities: mcpp.capabilities },
            );

            server.registerTool(
                "web_search",
                {
                    title: "Web Search",
                    description:
                        "Search the public web. Returns titles, URLs, and snippets. " +
                        "Use web_fetch on a result URL when you need the full page. " +
                        "search_depth: basic (faster) or advanced; max_results 1-10 (default 5); " +
                        "include_answer adds an optional short synthesis.",
                    inputSchema: WEB_SEARCH_INPUT_SCHEMA,
                },
                async ({ query, search_depth, max_results, include_answer }) => {
                    try {
                        const result = await provider.search({
                            query,
                            searchDepth: search_depth,
                            maxResults: max_results,
                            includeAnswer: include_answer,
                        });
                        const text = formatSearchText(result.query, result.answer, result.results);
                        return {
                            content: [{ type: "text" as const, text }],
                            structuredContent: {
                                query: result.query,
                                answer: result.answer ?? null,
                                results: result.results,
                            },
                        };
                    } catch (error) {
                        return toolError(error instanceof Error ? error.message : "搜索失败：未知错误");
                    }
                },
            );

            server.registerTool(
                "web_fetch",
                {
                    title: "Web Fetch",
                    description:
                        "Fetch a public http(s) URL and return extracted page text. " +
                        `Body is truncated at ${MAX_FETCH_CHARS} characters. ` +
                        "Local or private addresses are rejected. " +
                        `Upstream extract typically completes within ${FETCH_TIMEOUT_NOTE_MS / 1000}s.`,
                    inputSchema: WEB_FETCH_INPUT_SCHEMA,
                },
                async ({ url }) => {
                    if (!allowPrivateNetworks && isBlockedUrl(url)) {
                        return toolError("拒绝访问该地址：仅允许公网 http(s) URL");
                    }
                    try {
                        const result = await provider.fetch(url);
                        const { text, truncated } = truncate(result.text);
                        const header = result.title ? `# ${result.title}\n\n` : "";
                        const body = `${header}${text}`;
                        return {
                            content: [{ type: "text" as const, text: body }],
                            structuredContent: {
                                url: result.url,
                                title: result.title ?? null,
                                text: body,
                                truncated,
                            },
                        };
                    } catch (error) {
                        return toolError(error instanceof Error ? error.message : "读页失败：未知错误");
                    }
                },
            );

            return server;
        },
    );
}

export const webServer = createWebServer();
