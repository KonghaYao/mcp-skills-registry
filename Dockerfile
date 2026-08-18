FROM oven/bun:1.3.14-slim AS builder

WORKDIR /app

# skills:sync 需要 git；ca-certificates 用于 HTTPS clone。
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates git \
    && rm -rf /var/lib/apt/lists/*

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

COPY . .
RUN bun run skills:build \
    && bunx tsc --noEmit \
    && rm -rf servers/*/skills

FROM oven/bun:1.3.14-slim AS runtime

WORKDIR /app
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=8787

COPY --from=builder --chown=bun:bun /app /app

USER bun
EXPOSE 8787

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD ["bun", "-e", "const r=await fetch('http://127.0.0.1:'+process.env.PORT+'/nope');process.exit(r.status===404?0:1)"]

CMD ["bun", "src/index.ts"]
