/**
 * OpenAI 兼容生图后端：POST {baseUrl}/images/generations，要求上游返回 url。
 *
 * 环境变量（IMAGE_GEN_* 优先，密钥/基址可回退到 VISION_*）：
 *   IMAGE_GEN_API_KEY / VISION_API_KEY     必填之一
 *   IMAGE_GEN_API_BASE_URL / VISION_API_BASE_URL  默认 https://api.openai.com/v1
 *   IMAGE_GEN_MODEL                        默认 dall-e-3
 *   IMAGE_GEN_TIMEOUT_MS                   默认 120000
 */
import {
    type GenerateImageRequest,
    type GenerateImageResult,
    type ImageGenProvider,
    UnconfiguredImageGenProvider,
} from "../image-gen-provider.ts";

const DEFAULT_BASE_URL = "https://api.openai.com/v1";
const DEFAULT_MODEL = "dall-e-3";
const DEFAULT_TIMEOUT_MS = 120_000;

export interface OpenAICompatibleImageGenProviderOptions {
    apiKey: string;
    baseUrl?: string;
    model?: string;
    timeoutMs?: number;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
    return value !== null && typeof value === "object" && !Array.isArray(value)
        ? value as Record<string, unknown>
        : undefined;
}

function asString(value: unknown): string {
    return typeof value === "string" ? value : "";
}

function extractUrl(item: unknown): string | undefined {
    const record = asRecord(item);
    if (!record) return undefined;
    const direct = asString(record.url);
    if (direct.startsWith("http://") || direct.startsWith("https://")) return direct;
    const nested = record.image_url;
    if (typeof nested === "string" && (nested.startsWith("http://") || nested.startsWith("https://"))) {
        return nested;
    }
    const nestedUrl = asString(asRecord(nested)?.url);
    if (nestedUrl.startsWith("http://") || nestedUrl.startsWith("https://")) return nestedUrl;
    return undefined;
}

function collectUrls(body: Record<string, unknown>): string[] {
    const buckets = [body.data, body.images, body.output];
    const urls: string[] = [];
    for (const bucket of buckets) {
        if (!Array.isArray(bucket)) continue;
        for (const item of bucket) {
            const url = extractUrl(item);
            if (url) urls.push(url);
        }
    }
    return [...new Set(urls)];
}

export class OpenAICompatibleImageGenProvider implements ImageGenProvider {
    private readonly baseUrl: string;
    private readonly model: string;
    private readonly timeoutMs: number;

    constructor(private readonly options: OpenAICompatibleImageGenProviderOptions) {
        this.baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
        this.model = options.model ?? DEFAULT_MODEL;
        this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    }

    async generate(request: GenerateImageRequest): Promise<GenerateImageResult> {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), this.timeoutMs);
        let response: Response;
        try {
            response = await fetch(`${this.baseUrl}/images/generations`, {
                method: "POST",
                headers: {
                    "content-type": "application/json",
                    authorization: `Bearer ${this.options.apiKey}`,
                },
                signal: controller.signal,
                body: JSON.stringify({
                    model: this.model,
                    prompt: request.prompt,
                    n: 1,
                    size: request.size,
                    response_format: "url",
                }),
            });
        } catch (error) {
            if (controller.signal.aborted) throw new Error("生图 API 请求超时");
            throw new Error(`生图 API 请求失败：${error instanceof Error ? error.message : "未知网络错误"}`);
        } finally {
            clearTimeout(timer);
        }
        const raw = await response.text();
        if (!response.ok) {
            throw new Error(`生图 API 返回 HTTP ${response.status}${raw ? `：${raw.slice(0, 200)}` : ""}`);
        }
        let body: Record<string, unknown>;
        try {
            body = asRecord(JSON.parse(raw)) ?? {};
        } catch {
            throw new Error("生图 API 返回了无法解析的 JSON");
        }
        const urls = collectUrls(body);
        if (urls.length === 0) {
            throw new Error("生图 API 未返回图片 URL（需要 response_format=url，不接受 base64）");
        }
        const first = asRecord(Array.isArray(body.data) ? body.data[0] : undefined);
        const revisedPrompt = asString(first?.revised_prompt) || undefined;
        return { urls, revisedPrompt };
    }
}

export function createDefaultImageGenProvider(): ImageGenProvider {
    const apiKey = process.env.IMAGE_GEN_API_KEY?.trim() || process.env.VISION_API_KEY?.trim();
    if (!apiKey) return new UnconfiguredImageGenProvider();
    const timeoutRaw = process.env.IMAGE_GEN_TIMEOUT_MS;
    const timeoutMs = timeoutRaw ? Number(timeoutRaw) : undefined;
    return new OpenAICompatibleImageGenProvider({
        apiKey,
        baseUrl: process.env.IMAGE_GEN_API_BASE_URL?.trim() || process.env.VISION_API_BASE_URL?.trim() || undefined,
        model: process.env.IMAGE_GEN_MODEL?.trim() || undefined,
        timeoutMs: Number.isFinite(timeoutMs) ? timeoutMs : undefined,
    });
}
