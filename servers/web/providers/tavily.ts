/**
 * Tavily 兼容搜索 / 抽取后端。
 *
 * 默认指到公开兼容口 https://tavily.claude-code-best.win ，key 填 `public`。
 * 鉴权必须走 header（Authorization: Bearer 或 X-API-Key）；
 * 不要把 api_key 放进 JSON body，兼容口会当成真实 Tavily key 并 401。
 */
import type {
    WebFetchResult,
    WebProvider,
    WebSearchRequest,
    WebSearchResult,
} from "../web-provider.ts";

const DEFAULT_BASE_URL = "https://tavily.claude-code-best.win";
const DEFAULT_API_KEY = "public";
const DEFAULT_TIMEOUT_MS = 30_000;

export interface TavilyWebProviderOptions {
    apiKey?: string;
    baseUrl?: string;
    timeoutMs?: number;
}

function env(name: string): string | undefined {
    const value = process.env[name];
    return value && value.length > 0 ? value : undefined;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
    return value !== null && typeof value === "object" && !Array.isArray(value)
        ? value as Record<string, unknown>
        : undefined;
}

function asString(value: unknown): string {
    return typeof value === "string" ? value : "";
}

export class TavilyWebProvider implements WebProvider {
    private readonly baseUrl: string;
    private readonly apiKey: string;
    private readonly timeoutMs: number;

    constructor(options: TavilyWebProviderOptions = {}) {
        this.baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
        this.apiKey = options.apiKey ?? DEFAULT_API_KEY;
        this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    }

    async search(request: WebSearchRequest): Promise<WebSearchResult> {
        const body = await this.post("/search", {
            query: request.query,
            search_depth: request.searchDepth,
            max_results: request.maxResults,
            include_answer: request.includeAnswer,
        });
        const rawResults = Array.isArray(body.results) ? body.results : [];
        const results = rawResults.flatMap((item) => {
            const record = asRecord(item);
            if (!record) return [];
            const url = asString(record.url);
            if (!url) return [];
            return [{
                title: asString(record.title) || url,
                url,
                content: asString(record.content),
            }];
        });
        return {
            query: asString(body.query) || request.query,
            answer: typeof body.answer === "string" ? body.answer : null,
            results,
        };
    }

    async fetch(url: string): Promise<WebFetchResult> {
        const body = await this.post("/extract", {
            urls: [url],
            extract_depth: "basic",
        });
        const rawResults = Array.isArray(body.results) ? body.results : [];
        const first = asRecord(rawResults[0]);
        const text = first ? asString(first.raw_content) || asString(first.content) : "";
        if (!text) {
            const failed = Array.isArray(body.failed_results) ? body.failed_results : [];
            const reason = asString(asRecord(failed[0])?.error) || "抽取结果为空";
            throw new Error(`网页抽取失败：${reason}`);
        }
        return {
            url: asString(first?.url) || url,
            title: first ? asString(first.title) || undefined : undefined,
            text,
        };
    }

    private async post(path: string, payload: Record<string, unknown>): Promise<Record<string, unknown>> {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), this.timeoutMs);
        let response: Response;
        try {
            response = await fetch(`${this.baseUrl}${path}`, {
                method: "POST",
                headers: {
                    "content-type": "application/json",
                    authorization: `Bearer ${this.apiKey}`,
                },
                signal: controller.signal,
                body: JSON.stringify(payload),
            });
        } catch (error) {
            throw new Error(`Tavily 请求失败：${error instanceof Error ? error.message : "未知网络错误"}`);
        } finally {
            clearTimeout(timer);
        }
        const raw = await response.text();
        if (!response.ok) {
            throw new Error(`Tavily HTTP ${response.status}：${raw.slice(0, 200)}`);
        }
        try {
            return asRecord(JSON.parse(raw)) ?? {};
        } catch {
            throw new Error("Tavily 返回了无法解析的 JSON");
        }
    }
}

/** 按执行环境构造默认后端；兼容口始终可用，缺省 key=`public`。 */
export function createDefaultWebProvider(): WebProvider {
    const timeoutRaw = env("TAVILY_API_TIMEOUT_MS");
    const timeoutMs = timeoutRaw ? Number(timeoutRaw) : undefined;
    return new TavilyWebProvider({
        apiKey: env("TAVILY_API_KEY") ?? DEFAULT_API_KEY,
        baseUrl: env("TAVILY_API_BASE_URL") ?? DEFAULT_BASE_URL,
        timeoutMs: Number.isFinite(timeoutMs) ? timeoutMs : undefined,
    });
}
