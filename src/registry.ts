import { createMattPocockServer } from "../servers/mattpocock/server.ts";
import { createOpenspecServer } from "../servers/openspec/server.ts";

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
] as const;
