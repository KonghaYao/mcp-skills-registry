/**
 * 聚合出口冒烟验证（MCPP 3.7）：单一 HTTP 出口下，/openspec/mcp 和
 * /mattpocock/mcp 是相互隔离的 MCP 端点，可被官方 client 连接并协商 skills 能力。
 *
 * 运行：bun test/smoke.ts
 */
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { createMonorepoGateway, createMonorepoRoutes } from "../src/index.ts";

async function connect(url: string): Promise<{ client: Client; close: () => Promise<void> }> {
    const transport = new StreamableHTTPClientTransport(new URL(url));
    const client = new Client({ name: "smoke", version: "1" });
    await client.connect(transport);
    return { client, close: () => client.close() };
}

async function main(): Promise<void> {
    const gw = await createMonorepoGateway({ host: "127.0.0.1", port: 0 });

    try {
        // 端点：/openspec/mcp —— 第三方 OpenSpec skills 集（12 个 openspec-*）
        const osp = await connect(gw.url + "openspec/mcp");
        try {
            const res = await osp.client.listResources();
            const skills = res.resources?.filter((r) => r.uri.startsWith("skill://")) ?? [];
            if (skills.length !== 12) {
                throw new Error(`/openspec/mcp 应投影到 12 个 skill，得到 ${skills.length}`);
            }
            const doc = await osp.client.readResource({
                uri: "skill://openspec-explore/SKILL.md",
            });
            const text = (doc.contents?.[0] as { text?: string } | undefined)?.text ?? "";
            if (!text.includes("openspec-explore")) {
                throw new Error("SKILL.md 内容读取失败");
            }
            if (skills.some((r) => r.uri === "skill://tdd/SKILL.md")) {
                throw new Error("/openspec/mcp 不应混入 Matt Pocock skills");
            }
            console.log(`✓ /openspec/mcp：独立取得 openspec skills（skills: ${skills.length}，SKILL.md 可读）`);
        } finally {
            await osp.close();
        }

        // 端点：/mattpocock/mcp —— Matt Pocock 工程与生产力 skills 集
        const matt = await connect(gw.url + "mattpocock/mcp");
        try {
            const res = await matt.client.listResources();
            const skills = res.resources?.filter((r) => r.uri.startsWith("skill://")) ?? [];
            if (skills.length !== 35) {
                throw new Error(`/mattpocock/mcp 应投影到 35 个 skill，得到 ${skills.length}`);
            }
            const doc = await matt.client.readResource({
                uri: "skill://tdd/SKILL.md",
            });
            const text = (doc.contents?.[0] as { text?: string } | undefined)?.text ?? "";
            if (!text.includes("tdd")) {
                throw new Error("Matt Pocock tdd SKILL.md 内容读取失败");
            }
            if (skills.some((r) => r.uri === "skill://openspec-explore/SKILL.md")) {
                throw new Error("/mattpocock/mcp 不应混入 OpenSpec skills");
            }
            console.log(`✓ /mattpocock/mcp：独立取得 Matt Pocock skills（skills: ${skills.length}，SKILL.md 可读）`);
        } finally {
            await matt.close();
        }

        // 多会话：同一端点第二个客户端应能独立初始化（每会话独立 transport + server）
        const osp2 = await connect(gw.url + "openspec/mcp");
        try {
            const res = await osp2.client.listResources();
            const skills = res.resources?.filter((r) => r.uri.startsWith("skill://")) ?? [];
            if (skills.length !== 12) {
                throw new Error("第二会话连接后能力不可用");
            }
            console.log("✓ 多会话：同一端点第二个客户端可独立初始化");
        } finally {
            await osp2.close();
        }

        // 未匹配路径 → 404（挂载表必须可审计）
        const miss = await fetch(gw.url + "nope", { method: "POST" });
        console.log(`✓ 未匹配路径 POST /nope → ${miss.status}`);
        if (miss.status !== 404) throw new Error("未匹配路径应 404");
    } finally {
        await gw.stop();
    }

    // Worker 形态：不经 Bun.serve，直接调纯 fetch handler（Cloudflare 部署路径）
    const routes = createMonorepoRoutes();
    try {
        const res = await routes.fetch(
            new Request("http://localhost/openspec/mcp", {
                method: "POST",
                headers: {
                    "content-type": "application/json",
                    accept: "application/json, text/event-stream",
                },
                body: JSON.stringify({
                    jsonrpc: "2.0",
                    id: 1,
                    method: "initialize",
                    params: {
                        protocolVersion: "2026-07-28",
                        capabilities: {},
                        clientInfo: { name: "worker-smoke", version: "1" },
                    },
                }),
            }),
        );
        if (res.status !== 200) throw new Error(`纯 handler initialize 应 200，得到 ${res.status}`);
        if (!res.headers.get("mcp-session-id")) throw new Error("initialize 应返回 mcp-session-id");
        await res.text();
        const miss2 = await routes.fetch(new Request("http://localhost/nope"));
        if (miss2.status !== 404) throw new Error("纯 handler 未匹配路径应 404");
        console.log("✓ Worker 形态：纯 fetch handler 可初始化端点（无监听进程依赖）");
    } finally {
        await routes.close();
    }
}

await main();
console.log("\n✅ monorepo smoke finished");
process.exit(0);