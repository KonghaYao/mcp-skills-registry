/**
 * mattpocock 子 server —— 把 servers/mattpocock/skills 下的工程与生产力 skills
 * 挂载为 resources，经聚合网关在 /mattpocock/mcp 端点暴露。
 *
 * 来源：mattpocock/skills。目录由根级 install-skills.js 按 skills.lock.json
 * 可复现生成，不提交第三方内容。构建期已用 @peri-code/mcpp 打包全部普通文件
 * （SKILL.md + references/scripts/agents 等附件），运行时无需本地文件系统。
 */
import { McpServer } from "@modelcontextprotocol/server";
import { ResourceForStaticSkills } from "@peri-code/mcpp/skills/static";
import { skillResourceCache } from "../../src/skill-resource-cache.ts";
import { STATIC_SKILL_RESOURCES } from "./skills.generated.ts";

export function createMattPocockServer(): McpServer {
    const server = new McpServer({
        name: "mattpocock-skills",
        version: "1.0.0",
    });

    ResourceForStaticSkills(server, {
        resources: STATIC_SKILL_RESOURCES,
        cache: skillResourceCache,
        origin: "mattpocock-skills",
        cacheScope: "public",
        ttlMs: 30_000,
    });

    return server;
}
