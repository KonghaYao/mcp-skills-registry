/**
 * web 子 server 的搜索 / 读页后端抽象。
 *
 * 协议层（server.ts）只做参数校验、SSRF、超时与 MCP 错误语义；
 * 具体搜索与正文抽取委托给 WebProvider（默认 Tavily 兼容口）。
 */

export const SEARCH_DEPTHS = ["basic", "advanced"] as const;
export type SearchDepth = (typeof SEARCH_DEPTHS)[number];

export interface WebSearchRequest {
    query: string;
    searchDepth: SearchDepth;
    maxResults: number;
    includeAnswer: boolean;
}

export interface WebSearchHit {
    title: string;
    url: string;
    content: string;
}

export interface WebSearchResult {
    query: string;
    answer?: string | null;
    results: WebSearchHit[];
}

export interface WebFetchResult {
    url: string;
    title?: string;
    text: string;
}

export interface WebProvider {
    search(request: WebSearchRequest): Promise<WebSearchResult>;
    fetch(url: string): Promise<WebFetchResult>;
}

/** 离线 smoke 用：不打真实上游。 */
export class MockWebProvider implements WebProvider {
    async search(request: WebSearchRequest): Promise<WebSearchResult> {
        return {
            query: request.query,
            answer: request.includeAnswer ? `[mock-answer] ${request.query}` : null,
            results: [
                {
                    title: `[mock:${request.searchDepth}] ${request.query}`,
                    url: "https://example.com/mock",
                    content: `max_results=${request.maxResults}`,
                },
            ],
        };
    }

    async fetch(url: string): Promise<WebFetchResult> {
        return {
            url,
            title: "Mock Page",
            text: `[mock-fetch] ${url}`,
        };
    }
}
