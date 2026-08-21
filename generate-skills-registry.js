#!/usr/bin/env bun
/**
 * 将 skills.lock.json 对应的 Skill 目录生成静态 TypeScript registry。
 * 生成文件由 Git 忽略，供 Bun 与 Cloudflare Worker 使用同一份可打包资源。
 *
 * 与旧版只打包 SKILL.md 不同，这里用 @peri-code/mcpp 的 buildStaticSkillResources
 * 收集 Skill 根内全部普通文件（references/scripts/agents 等附件），运行时通过
 * ResourceForStaticSkills 投影为 skill://<name>/{path} 资源。
 */
import path from "node:path";
import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { createCacheVersion } from "@peri-code/mcpp";
import { buildStaticSkillResources, renderStaticSkillResourcesModule } from "@peri-code/mcpp/skills/build";

const ROOT = import.meta.dir;
const LOCK_PATH = path.join(ROOT, "skills.lock.json");

function fail(message) {
  throw new Error(message);
}

async function main() {
  if (!existsSync(LOCK_PATH)) fail("缺少 skills.lock.json，请先运行 bun run skills:sync");

  const lock = JSON.parse(await readFile(LOCK_PATH, "utf8"));
  if (lock.lockfileVersion !== 1 || !lock.entries) fail("skills.lock.json 格式无效");

  for (const [id, entry] of Object.entries(lock.entries)) {
    const skillsDir = path.join(ROOT, entry.dest);
    if (!existsSync(skillsDir)) {
      fail(`${id}: 缺少 ${path.relative(ROOT, skillsDir)} 目录，请先运行 bun run skills:sync`);
    }

    // 收集 Skill 入口与全部附件，并做安全/预算/入口校验；缺失 SKILL.md 会抛错。
    const resources = await buildStaticSkillResources(skillsDir);

    // 对照 lock 校验每个预期 skill 均已生成。
    const names = new Set(resources.map((resource) => resource.skillName));
    for (const name of entry.skills) {
      if (!names.has(name)) fail(`${id}: 缺少预期 skill ${name}，请先运行 bun run skills:sync`);
    }

    const outputPath = path.join(ROOT, "servers", id, "skills.generated.ts");
    const cacheVersion = await createCacheVersion({
      schemaVersion: "1",
      resources: JSON.parse(JSON.stringify(resources)),
    });
    const content = `${renderStaticSkillResourcesModule(resources, "STATIC_SKILL_RESOURCES").replace(
      "import type { StaticSkillResourceFile } from \"@peri-code/mcpp/skills/static\";",
      "// 此文件由 generate-skills-registry.js 生成，勿手工编辑。\nimport type { StaticSkillResourceFile } from \"@peri-code/mcpp/skills/static\";",
    )}\nexport const SKILLS_CACHE_VERSION = ${JSON.stringify(cacheVersion)};\n`;
    await writeFile(outputPath, content);
    const attachmentCount = resources.filter((resource) => resource.relativePath !== "SKILL.md").length;
    console.log(
      `✔ ${id}: 生成 ${path.relative(ROOT, outputPath)}（${names.size} skills，${attachmentCount} 个附件）`,
    );
  }
}

main().catch((error) => {
  console.error(`✘ ${error.message}`);
  process.exit(1);
});