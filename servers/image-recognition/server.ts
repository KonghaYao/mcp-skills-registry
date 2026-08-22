/**
 * image-recognition 子 server —— 图片识别（视觉分析）MCP 工具。
 *
 * 形态：本项目第一个动态 tool server（其余 sub server 均为静态 skills 投放）。
 * 服务端负责协议与传输：URL 校验（含基本 SSRF 防护）、图片拉取、类型/体积限制、
 * MCP 工具错误语义；视觉分析委托给注入的 VisionProvider（后端抽象见
 * vision-provider.ts，具体模型后端后续逐个实现）。
 *
 * 经聚合网关在 /image-recognition/mcp 端点暴露，本地 / Worker / 测试共用
 * src/registry.ts 挂载表。
 */
import { McpServer } from "@modelcontextprotocol/server";
import { createMcppServerFactory } from "@peri-code/mcpp";
import { z } from "zod";
import {
    ANALYZE_MODES,
    type AnalyzeImageRequest,
    type VisionProvider,
} from "./vision-provider.ts";
import { createDefaultVisionProvider } from "./providers/openai-compatible.ts";

const SERVER_NAME = "image-recognition";
const SERVER_VERSION = "1.0.0";

/** 图片体积上限（10 MiB），避免内存与模型输入失控。 */
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
/** 图片拉取超时。 */
const FETCH_TIMEOUT_MS = 15_000;
/** 允许的图片 MIME 白名单。 */
const ALLOWED_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

export interface ImageRecognitionServerOptions {
    /**
     * 视觉后端；缺省按执行环境构造（存在 VISION_API_KEY 时使用 OpenAI 兼容
     * 后端，否则为 UnconfiguredVisionProvider，见 providers/openai-compatible.ts）。
     */
    provider?: VisionProvider;
    /** 允许访问内网/环回地址（默认 false）。内网图片服务部署与本地测试时开启。 */
    allowPrivateNetworks?: boolean;
}

/** 由 fetch 响应读取受限图片：类型白名单 + 体积上限（流式读取并截断）。 */
async function readImage(response: Response): Promise<{ image: Uint8Array; mimeType: string }> {
    const mimeType = (response.headers.get("content-type") ?? "").split(";")[0]?.trim().toLowerCase() ?? "";
    if (!ALLOWED_MIME_TYPES.has(mimeType)) {
        throw new Error(`不支持的图片类型：${mimeType || "（未知，仅支持 image/jpeg|png|webp|gif）"}`);
    }
    const contentLength = Number(response.headers.get("content-length"));
    if (Number.isFinite(contentLength) && contentLength > MAX_IMAGE_BYTES) {
        throw new Error(`图片超过 ${MAX_IMAGE_BYTES} 字节上限`);
    }
    const reader = response.body?.getReader();
    if (!reader) throw new Error("无法读取图片响应体");
    const chunks: Uint8Array[] = [];
    let total = 0;
    for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > MAX_IMAGE_BYTES) {
            await reader.cancel();
            throw new Error(`图片超过 ${MAX_IMAGE_BYTES} 字节上限`);
        }
        chunks.push(value);
    }
    const image = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
        image.set(chunk, offset);
        offset += chunk.byteLength;
    }
    return { image, mimeType };
}

/**
 * 基本 SSRF 防护：拒绝 IP 字面量的内网/环回/保留段与 localhost 主机名。
 * Cloudflare Worker 出站请求天然到不了私网，此处主要防护 Bun/Docker 本机形态。
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
        // 10.x / 192.168.x / 172.16-31.x / 127.x / 169.254.x / 0.x
        if (a === 10 || a === 127 || a === 0) return true;
        if (a === 169 && b === 254) return true;
        if (a === 192 && b === 168) return true;
        if (a === 172 && b !== undefined && b >= 16 && b <= 31) return true;
    }
    return false;
}

/** 统一工具错误返回（isError: true，模型可据此自纠）。 */
function toolError(message: string) {
    return { content: [{ type: "text" as const, text: message }], isError: true };
}

