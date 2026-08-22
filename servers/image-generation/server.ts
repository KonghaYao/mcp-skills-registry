/**
 * image-generation 子 server —— 文生图 MCP 工具。
 *
 * 服务端零计算：prompt 校验后转给 ImageGenProvider；只把上游返回的公网 URL
 * 交给客户端，不下载、不转存、不回传 base64。
 *
 * 经聚合网关在 /image-generation/mcp 端点暴露。
 */
import { McpServer } from "@modelcontextprotocol/server";
import { createMcppServerFactory } from "@peri-code/mcpp";
import { z } from "zod";
import { IMAGE_SIZES, type ImageGenProvider } from "./image-gen-provider.ts";
import { createDefaultImageGenProvider } from "./providers/openai-compatible.ts";

const SERVER_NAME = "image-generation";
const SERVER_VERSION = "1.0.0";

export interface ImageGenerationServerOptions {
    provider?: ImageGenProvider;
}

function toolError(message: string) {
    return { content: [{ type: "text" as const, text: message }], isError: true };
}

const GENERATE_IMAGE_INPUT_SCHEMA = z.object({
    prompt: z.string().min(1).max(4000),
    size: z.enum(IMAGE_SIZES).default("1024x1024"),
});

export function createImageGenerationServer(options: ImageGenerationServerOptions = {}) {
    const provider = options.provider ?? createDefaultImageGenProvider();

    return createMcppServerFactory(
        {
            cacheVersion: "image-generation@1.0.0",
            ttlMs: 0,
            scope: "public",
        },
        (_request, mcpp) => {
            const server = new McpServer(
                { name: SERVER_NAME, version: SERVER_VERSION },
                { capabilities: mcpp.capabilities },
            );

            server.registerTool(
                "generate_image",
                {
                    title: "Generate Image",
                    description:
                        "Generate an image from a text prompt via an upstream image API. " +
                        "Returns publicly fetchable http(s) image URL(s), not image bytes. " +
                        "size: 1024x1024 (default), 1792x1024, or 1024x1792. " +
                        "The client should present the URL; do not expect inline binary.",
                    inputSchema: GENERATE_IMAGE_INPUT_SCHEMA,
                },
                async ({ prompt, size }) => {
                    try {
                        const result = await provider.generate({ prompt, size });
                        const text = result.urls.join("\n");
                        return {
                            content: [{ type: "text" as const, text }],
                            structuredContent: {
                                urls: result.urls,
                                revised_prompt: result.revisedPrompt ?? null,
                            },
                        };
                    } catch (error) {
                        return toolError(error instanceof Error ? error.message : "生图失败：未知错误");
                    }
                },
            );

            return server;
        },
    );
}

export const imageGenerationServer = createImageGenerationServer();
