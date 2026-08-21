/**
 * code-review-expert 子 server —— 把 servers/code-review-expert/skills 下的
 * code-review-expert 技能挂载为 resources（MCPP 3.4 通道 B 投影），经聚合网关
 * 在 /code-review-expert/mcp 端点暴露。
 *
 * 来源：sanyuan0704/sanyuan-skills 的 skills 集合（仅选择 code-review-expert）。
 * 本项目作为第三方 skills 集直接投放：任何客户端连上该端点即可发现与读取
 * SKILL.md 及全部附件。
 */
import { createStaticSkillsServerFactory } from "../../src/create-static-skills-server.ts";
import { SKILLS_CACHE_VERSION, STATIC_SKILL_RESOURCES } from "./skills.generated.ts";

export const createCodeReviewExpertServer = createStaticSkillsServerFactory({
    name: "code-review-expert",
    version: "1.0.0",
    resources: STATIC_SKILL_RESOURCES,
    cacheVersion: SKILLS_CACHE_VERSION,
});
