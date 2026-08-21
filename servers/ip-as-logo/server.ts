/**
 * ip-as-logo 子 server —— 把 servers/ip-as-logo/skills 下的 ip-as-logo 技能挂载为
 * resources（MCPP 3.4 通道 B 投影），经聚合网关在 /ip-as-logo/mcp 端点暴露。
 *
 * 来源：s1dashu/ip-as-logo-skill 的单一技能仓库（SKILL.md 位于仓库根）。
 * 本项目作为第三方 skills 集直接投放：任何客户端连上该端点即可发现与读取
 * SKILL.md 及全部附件（assets/）。
 */
import { createStaticSkillsServerFactory } from "../../src/create-static-skills-server.ts";
import { SKILLS_CACHE_VERSION, STATIC_SKILL_RESOURCES } from "./skills.generated.ts";

export const createIpAsLogoServer = createStaticSkillsServerFactory({
    name: "ip-as-logo",
    version: "1.0.0",
    resources: STATIC_SKILL_RESOURCES,
    cacheVersion: SKILLS_CACHE_VERSION,
});
