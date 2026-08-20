import { McppCache } from "@peri-code/mcpp";

/** 在 HTTP Server factory 外创建，供同一进程内所有子 server 跨请求复用。 */
export const skillResourceCache = new McppCache();
