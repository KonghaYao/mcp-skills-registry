/**
 * image-recognition 子 server 的视觉后端抽象层。
 *
 * 职责边界：协议与传输层（server.ts）只依赖 VisionProvider 接口 —— URL 校验、
 * 图片拉取、大小/类型限制、MCP 工具错误语义都在 server.ts；具体模型后端
 * （Cloudflare Workers AI / OpenAI 兼容 API / Ollama 本地等）后续逐个实现该
 * 接口并注入，不改动 server 结构。
 *
 * analyze_image 的三种模式（describe / ocr / screenshot）在此层只作为透传参数，
 * 各模式的提示词策略与输出约定属于后端实现范畴，后续按模式分别讨论落地。
 */

/** analyze_image 的三种模式。 */
export const ANALYZE_MODES = ["describe", "ocr", "screenshot"] as const;
export type AnalyzeMode = (typeof ANALYZE_MODES)[number];

/** 传给视觉后端的单次分析请求（server.ts 已完成格式与大小校验）。 */
export interface AnalyzeImageRequest {
    /** 已解码的图片字节。 */
    image: Uint8Array;
    /** 图片 MIME 类型（白名单校验后）。 */
    mimeType: string;
    /** 分析模式。 */
    mode: AnalyzeMode;
    /** 用户自定义问题（describe / screenshot 模式下生效）。 */
    prompt?: string;
}

/**
 * 视觉后端接口。实现约定：
 *  - 失败必须抛 Error（server.ts 统一转为 isError: true 的 tool result，模型可自纠）；
 *  - 错误消息不得包含密钥等敏感信息。
 */
export interface VisionProvider {
    analyze(request: AnalyzeImageRequest): Promise<string>;
}

/** 后端未接入时的占位实现：协议链路可完整跑通，调用给出明确提示。 */
export class UnconfiguredVisionProvider implements VisionProvider {
    analyze(_request: AnalyzeImageRequest): Promise<string> {
        return Promise.reject(
            new Error("视觉后端未配置：请注入 VisionProvider（见 servers/image-recognition/vision-provider.ts）。"),
        );
    }
}

/** 测试用假后端：校验链路与工具语义，返回结构化标记文本。 */
export class MockVisionProvider implements VisionProvider {
    async analyze(request: AnalyzeImageRequest): Promise<string> {
        return (
            `[mock:${request.mode}] mime=${request.mimeType} bytes=${request.image.byteLength}` +
            (request.prompt ? ` prompt=${request.prompt}` : "")
        );
    }
}
