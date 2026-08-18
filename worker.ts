/**
 * Cloudflare Workers 部署入口 —— monorepo 聚合出口的 serverless 形态。
 *
 * 与本地 createMonorepoGateway 共用同一挂载表（MONOREPO_ROUTES）：
 *   /                  Server Catalog HTML 页面。
 *   /catalog/mcp       只读 Server Catalog MCP endpoint。
 *   /openspec/mcp      独立 MCP endpoint。
 *   /mattpocock/mcp    独立 MCP endpoint。
 *
 * 部署：
 *   bunx wrangler dev        # 本地预览（http://127.0.0.1:8787）
 *   bunx wrangler deploy     # 发布
 *
 * `@peri-code/mcpp` 0.2 的 gateway 使用严格 0728 无状态 handler：每个请求创建
 * 独立 server，不依赖 isolate 内存 session，也不需要 Durable Objects。
 */
import { createMonorepoRoutes } from "./src/index.ts";

const gateway = createMonorepoRoutes();

export default {
    fetch: gateway.fetch,
};
