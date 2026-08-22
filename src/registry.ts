import { createMattPocockServer } from "../servers/mattpocock/server.ts";
import { createOpenspecServer } from "../servers/openspec/server.ts";
import { createDnrServer } from "../servers/dnr/server.ts";
import { createCodeReviewExpertServer } from "../servers/code-review-expert/server.ts";
import { createIpAsLogoServer } from "../servers/ip-as-logo/server.ts";
import { imageRecognitionServer } from "../servers/image-recognition/server.ts";

/**
 * 聚合出口的唯一 sub server 注册表。
 * 本地 HTTP server、Cloudflare Worker 和测试必须共用该表，避免路由漂移。
 */
export const SERVER_REGISTRY = [
    {
        id: "openspec",
        path: "/openspec/mcp",
        createServer: createOpenspecServer,
        catalog: {
            id: "openspec",
            title: "OpenSpec Skills",
            description: "OpenSpec workflows for exploring, proposing, applying, and verifying changes.",
            version: "1.0.0",
            tags: ["specification", "workflow"],
            capabilities: ["resources", "skills"],
            auth: { required: false },
        },
    },
    {
        id: "mattpocock",
        path: "/mattpocock/mcp",
        createServer: createMattPocockServer,
        catalog: {
            id: "mattpocock",
            title: "Matt Pocock Skills",
            description: "Engineering and productivity skills curated by Matt Pocock.",
            version: "1.0.0",
            tags: ["engineering", "productivity"],
            capabilities: ["resources", "skills"],
            auth: { required: false },
        },
    },
    {
        id: "dnr",
        path: "/dnr/mcp",
        createServer: createDnrServer,
        catalog: {
            id: "dnr",
            title: "DNR Security Skills",
            description: "Defensive code security workflow skills from the defending-code-reference-harness.",
            version: "1.0.0",
            tags: ["security", "vulnerability", "analysis"],
            capabilities: ["resources", "skills"],
            auth: { required: false },
        },
    },
    {
        id: "code-review-expert",
        path: "/code-review-expert/mcp",
        createServer: createCodeReviewExpertServer,
        catalog: {
            id: "code-review-expert",
            title: "Code Review Expert",
            description: "Expert code review of current git changes with a senior engineer lens, from sanyuan0704/sanyuan-skills.",
            version: "1.0.0",
            tags: ["code-review", "engineering"],
            capabilities: ["resources", "skills"],
            auth: { required: false },
        },
    },
    {
        id: "ip-as-logo",
        path: "/ip-as-logo/mcp",
        createServer: createIpAsLogoServer,
        catalog: {
            id: "ip-as-logo",
            title: "IP as Logo",
            description: "Generate user avatar logos from IP addresses, from s1dashu/ip-as-logo-skill.",
            version: "1.0.0",
            tags: ["design", "logo", "creative"],
            capabilities: ["resources", "skills"],
            auth: { required: false },
        },
    },
    {
        id: "image-recognition",
        path: "/image-recognition/mcp",
        createServer: imageRecognitionServer,
        catalog: {
            id: "image-recognition",
            title: "Image Recognition",
            description: "Vision analysis of images by URL: describe, OCR, and UI screenshot analysis.",
            version: "1.0.0",
            tags: ["vision", "image", "ocr"],
            capabilities: ["tools"],
            auth: { required: false },
        },
    },
] as const;
