/**
 * dnr 子 server —— 把 servers/dnr/skills 下的防御性代码安全技能挂载为 resources
 * （MCPP 3.4 通道 B 投影），经聚合网关在 /dnr/mcp 端点暴露。
 *
 * 来源：anthropics/defending-code-reference-harness 的 .claude/skills 集合。
 * 本项目作为第三方 skills 集直接投放：任何客户端连上该端点即可发现与读取
 * SKILL.md 及附件。注意：这些 skill 在执行时依赖仓库中的 _lib/harness 等
 * 外部文件，本同步仅携带 skill 目录本身，故更适合作为方法论文档消费。
 */
import { createStaticSkillsServerFactory } from "../../src/create-static-skills-server.ts";
import { SKILLS_CACHE_VERSION, STATIC_SKILL_RESOURCES } from "./skills.generated.ts";

export const createDnrServer = createStaticSkillsServerFactory({
    name: "dnr",
    version: "1.0.0",
    resources: STATIC_SKILL_RESOURCES,
    cacheVersion: SKILLS_CACHE_VERSION,
});
