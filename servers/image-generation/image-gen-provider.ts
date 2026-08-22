/**
 * image-generation 子 server 的生图后端抽象。
 *
 * 协议层只做 prompt 校验与 MCP 错误语义；生图全部外置。
 * 约定：后端必须返回可公开访问的图片 URL，服务端不接收、不转发 base64。
 */

export const IMAGE_SIZES = ["1024x1024", "1792x1024", "1024x1792"] as const;
export type ImageSize = (typeof IMAGE_SIZES)[number];

export interface GenerateImageRequest {
    prompt: string;
    size: ImageSize;
}

export interface GenerateImageResult {
    urls: string[];
    revisedPrompt?: string;
}

export interface ImageGenProvider {
    generate(request: GenerateImageRequest): Promise<GenerateImageResult>;
}

export class UnconfiguredImageGenProvider implements ImageGenProvider {
    generate(_request: GenerateImageRequest): Promise<GenerateImageResult> {
        return Promise.reject(
            new Error("生图后端未配置：请设置 IMAGE_GEN_API_KEY（或复用 VISION_API_KEY）并注入 ImageGenProvider。"),
        );
    }
}

export class MockImageGenProvider implements ImageGenProvider {
    async generate(request: GenerateImageRequest): Promise<GenerateImageResult> {
        return {
            urls: [`https://example.com/generated.png?size=${request.size}`],
            revisedPrompt: `[mock] ${request.prompt}`,
        };
    }
}
