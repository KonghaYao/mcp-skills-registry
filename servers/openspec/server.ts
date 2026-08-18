/**
 * openspec 子 server —— 把 servers/openspec/skills 下的 OpenSpec skills 挂载为 resources
 * （MCPP 3.4 通道 B 投影），经聚合网关在 /openspec/mcp 端点暴露。
 *
 * 来源：Fission-AI/OpenSpec 的 skills 集合。本项目作为第三方 skills 集
 * 直接投放：任何客户端连上该端点即可发现与读取 SKILL.md。
 */
import { McpServer } from "@modelcontextprotocol/server";
import { registerStaticSkills } from "../../src/static-skills.ts";
import { skills } from "./skills.generated.ts";

export function createOpenspecServer(): McpServer {
    const server = new McpServer({
        name: "openspec",
        version: "1.0.0",
    });

    registerStaticSkills(server, skills);

    return server;
}
