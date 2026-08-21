/**
 * mattpocock 子 server —— 把 servers/mattpocock/skills 下的工程与生产力 skills
 * 挂载为 resources，经聚合网关在 /mattpocock/mcp 端点暴露。
 *
 * 来源：mattpocock/skills。目录由根级 install-skills.js 按 skills.lock.json
 * 可复现生成，不提交第三方内容。构建期已用 @peri-code/mcpp 打包全部普通文件
 * （SKILL.md + references/scripts/agents 等附件），运行时无需本地文件系统。
 */
import { createStaticSkillsServerFactory } from "../../src/create-static-skills-server.ts";
import { SKILLS_CACHE_VERSION, STATIC_SKILL_RESOURCES } from "./skills.generated.ts";

export const createMattPocockServer = createStaticSkillsServerFactory({
    name: "mattpocock-skills",
    version: "1.0.0",
    resources: STATIC_SKILL_RESOURCES,
    cacheVersion: SKILLS_CACHE_VERSION,
});
