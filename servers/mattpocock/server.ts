/**
 * mattpocock 子 server —— 把 servers/mattpocock/skills 下的工程与生产力 skills
 * 挂载为 resources，经聚合网关在 /mattpocock/mcp 端点暴露。
 *
 * 来源：mattpocock/skills。目录由根级 install-skills.js 按 skills.lock.json
 * 可复现生成，不提交第三方内容。
 */
import { McpServer } from "@modelcontextprotocol/server";
import { registerStaticSkills } from "../../src/static-skills.ts";
import { skills } from "./skills.generated.ts";

export function createMattPocockServer(): McpServer {
    const server = new McpServer({
        name: "mattpocock-skills",
        version: "1.0.0",
    });

    registerStaticSkills(server, skills);

    return server;
}
