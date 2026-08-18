import {
    McpServer,
    ResourceNotFoundError,
    ResourceTemplate,
} from "@modelcontextprotocol/server";

export interface StaticSkill {
    readonly name: string;
    readonly description?: string;
    readonly text: string;
    readonly size: number;
}

/**
 * 将构建期生成的 skills 注册为 MCP resources。
 * 不依赖运行时文件系统，因此 Bun 与 Cloudflare Worker 使用完全相同的资源集合。
 */
export function registerStaticSkills(
    server: McpServer,
    skills: readonly StaticSkill[],
    namePrefix = "skill",
): void {
    const byName = new Map(skills.map((skill) => [skill.name, skill]));
    const uri = (name: string) => `skill://${name}/SKILL.md`;

    server.registerResource(
        "skill",
        new ResourceTemplate(uri("{skillName}"), {
            list: async () => ({
                resources: skills.map((skill) => ({
                    uri: uri(skill.name),
                    name: skill.name,
                    description: skill.description ?? `${namePrefix}:${skill.name}`,
                    mimeType: "text/markdown",
                    size: skill.size,
                })),
            }),
        }),
        {
            title: `${namePrefix} skill`,
            description: "A single generated skill with its SKILL.md",
            mimeType: "text/markdown",
        },
        async (resourceUri, variables) => {
            const rawName = variables.skillName;
            const name = Array.isArray(rawName) ? rawName[0] : rawName;
            const skill = typeof name === "string" ? byName.get(name) : undefined;
            if (!skill) {
                throw new ResourceNotFoundError(
                    resourceUri.href,
                    `Skill '${name ?? ""}' not found`,
                );
            }
            return {
                contents: [
                    {
                        uri: resourceUri.href,
                        mimeType: "text/markdown",
                        text: skill.text,
                    },
                ],
            };
        },
    );
}
