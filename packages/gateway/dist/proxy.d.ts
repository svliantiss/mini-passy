import type http from "node:http";
import type { Provider, Alias } from "./types.js";
export declare function proxyWithFallback(alias: Alias, body: Record<string, unknown>, providers: Map<string, Provider>, res: http.ServerResponse): void;
//# sourceMappingURL=proxy.d.ts.map