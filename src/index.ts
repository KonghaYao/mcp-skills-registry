/**
 * monorepo 聚合 server —— MCPP 3.7：单一 HTTP 出口，路径路由到子 server。
 *
 *   /                  → Server Catalog HTML 页面
 *   /catalog/mcp       → 只读 Server Catalog MCP endpoint
 *   /openspec/mcp      → openspec 子 server（第三方 OpenSpec skills 集）
 *   /mattpocock/mcp    → mattpocock 子 server（工程与生产力 skills 集）
 *   /dnr/mcp           → dnr 子 server（防御性代码安全 skills 集）
 *   /code-review-expert/mcp → code-review-expert 子 server（代码审查技能）
 *   /ip-as-logo/mcp    → ip-as-logo 子 server（IP 生成头像 Logo 技能）
 *   /deep-research/mcp → deep-research 子 server（Deep Research 工作流 skills）
 *   /image-recognition/mcp → image-recognition 子 server（图片识别工具）
 *   /web/mcp           → web 子 server（web_search / web_fetch）
 *
 * 形态要点：
 *   - 一个进程、一个端口，是所有子 server 唯一的入口（顶层挂载多个 MCP server）
 *   - 每个路径是独立的 MCP endpoint / origin：客户端按 URL 连接，各自独立协商
 *   - stdio 不适用该形态（stdio 无 URL/路径概念，3.7 约束）
 *
 * 运行：bun src/index.ts            → 监听 http://127.0.0.1:8787/
 *        bun test/smoke.ts          → 官方 client 连接端点验证
 */
import {
    createCatalogPageHandler,
    createGateway,
    createGatewayRoutes,
    type GatewayHandle,
    type GatewayRoutesHandle,
} from "@peri-code/mcpp";
import { SERVER_REGISTRY } from "./registry.ts";

/** 挂载表：/xxx/mcp → xxx 子 server（3.7：路径即路由，唯一 HTTP 出口）。 */
export const MONOREPO_ROUTES = SERVER_REGISTRY;

export interface MonorepoOptions {
    host?: string;
    port?: number;
}

const GATEWAY_OPTIONS = {
    catalog: {
        path: "/catalog/mcp",
        name: "mcp-skills-registry-catalog",
        version: "1.0.0",
    },
    fallback: createCatalogPageHandler(),
};

/**
 * 纯请求分发（无监听进程）：Cloudflare Workers / 边缘运行时部署用。
 * 根路径提供 Catalog 页面，/catalog/mcp 提供页面使用的只读目录端点。
 */
export function createMonorepoRoutes(): GatewayRoutesHandle {
    return createGatewayRoutes([...MONOREPO_ROUTES], GATEWAY_OPTIONS);
}

/**
 * 聚合网关（本机形态）：挂载表即路由表（子 server 各自独立实例，monorepo 隔离）。
 * skills 目录通过各子 server 的 ResourceForSkills 投影，在对应 MCP 端点下可见。
 */
export function createMonorepoGateway(
    options: MonorepoOptions = {},
): Promise<GatewayHandle> {
    return createGateway([...MONOREPO_ROUTES], {
        host: options.host ?? process.env.HOST ?? "127.0.0.1",
        port: options.port ?? Number(process.env.PORT ?? 8787),
        ...GATEWAY_OPTIONS,
    });
}

if (import.meta.main) {
    const gw = await createMonorepoGateway();
    console.log(`monorepo gateway listening: ${gw.url}`); // → http://127.0.0.1:8787/
    console.log(`routes: ${gw.endpoints.map((endpoint) => endpoint.path).join(", ")}`);
    console.log(`catalog page: ${gw.url}/`);
}
