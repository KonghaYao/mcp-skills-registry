#!/usr/bin/env bun
/**
 * 将 skills.lock.json 对应的 SKILL.md 生成静态 TypeScript registry。
 * 生成文件由 Git 忽略，供 Bun 与 Cloudflare Worker 使用同一份可打包资源。
 */
import path from "node:path";
import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";

const ROOT = import.meta.dir;
const LOCK_PATH = path.join(ROOT, "skills.lock.json");

function fail(message) {
  throw new Error(message);
}

function descriptionFrom(text) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(text);
  if (!match) return undefined;
  try {
    const value = Bun.YAML.parse(match[1]);
    return typeof value?.description === "string" ? value.description : undefined;
  } catch {
    return undefined;
  }
}

async function main() {
  if (!existsSync(LOCK_PATH)) fail("缺少 skills.lock.json，请先运行 bun run skills:sync");

  const lock = JSON.parse(await readFile(LOCK_PATH, "utf8"));
  if (lock.lockfileVersion !== 1 || !lock.entries) fail("skills.lock.json 格式无效");

  for (const [id, entry] of Object.entries(lock.entries)) {
    const skillsDir = path.join(ROOT, entry.dest);
    const records = [];

    for (const name of [...entry.skills].sort()) {
      const skillPath = path.join(skillsDir, name, "SKILL.md");
      if (!existsSync(skillPath)) {
        fail(`${id}: 缺少 ${path.relative(ROOT, skillPath)}，请先运行 bun run skills:sync`);
      }
      const text = await readFile(skillPath, "utf8");
      records.push({
        name,
        description: descriptionFrom(text),
        text,
        size: Buffer.byteLength(text),
      });
    }

    const outputPath = path.join(ROOT, "servers", id, "skills.generated.ts");
    const content = `// 此文件由 generate-skills-registry.js 生成，勿手工编辑。\n` +
      `import type { StaticSkill } from "../../src/static-skills.ts";\n\n` +
      `export const skills = ${JSON.stringify(records, null, 2)} as const satisfies readonly StaticSkill[];\n`;
    await writeFile(outputPath, content);
    console.log(`✔ ${id}: 生成 ${path.relative(ROOT, outputPath)}（${records.length} skills）`);
  }
}

main().catch((error) => {
  console.error(`✘ ${error.message}`);
  process.exit(1);
});
