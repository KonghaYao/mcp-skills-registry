#!/usr/bin/env bash
set -euo pipefail

DEFAULT_BASE_URL="https://peri-mcpp-gateway.claude-code-best.workers.dev"
BASE_URL="${1:-${MCP_BASE_URL:-$DEFAULT_BASE_URL}}"
BASE_URL="${BASE_URL%/}"

printf '测试线上 MCP 2026-07-28 服务：%s\n' "$BASE_URL"

MCP_BASE_URL="$BASE_URL" bun - <<'TS'
import {
    Client,
    StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";

const baseUrl = process.env.MCP_BASE_URL;
if (!baseUrl) throw new Error("缺少 MCP_BASE_URL");

async function check(path: string, expected: number, required: string, forbidden: string) {
    const transport = new StreamableHTTPClientTransport(new URL(baseUrl + path));
    const client = new Client(
        { name: "online-smoke", version: "1" },
        {
            versionNegotiation: { mode: { pin: "2026-07-28" } },
            supportedProtocolVersions: ["2026-07-28"],
        },
    );
    const started = performance.now();
    try {
        await client.connect(transport);
        const connected = performance.now();
        if (transport.sessionId !== undefined) throw new Error(`${path} 不应返回 session id`);

        const listed = await client.listResources();
        const skills = (listed.resources ?? []).filter(({ uri }) => uri.startsWith("skill://"));
        const requiredUri = `skill://${required}/SKILL.md`;
        const forbiddenUri = `skill://${forbidden}/SKILL.md`;
        if (skills.length !== expected) throw new Error(`${path} 期望 ${expected} skills，实际 ${skills.length}`);
        if (!skills.some(({ uri }) => uri === requiredUri)) throw new Error(`${path} 缺少 ${requiredUri}`);
        if (skills.some(({ uri }) => uri === forbiddenUri)) throw new Error(`${path} 混入 ${forbiddenUri}`);

        const read = await client.readResource({ uri: requiredUri });
        if (!(read.contents[0] as { text?: string } | undefined)?.text) throw new Error(`${requiredUri} 内容为空`);
        console.log(
            `✓ ${path}: 0728，${skills.length} skills，${required} 可读` +
            `（连接 ${Math.round(connected - started)} ms，总计 ${Math.round(performance.now() - started)} ms）`,
        );
    } finally {
        await client.close().catch(() => undefined);
    }
}

await check("/openspec/mcp", 12, "openspec-explore", "tdd");
await check("/mattpocock/mcp", 35, "tdd", "openspec-explore");

const missing = await fetch(baseUrl + "/nope", {
    method: "POST",
    signal: AbortSignal.timeout(15_000),
});
if (missing.status !== 404) throw new Error(`/nope 期望 404，实际 ${missing.status}`);
console.log("✓ /nope: HTTP 404");
console.log("\n线上 MCP smoke 测试通过");
TS
