/**
 * OpenAI 兼容视觉后端（第一个真实 VisionProvider 实现）。
 *
 * 遵照 OpenAI 图片协议传输：POST {baseUrl}/chat/completions，
 * 图片以 data URI（base64）经 image_url 传入，返回自由文本。
 *
 * 执行环境变量配置（全部可选读取，缺省有默认值）：
 *   VISION_API_KEY         必填（无则后端视为未配置）
 *   VISION_API_BASE_URL    默认 https://api.openai.com/v1
 *   VISION_MODEL           默认 gpt-4o-mini（本例实测 grok-4.6）
 *   VISION_API_TIMEOUT_MS  默认 120000（模型推理可能较长，勿用过小值）
 *
 * 模式提示词策略（英文，遵循 analyze_image 契约）：
 *   describe    描述内容 / 回答 prompt 提问
 *   ocr         纯文本逐字提取，保留换行与阅读顺序
 *   screenshot  综合分析：布局结构 + 页面元素 + 交互/可用性建议
 */
import { Buffer } from "node:buffer";
import {
    type AnalyzeImageRequest,
    type AnalyzeMode,
    UnconfiguredVisionProvider,
    type VisionProvider,
} from "../vision-provider.ts";

const DEFAULT_BASE_URL = "https://api.openai.com/v1";
const DEFAULT_MODEL = "gpt-4o-mini";
const DEFAULT_TIMEOUT_MS = 120_000;

/** 每个模式的 system prompt（英文；模式策略属于后端域）。 */
const MODE_SYSTEM_PROMPTS: Record<AnalyzeMode, string> = {
    describe:
        "You are an image analysis assistant. Describe the image clearly and answer questions about it. Follow the user's prompt exactly when provided.",
    ocr: "You are an OCR engine. Extract all visible text verbatim, preserving line breaks and reading order. Output only the extracted text.",
    screenshot:
        "You are a UI screenshot analyst. Describe the layout structure, list the visible elements with their purpose, and give interaction/usability suggestions. Be concise but complete.",
};

/** prompt 缺省时各模式的默认指令。 */
const MODE_DEFAULT_PROMPTS: Record<AnalyzeMode, string> = {
    describe: "Describe this image in detail.",
    ocr: "Extract all text from this image.",
    screenshot: "Analyze this UI screenshot.",
};

export interface OpenAICompatibleVisionProviderOptions {
    apiKey: string;
    /** OpenAI 兼容端点基址，如 https://cc.zhixiaapi.xyz/v1；默认 https://api.openai.com/v1。 */
    baseUrl?: string;
    /** 视觉模型名；默认 gpt-4o-mini。 */
    model?: string;
    /** 单次视觉 API 调用超时（毫秒）；默认 120000。 */
    timeoutMs?: number;
}

export class OpenAICompatibleVisionProvider implements VisionProvider {
    private readonly baseUrl: string;
    private readonly model: string;
    private readonly timeoutMs: number;

    constructor(private readonly options: OpenAICompatibleVisionProviderOptions) {
        this.baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
        this.model = options.model ?? DEFAULT_MODEL;
        this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    }

    async analyze(request: AnalyzeImageRequest): Promise<string> {
        const dataUri = `data:${request.mimeType};base64,${Buffer.from(request.image).toString("base64")}`;
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), this.timeoutMs);
        let response: Response;
        try {
            response = await fetch(`${this.baseUrl}/chat/completions`, {
                method: "POST",
                headers: {
                    "content-type": "application/json",
                    authorization: `Bearer ${this.options.apiKey}`,
                },
                signal: controller.signal,
                body: JSON.stringify({
                    model: this.model,
                    messages: [
                        { role: "system", content: MODE_SYSTEM_PROMPTS[request.mode] },
                        {
                            role: "user",
                            content: [
                                { type: "text", text: request.prompt ?? MODE_DEFAULT_PROMPTS[request.mode] },
                                { type: "image_url", image_url: { url: dataUri } },
                            ],
                        },
                    ],
                }),
            });
        } catch (error) {
            if (controller.signal.aborted) throw new Error("视觉 API 请求超时");
            throw new Error(`视觉 API 请求失败：${error instanceof Error ? error.message : "未知网络错误"}`);
        } finally {
            clearTimeout(timer);
        }
        if (!response.ok) {
            const detail = await response.text().catch(() => "");
            throw new Error(`视觉 API 返回 HTTP ${response.status}${detail ? `：${detail.slice(0, 200)}` : ""}`);
        }
        const body = (await response.json()) as { choices?: { message?: { content?: string } }[] };
        const text = body.choices?.[0]?.message?.content?.trim();
        if (!text) throw new Error("视觉 API 未返回文本内容");
        return text;
    }
}

/**
 * 从执行环境变量构造默认后端：存在 VISION_API_KEY 时使用 OpenAI 兼容协议，
 * 否则返回 UnconfiguredVisionProvider（调用时报"视觉后端未配置"）。
 */
export function createDefaultVisionProvider(): VisionProvider {
    const apiKey = process.env.VISION_API_KEY?.trim();
    if (!apiKey) return new UnconfiguredVisionProvider();
    return new OpenAICompatibleVisionProvider({
        apiKey,
        baseUrl: process.env.VISION_API_BASE_URL?.trim() || undefined,
        model: process.env.VISION_MODEL?.trim() || undefined,
        timeoutMs: process.env.VISION_API_TIMEOUT_MS ? Number(process.env.VISION_API_TIMEOUT_MS) : undefined,
    });
}