const ANALYZE_IMAGE_INPUT_SCHEMA = z.object({
    url: z.url({ message: "url 必须是合法的 http(s) 图片地址" }),
    mode: z.enum(ANALYZE_MODES).default("describe"),
    prompt: z.string().max(2000).optional(),
});

/**
 * 工具级 outputSchema：声明本工具能够输出结构化数据（structuredContent）。
 * 结构化数据由后端 provider 实际计算，本层只透传：
 *  - text：自由文本结果（主输出，后端返回原文）；
 *  - structured：可选的机器可读补充字段（后端提供时填充，缺失不影响）。
 */
const ANALYZE_IMAGE_OUTPUT_SCHEMA = z.object({
    text: z.string(),
    structured: z.unknown().optional(),
});

export function createImageRecognitionServer(options: ImageRecognitionServerOptions = {}) {
    const provider = options.provider ?? createDefaultVisionProvider();
    const allowPrivateNetworks = options.allowPrivateNetworks === true;    return createMcppServerFactory(
        {
            // 动态内容：不启用 MCPP Response Cache 写入（ttlMs = 0）。
            cacheVersion: "image-recognition@1.0.0",
            ttlMs: 0,
            scope: "public",
        },
        (_request, mcpp) => {
            const server = new McpServer(
                { name: SERVER_NAME, version: SERVER_VERSION },
                { capabilities: mcpp.capabilities },
            );

            server.registerTool<typeof ANALYZE_IMAGE_OUTPUT_SCHEMA, typeof ANALYZE_IMAGE_INPUT_SCHEMA>(
                "analyze_image",
                {
                    title: "Analyze Image",
                    description:
                        "分析一张图片。url 必须是可公开访问的 http(s) 图片地址（jpeg/png/webp/gif，≤10MiB）；" +
                        "本地图片请先由客户端托管为 URL 再传入（MCP 协议当前无文件上传通道）。" +
                        "mode：describe 描述图片内容或回答 prompt 提问（默认）；ocr 纯文本提取图中文字；" +
                        "screenshot 综合分析 UI 截图（布局结构、页面元素、交互与可用性建议）。" +
                        "prompt 请使用英文（English），三个模式通用。" +
                        "输出以自由文本为主；本工具声明 outputSchema，可同时输出结构化数据：" +
                        "structuredContent.text 为自由文本镜像，structured 为机器可读补充字段" +
                        "（如 ocr 的 confidence 等，由后端提供，可能缺失）。",
                    inputSchema: ANALYZE_IMAGE_INPUT_SCHEMA,
                },
                async ({ url, mode, prompt }) => {
                    if (!allowPrivateNetworks && isBlockedUrl(url)) {
                        return toolError("拒绝访问该地址：仅允许公网 http(s) 图片 URL");
                    }
                    let response: Response;
                    const controller = new AbortController();
                    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
                    try {
                        response = await fetch(url, { signal: controller.signal, redirect: "follow" });
                    } catch (error) {
                        return toolError(`图片拉取失败：${error instanceof Error ? error.message : "未知网络错误"}`);
                    } finally {
                        clearTimeout(timer);
                    }
                    if (!response.ok) {
                        return toolError(`图片拉取失败：HTTP ${response.status}`);
                    }
                    try {
                        const { image, mimeType } = await readImage(response);
                        const text = await provider.analyze({ image, mimeType, mode, prompt } satisfies AnalyzeImageRequest);
                        // 自由文本为主输出；structuredContent.text 为机器可读镜像（outputSchema 声明）。
                        return { content: [{ type: "text", text }], structuredContent: { text } };
                    } catch (error) {
                        return toolError(error instanceof Error ? error.message : "分析失败：未知错误");
                    }
                },
            );

            return server;
        },
    );
}

/**
 * 默认单例（registry 挂载用）：与静态 skills server 一致，模块加载时即创建
 * factory 单例；测试与自定义部署请用 createImageRecognitionServer() 注入 provider。
 */
export const imageRecognitionServer = createImageRecognitionServer();
