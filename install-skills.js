#!/usr/bin/env bun
/**
 * skills installer —— 类 npm 的第三方 skills 同步器
 *
 * 用法：
 *   bun install-skills.js            # 幂等同步：有 lock 则复现 lock 记录，无 lock 则安装并写 lock
 *   bun install-skills.js --update   # 忽略 lock，重新解析 manifest 中 ref 的最新 commit 并同步
 *
 * 数据文件：
 *   skills.json        声明（手工维护）：每个 source 的 repo / ref / 路径 / 目标目录
 *   skills.lock.json  锁文件（自动生成，提交进 git）：记录每个 source 实际安装的 commit
 *                     和已安装的 skill 名单，是"重复运行可复现"的依据
 *
 * 行为约定：
 *   - 默认 copy 到项目内（dest 相对于项目根），不做 symlink
 *   - ref 支持 commit sha / tag / branch；省略 ref 时锁定首次安装时的默认分支 commit
 *   - 重复运行：manifest 与 lock 均未变 → 全部跳过；dest 被删除/改动 → 自动重装
 *   - --update：对每个 source 重新解析最新 commit，变了才重装
 */
import { existsSync } from "node:fs";
import { cp, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";

const ROOT = import.meta.dir;
const MANIFEST = path.join(ROOT, "skills.json");
const LOCK_FILE = path.join(ROOT, "skills.lock.json");
const MAX_DEPTH = 3; // 在 source.path 下最多下探几层找 SKILL.md

const args = process.argv.slice(2);
const UPDATE = args.includes("--update") || args.includes("-u");
const SHA_RE = /^[0-9a-f]{40}$/i;

/* ---------------- 工具 ---------------- */

async function sh(cmd, argv, opts = {}) {
  const proc = Bun.spawn([cmd, ...argv], {
    cwd: opts.cwd ?? ROOT,
    stdout: "pipe",
    stderr: "pipe",
  });
  const [code, out, err] = await Promise.all([
    proc.exited,
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);
  if (code !== 0 && !opts.allowFail) {
    throw new Error(`${cmd} ${argv.join(" ")} 失败 (${code}): ${err.trim()}`);
  }
  return { code, out, err };
}

const log = (msg) => console.log(msg);

/** ref -> commit sha（40 位 hex 原样返回；tag/branch 走 ls-remote 解析） */
async function resolveRef(url, ref) {
  if (SHA_RE.test(ref)) return ref.toLowerCase();
  // 精确匹配优先：refs/heads/<ref>、refs/tags/<ref>
  // （直接 `git ls-remote <url> <ref>` 是子串匹配，会命中 e.g. refs/heads/<user>/main）
  for (const rs of [`refs/heads/${ref}`, `refs/tags/${ref}`]) {
    const { out } = await sh("git", ["ls-remote", url, rs]);
    const line = out.trim().split(/\n/).find((l) => l.length > 0);
    if (line) return line.split(/\t/)[0].toLowerCase();
  }
  // 兜底：宽松子串匹配（非标准 ref 形态）
  const { out } = await sh("git", ["ls-remote", url, ref]);
  const line = out.trim().split(/\n/).find((l) => l.length > 0);
  if (!line) throw new Error(`无法解析 ref "${ref}"（${url}，确认 tag/branch 存在）`);
  return line.split(/\t/)[0].toLowerCase();
}

/** 默认分支最新 commit */
async function resolveDefault(url) {
  const { out } = await sh("git", ["ls-remote", "--symref", url, "HEAD"]);
  const lines = out.trim().split(/\n/).filter(Boolean);
  const sha = lines[lines.length - 1].split(/\t/)[0];
  if (!SHA_RE.test(sha)) throw new Error(`无法解析默认分支（${url}）`);
  return sha.toLowerCase();
}

/** 浅获取指定 commit 的完整工作树到临时目录，返回该目录（调用方负责清理） */
async function fetchTree(url, sha) {
  const dir = path.join(os.tmpdir(), `skills-${crypto.randomBytes(6).toString("hex")}`);
  await mkdir(dir, { recursive: true });
  await sh("git", ["init", "-q"], { cwd: dir });
  await sh("git", ["remote", "add", "origin", url], { cwd: dir });
  const { code, err } = await sh("git", ["fetch", "-q", "--depth", "1", "origin", sha], {
    cwd: dir,
    allowFail: true,
  });
  if (code !== 0) {
    // 服务端不支持浅获取任意 commit 时，回退完整 clone + checkout
    log(`  （浅获取失败，回退完整 clone：${err.trim().split(/\n/)[0]}）`);
    await rm(dir, { recursive: true, force: true });
    const clone = path.join(os.tmpdir(), `skills-clone-${crypto.randomBytes(6).toString("hex")}`);
    await sh("git", ["clone", "-q", url, clone]);
    await sh("git", ["checkout", "-q", sha], { cwd: clone });
    return clone;
  }
  await sh("git", ["checkout", "-q", "FETCH_HEAD"], { cwd: dir });
  return dir;
}

/** 在 root 下递归找含 SKILL.md 的 skill 目录（最多 MAX_DEPTH 层，忽略隐藏目录） */
async function findSkills(root, depth = 0, results = []) {
  if (depth > MAX_DEPTH) return results;
  let entries;
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch {
    return results;
  }
  for (const e of entries) {
    if (e.name.startsWith(".")) continue;
    const full = path.join(root, e.name);
    if (e.isDirectory()) {
      if (existsSync(path.join(full, "SKILL.md"))) {
        results.push({ dir: full, name: e.name });
      } else {
        await findSkills(full, depth + 1, results);
      }
    }
  }
  return results;
}

/* ---------------- 主流程 ---------------- */

async function main() {
  if (!existsSync(MANIFEST)) throw new Error(`缺少 manifest: ${MANIFEST}`);
  const manifest = JSON.parse(await readFile(MANIFEST, "utf8"));
  const lock = existsSync(LOCK_FILE)
    ? JSON.parse(await readFile(LOCK_FILE, "utf8"))
    : { lockfileVersion: 1, entries: {} };
  const sources = manifest.sources ?? [];
  if (sources.length === 0) throw new Error("manifest 中没有 sources，无事可做");

  await sh("git", ["--version"]); // 前置检查 git 可用

  let skipped = 0;
  let installed = 0;

  for (const src of sources) {
    const id = src.id;
    if (!id) throw new Error("每个 source 必须有唯一 id");
    if (!src.repo && !src.url) throw new Error(`source "${id}" 需要 repo（或 url）`);
    if (!src.dest) throw new Error(`source "${id}" 需要 dest（相对于项目根）`);

    const url = src.url ?? `https://github.com/${src.repo}.git`;
    const relPath = src.path ?? "skills";
    const select = src.select ?? ["*"];
    const dest = path.join(ROOT, src.dest);
    const ref = src.ref ?? null;
    const prev = lock.entries?.[id];

    // 决定目标 commit：sha 直接使用；lock 未变则复现 lock；否则重新解析
    let commit;
    if (ref && SHA_RE.test(ref)) {
      commit = ref.toLowerCase();
    } else if (prev && !UPDATE && (prev.ref ?? null) === ref) {
      commit = prev.commit;
    } else {
      commit = ref ? await resolveRef(url, ref) : await resolveDefault(url);
    }

    // 幂等判断：lock 的 commit 与本次一致、manifest ref 未变、且所有已装 skill 都在
    const upToDate =
      prev &&
      prev.commit === commit &&
      (prev.ref ?? null) === ref &&
      (prev.skills ?? []).every((n) => existsSync(path.join(dest, n, "SKILL.md")));

    if (upToDate) {
      log(`✓ ${id}@${commit.slice(0, 7)} 已是最新（${prev.skills.length} skills），跳过`);
      skipped++;
      continue;
    }

    // 安装：拉取该 commit 的工作树 → 按 select 挑选 → copy 到 dest
    const tmp = await fetchTree(url, commit);
    try {
      const skillsRoot = path.join(tmp, relPath);
      const found = await findSkills(skillsRoot);
      if (existsSync(path.join(skillsRoot, "SKILL.md"))) {
        // 根即单 skill（SKILL.md 位于 path 根，例如仓库根就是 skill）：
        // 用 source id 命名，而非不可控的临时 clone 目录名（fetchTree 用随机 hex 目录）。
        // 仅当 path 根含 SKILL.md 时命中，不影响按子目录组织的现有源。
        found.unshift({ dir: skillsRoot, name: id });
      }
      const wanted = found.filter((f) => select.includes("*") || select.includes(f.name));
      if (wanted.length === 0) {
        throw new Error(
          `source "${id}" 在 ${relPath} 未发现匹配的 skills（找到 ${found.length} 个，select=${select.join(",")}）`
        );
      }

      // 清掉上一轮安装的同源产物（含本次不再选的），保持 dest 只含当前快照
      await mkdir(dest, { recursive: true });
      const remove = new Set([...(prev?.skills ?? []), ...wanted.map((w) => w.name)]);
      for (const name of remove) {
        await rm(path.join(dest, name), { recursive: true, force: true });
      }
      for (const w of wanted) {
        await cp(w.dir, path.join(dest, w.name), { recursive: true });
      }

      // 更新 lock（整体原子写回）
      lock.entries[id] = { ref, commit, dest: src.dest, skills: wanted.map((w) => w.name) };
      await writeFile(LOCK_FILE, JSON.stringify(lock, null, 2) + "\n");
      log(`✔ ${id}@${commit.slice(0, 7)} → ${src.dest}（${wanted.length} skills）`);
      installed++;
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  }

  log(`完成：${installed} 个 source 已安装，${skipped} 个跳过`);
}

main().catch((e) => {
  console.error(`✘ ${e.message}`);
  process.exit(1);
});
