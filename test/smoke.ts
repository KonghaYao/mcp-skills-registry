/**
 * 严格 MCP 2026-07-28 聚合出口 smoke 测试。
 */
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { createMonorepoGateway, createMonorepoRoutes } from "../src/index.ts";
import { skillResourceCache } from "../src/skill-resource-cache.ts";

const CACHE_VERSION_EXTENSION = "io.mcpp/server-cache-version";

function checkCacheVersionCapability(client: Client, path: string): void {
    const capabilities = (client as Client & {
        getServerCapabilities(): { extensions?: Record<string, { cacheVersion?: string }> } | undefined;
    }).getServerCapabilities();
    const cacheVersion = capabilities?.extensions?.[CACHE_VERSION_EXTENSION]?.cacheVersion;
    if (typeof cacheVersion !== "string" || !cacheVersion.startsWith("sha256:")) {
        throw new Error(`${path} 未协商有效的 Server Cache Version`);
    }
}

function createClient(name: string): Client {
    return new Client(
        { name, version: "1" },
        {
            versionNegotiation: { mode: { pin: "2026-07-28" } },
            supportedProtocolVersions: ["2026-07-28"],
        },
    );
}

async function connect(
    url: string,
    fetcher?: (input: string | URL, init?: RequestInit) => Promise<Response>,
): Promise<{ client: Client; transport: StreamableHTTPClientTransport }> {
    const transport = new StreamableHTTPClientTransport(
        new URL(url),
        fetcher ? { fetch: fetcher } : undefined,
    );
    const client = createClient("smoke");
    await client.connect(transport);
    return { client, transport };
}

async function check(
    client: Client,
    path: string,
    expectedCount: number,
    required: string,
    forbidden: string,
    attachment?: { skillName: string; relativePath: string },
): Promise<void> {
    const listed = await client.listResources();
    const skills = listed.resources?.filter(({ uri }) => uri.startsWith("skill://")) ?? [];
    const requiredUri = `skill://${required}/SKILL.md`;
    const forbiddenUri = `skill://${forbidden}/SKILL.md`;
    if (skills.length !== expectedCount) throw new Error(`${path} 期望 ${expectedCount} resources，得到 ${skills.length}`);
    if (!skills.some(({ uri }) => uri === requiredUri)) throw new Error(`${path} 缺少 ${requiredUri}`);
    if (skills.some(({ uri }) => uri === forbiddenUri)) throw new Error(`${path} 混入 ${forbiddenUri}`);
    const read = await client.readResource({ uri: requiredUri });
    if (!(read.contents[0] as { text?: string } | undefined)?.text) throw new Error(`${requiredUri} 内容为空`);

    if (attachment) {
        const attachmentUri = `skill://${attachment.skillName}/${attachment.relativePath}`;
        if (!skills.some(({ uri }) => uri === attachmentUri)) throw new Error(`${path} 缺少附件 ${attachmentUri}`);
        const attachmentRead = await client.readResource({ uri: attachmentUri });
        const content = attachmentRead.contents[0] as { text?: string } | undefined;
        if (!content?.text) throw new Error(`${attachmentUri} 内容为空`);
        console.log(`✓ ${path}: 0728，${skills.length} resources，${required} 与附件 ${attachment.relativePath} 可读`);
        return;
    }
    console.log(`✓ ${path}: 0728，${skills.length} resources，${required} 可读`);
}

