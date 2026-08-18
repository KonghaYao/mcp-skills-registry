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
    },
    {
        id: "mattpocock",
        path: "/mattpocock/mcp",
        createServer: createMattPocockServer,
    },
] as const;
