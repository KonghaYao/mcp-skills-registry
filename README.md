# monorepo —— MCPP 聚合 server 示例

演示 [MCPP 3.7] 的 monorepo 拓扑：**单一 HTTP 出口，路径路由到 sub server**。

## 形态

```
                    ┌─────────────────────────────────────────────┐
  客户端             │ monorepo（单一 HTTP server，端口 8787）      │
                    │                                             │
  /openspec/mcp   ──► OpenSpec skills sub server                  │
  /mattpocock/mcp ──► Matt Pocock skills sub server               │
  其他路径         ──► 404                                         │
                    └─────────────────────────────────────────────┘
```

- 每个路径是独立的 MCP endpoint；skills 和 resources 相互隔离。
- 本地 Bun 与 Cloudflare Worker 均使用 `@peri-code/mcpp@0.2` 的严格 `2026-07-28` 无状态 Streamable HTTP，不依赖内存 session。
- `src/registry.ts` 是本地入口、Cloudflare Worker 和测试共用的唯一路由注册表。
- stdio 没有 URL/路径概念，不适用该聚合形态。

## 初始化

```sh
bun run init
```

该命令安装依赖、按 `skills.lock.json` 复现第三方 skills，并生成 Worker 可打包的静态 registry。

## 常用命令

```sh
bun dev                     # 构建 skills 后启动 http://127.0.0.1:8787/
bun run demo                # 端到端 smoke 测试
bun run skills:sync         # 按 lock 同步第三方 skills
bun run skills:update       # 更新第三方 commit 并重新生成 registry
bun run deploy:dry-run      # 验证 Cloudflare Worker bundle
bun run deploy              # 部署 Cloudflare Worker
```

## 目录结构

```
├── src/
│   ├── index.ts                 # 本地网关和纯 fetch handler
│   ├── registry.ts              # 唯一 sub server 注册表
│   └── static-skills.ts         # 静态 skills resource 挂载器
├── servers/
│   ├── openspec/
│   │   ├── server.ts
│   │   ├── skills/              # 生成、Git ignored
│   │   └── skills.generated.ts  # 生成、Git ignored
│   └── mattpocock/
│       ├── server.ts
│       ├── skills/              # 生成、Git ignored
│       └── skills.generated.ts  # 生成、Git ignored
├── install-skills.js            # manifest + lock 同步器
├── generate-skills-registry.js  # 静态 registry 生成器
├── skills.json                  # source 声明
├── skills.lock.json             # 锁定 commit，提交进 Git
├── test/smoke.ts
├── worker.ts
└── wrangler.jsonc
```

## 可复现 Skills 构建

```text
skills.json + skills.lock.json
            │
            ▼
     install-skills.js
            │ copy 锁定 commit
            ▼
 servers/<id>/skills/
            │
            ▼
generate-skills-registry.js
            │
            ▼
servers/<id>/skills.generated.ts
            │ static import
            ▼
      Bun / Worker bundle
```

生成目录和生成 registry 都不提交；新 clone 通过 `bun run init` 完整恢复。sub server 不在运行时读取 `node:fs`，因此 Worker bundle 会包含 `SKILL.md` 正文。

## Docker 部署

本地构建并启动：

```sh
docker compose up --build -d
docker compose ps
```

默认监听 `http://127.0.0.1:8787`。可覆盖宿主机端口和镜像：

```sh
MCP_SKILLS_PORT=8080 \
MCP_SKILLS_IMAGE=ghcr.io/konghayao/mcp-skills-registry:latest \
docker compose up -d
```

Docker builder 按 `skills.lock.json` 下载并生成静态 registry；runtime 镜像直接运行 `bun src/index.ts`，启动时不访问 GitHub。镜像内服务监听 `0.0.0.0:8787`，并带有 `/nope` 404 健康检查。

直接拉取 GHCR 镜像：

```sh
docker pull ghcr.io/konghayao/mcp-skills-registry:latest
docker run -d --name mcp-skills-registry \
  --restart unless-stopped \
  -p 8787:8787 \
  ghcr.io/konghayao/mcp-skills-registry:latest
```

## GHCR 自动发布

`.github/workflows/publish-ghcr.yaml` 在以下场景构建并推送 `linux/amd64`、`linux/arm64` 镜像：

- push 到 `main`：发布 `latest`、`main` 和 `sha-*`；
- push `v*` tag：发布 tag、semver 和 `sha-*`；
- GitHub Actions 手动触发。

Workflow 使用仓库自带的 `GITHUB_TOKEN`，需要仓库 Actions 具备 `packages: write` 权限，不需要额外配置 GHCR token。首次发布后可在 GitHub Packages 中调整镜像可见性。

## Cloudflare 部署

```sh
bun run deploy:dry-run
bun run deploy
```

Worker 使用无状态 Streamable HTTP：响应不返回 `Mcp-Session-Id`，每个请求独立创建 server 与 transport，适合 Cloudflare 多 isolate 路由，无需 Durable Objects。

## 相关

- 规范：[`MCPP.md`](../../../MCPP.md)
- 规范包：`@peri-code/mcpp`
- 承载约定：[agent-plugins.org](https://agent-plugins.org/plugin-authors/manifest)

[MCPP 3.7]: ../../../MCPP.md