async function main(): Promise<void> {
    const gateway = await createMonorepoGateway({ host: "127.0.0.1", port: 0 });
    try {
        const catalogPage = await fetch(gateway.url);
        if (catalogPage.status !== 200) throw new Error(`/ 应为 200，得到 ${catalogPage.status}`);
        if (!catalogPage.headers.get("content-type")?.startsWith("text/html")) {
            throw new Error(`/ 应返回 HTML，得到 ${catalogPage.headers.get("content-type")}`);
        }
        const catalogHtml = await catalogPage.text();
        if (!catalogHtml.includes("MCPP Server Catalog") || !catalogHtml.includes("mcpp/servers/list")) {
            throw new Error(`/ 未返回 Server Catalog 页面`);
        }

        const catalogResponse = await fetch(new URL("/catalog/mcp", gateway.url), {
            method: "POST",
            headers: {
                "content-type": "application/json",
                accept: "application/json, text/event-stream",
                "MCP-Protocol-Version": "2026-07-28",
                "Mcp-Method": "mcpp/servers/list",
            },
            body: JSON.stringify({
                jsonrpc: "2.0",
                id: "catalog-smoke",
                method: "mcpp/servers/list",
                params: {
                    _meta: {
                        "io.modelcontextprotocol/protocolVersion": "2026-07-28",
                        "io.modelcontextprotocol/clientInfo": { name: "smoke", version: "1" },
                        "io.modelcontextprotocol/clientCapabilities": {
                            extensions: { "io.mcpp/server-catalog": {} },
                        },
                    },
                },
            }),
        });
        const catalogBody = await catalogResponse.json() as {
            result?: { servers?: Array<{ id?: string }> };
        };
        const catalogIds = new Set(catalogBody.result?.servers?.map(({ id }) => id) ?? []);
        if (!catalogResponse.ok || !catalogIds.has("openspec") || !catalogIds.has("mattpocock") || !catalogIds.has("dnr") || !catalogIds.has("code-review-expert") || !catalogIds.has("ip-as-logo")) {
            throw new Error(`/catalog/mcp 未列出已挂载的 sub server`);
        }
        console.log("✓ /：Catalog HTML 与 /catalog/mcp 可访问");

        for (const spec of [
            ["/openspec/mcp", 12, "openspec-explore", "tdd", undefined],
            [
                "/mattpocock/mcp", 96, "tdd", "openspec-explore",
                { skillName: "diagnosing-bugs", relativePath: "agents/openai.yaml" },
            ],
            [
                "/dnr/mcp", 19, "dnr-hunt", "openspec-explore",
                { skillName: "dnr-hunt", relativePath: "README.md" },
            ],
            [
                "/code-review-expert/mcp", 7, "code-review-expert", "openspec-explore",
                { skillName: "code-review-expert", relativePath: "agents/agent.yaml" },
            ],
            [
                "/ip-as-logo/mcp", 4, "ip-as-logo", "openspec-explore",
                { skillName: "ip-as-logo", relativePath: "README.md" },
            ],
        ] as const) {
            const { client, transport } = await connect(new URL(spec[0], gateway.url).href);
            try {
                if (transport.sessionId !== undefined) throw new Error("0728 不应返回 session id");
                checkCacheVersionCapability(client, spec[0]);
                const cacheSizeBefore = skillResourceCache.size;
                await check(client, spec[0], spec[1], spec[2], spec[3], spec[4]);
                const cacheSizeAfterFirstRead = skillResourceCache.size;
                await client.listResources();
                await client.readResource({ uri: `skill://${spec[2]}/SKILL.md` });
                if (cacheSizeAfterFirstRead <= cacheSizeBefore || skillResourceCache.size !== cacheSizeAfterFirstRead) {
                    throw new Error(`${spec[0]} 未复用版本化 Response / Resource Content Cache`);
                }
            } finally {
                await client.close();
            }
        }
        const missing = await fetch(new URL("/nope", gateway.url), { method: "POST" });
        if (missing.status !== 404) throw new Error(`/nope 应为 404，得到 ${missing.status}`);
    } finally {
        await gateway.stop();
    }

    const routes = createMonorepoRoutes();
    const workerCatalogPage = await routes.fetch(new Request("http://localhost/"));
    if (workerCatalogPage.status !== 200 || !workerCatalogPage.headers.get("content-type")?.startsWith("text/html")) {
        throw new Error("Worker 形态的 / 应返回 Catalog HTML");
    }
    const fetcher = (input: string | URL, init?: RequestInit) => routes.fetch(
        new Request(typeof input === "string" ? input : input.toString(), init),
    );
    try {
        const { client, transport } = await connect("http://localhost/openspec/mcp", fetcher);
        try {
            if (transport.sessionId !== undefined) throw new Error("Worker 0728 不应返回 session id");
            checkCacheVersionCapability(client, "/openspec/mcp");
            await check(client, "/openspec/mcp", 12, "openspec-explore", "tdd");
            console.log("✓ Worker 形态：mcpp 0.7 严格 0728 handler 与版本化 cache 跨请求可用");
        } finally {
            await client.close();
        }
    } finally {
        await routes.close();
    }
}

await main();
console.log("\n✅ monorepo smoke finished");
