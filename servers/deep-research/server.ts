/**
 * deep-research 子 server —— 把 servers/deep-research/skills 下的 Deep Research
 * 工作流 skills 挂载为 resources（MCPP 3.4 通道 B 投影），经聚合网关在
 * /deep-research/mcp 端点暴露。
 *
 * 来源：Weizhena/Deep-Research-skills 的 skills/research-en 集合
 * （research / research-deep / research-report 等）。客户端读取 SKILL.md 后
 * 在本机执行；公网检索应配合本聚合出口的 /web/mcp（web_search / web_fetch）。
 */
import { createStaticSkillsServerFactory } from "../../src/create-static-skills-server.ts";
import { SKILLS_CACHE_VERSION, STATIC_SKILL_RESOURCES } from "./skills.generated.ts";

export const createDeepResearchServer = createStaticSkillsServerFactory({
    name: "deep-research",
    version: "1.0.0",
    resources: STATIC_SKILL_RESOURCES,
    cacheVersion: SKILLS_CACHE_VERSION,
});
