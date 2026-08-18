# CLAUDE.md

## 项目定位

`mcp-skills-registry`：演示 [MCPP 3.7] 的 monorepo 拓扑——**单一 HTTP 出口，路径路由到 sub server**（Cloudflare Worker / 本地端口 8787）。`openspec` 和 `mattpocock` sub server 分别把第三方 skills 通过 MCP 暴露给客户端。

## 目录结构

```
src/index.ts                    聚合入口
src/registry.ts                 唯一 sub server 注册表
src/static-skills.ts            静态 skills MCP resource 挂载
servers/openspec/server.ts       OpenSpec sub server
servers/openspec/skills/         OpenSpec skills（生成、Git ignored）
servers/mattpocock/server.ts     Matt Pocock sub server
servers/mattpocock/skills/       Matt Pocock skills（生成、Git ignored）
servers/*/skills.generated.ts    Worker 可打包的静态 registry（生成、Git ignored）
skills.json                      skills 同步声明（手工维护）
skills.lock.json                 skills 锁文件（自动生成、提交进 Git）
install-skills.js                skills 同步器
generate-skills-registry.js      静态 registry 生成器
test/                            smoke 测试
Dockerfile                      多阶段 Bun 容器构建
docker-compose.yaml             本地/服务器容器部署
.github/workflows/              GHCR 自动发布
wrangler.jsonc                  Cloudflare 部署配置
```

## 常用命令

```sh
bun run init                # 新 clone 初始化：安装依赖、按 lock 同步并生成 registry
bun dev                     # 构建 skills 后启动本地 server（端口 8787）
bun run demo                # 构建 skills 后运行 smoke 测试
docker compose up --build -d # 构建并启动 Docker 服务
bun run deploy              # 构建 skills 后部署 Cloudflare Worker
bun run deploy:dry-run      # 构建 skills 后验证 Worker 打包
bun run skills:sync         # 按 manifest + lock 幂等同步第三方 skills
bun run skills:generate     # 从本地 skills 生成静态 TypeScript registry
bun run skills:build        # skills:sync + skills:generate
bun run skills:update       # 更新远程 commit、同步并重新生成 registry
```

## Skills 构建机制

第三方 skills 不手工 vendor，而是声明、锁文件和构建产物驱动，行为类似 npm：

- `skills.json` 声明每个 source：`id`（须与 `servers/<id>/` 一致）、`repo` 或 `url`、`ref`、repo 内 `path`、`select` 和项目内 `dest`。
- `skills.lock.json` 记录实际安装 commit 与 skill 名单并提交进 Git；manifest 与 lock 未变且目标文件齐全时同步器直接跳过。
- `install-skills.js` 把锁定 commit **copy** 到 `servers/<id>/skills/`，不使用 symlink。
- `generate-skills-registry.js` 把每个 `SKILL.md` 生成为 `servers/<id>/skills.generated.ts`。
- sub server 只读取静态 registry，不在运行时访问文件系统；因此 Bun 与 Cloudflare Worker 使用相同 resource 代码路径，Wrangler 能将 skill 正文打进 bundle。
- Bun gateway 和 Cloudflare Worker 均使用 `@peri-code/mcpp@0.2` 的严格 `2026-07-28` 无状态 Streamable HTTP，不返回 `Mcp-Session-Id`，避免跨 isolate 出现 `session id not found`。
- `servers/*/skills/` 和 `servers/*/skills.generated.ts` 都是被 Git 忽略的可复现生成产物。

## 注意事项

- Docker 镜像在 builder 阶段执行 `skills:build`，runtime 阶段不访问 GitHub；应用通过 `HOST=0.0.0.0` 暴露容器端口。
- GHCR workflow 仅使用 `GITHUB_TOKEN` 的 `packages: write` 权限，发布 `linux/amd64` 和 `linux/arm64`。
- 更新第三方 skills：运行 `bun run skills:update`，确认 sub server 和 smoke 测试兼容，再提交 `skills.lock.json`。
- 同步器检查 skill 目录是否缺失，但目前不校验已有文件内容哈希；不要手工修改生成目录。
- `git ls-remote <url> <ref>` 是子串匹配，可能误命中 `refs/heads/<user>/main`；同步器已优先精确匹配 `refs/heads/<ref>` / `refs/tags/<ref>`。
- 不使用 `npx skills`：它缺少本项目需要的 commit lock 和自定义 `dest`。
- 新增 sub server 时，同时添加 `skills.json` source、`servers/<id>/server.ts`、`src/registry.ts` 路由和 smoke 覆盖。

## 约定

- 中文注释与文档。
- 不直接编辑生成产物。
- 本地入口、Worker 和测试必须共用 `src/registry.ts`，避免路由漂移。
