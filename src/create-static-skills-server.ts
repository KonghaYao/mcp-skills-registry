import { McpServer } from "@modelcontextprotocol/server";
import { createMcppServerFactory } from "@peri-code/mcpp";
import {
    ResourceForStaticSkills,
    type StaticSkillResourceFile,
} from "@peri-code/mcpp/skills/static";
import { skillResourceCache } from "./skill-resource-cache.ts";

const CACHE_TTL_MS = 24 * 60 * 60 * 1_000;

interface StaticSkillsServerOptions {
    name: string;
    version: string;
    resources: readonly StaticSkillResourceFile[];
    cacheVersion: string;
}

/** 为静态 Skills 创建同时启用 Response Cache 与 Resource Content Cache 的请求级 factory。 */
export function createStaticSkillsServerFactory(options: StaticSkillsServerOptions) {
    return createMcppServerFactory(
        {
            cache: skillResourceCache,
            cacheVersion: options.cacheVersion,
            ttlMs: CACHE_TTL_MS,
            scope: "public",
        },
        (_request, mcpp) => {
            const server = new McpServer(
                {
                    name: options.name,
                    version: options.version,
                },
                { capabilities: mcpp.capabilities },
            );

            ResourceForStaticSkills(server, {
                resources: options.resources,
                origin: options.name,
                ...mcpp.resourceCache,
            });

            return server;
        },
    );
}
