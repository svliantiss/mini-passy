import type http from "node:http";
export declare function handleOpenAIModels(res: http.ServerResponse, aliases: Record<string, string>): void;
export declare function handleOpenAIChatCompletions(res: http.ServerResponse, body: Record<string, unknown>, apiKeys: string[], resolvedModel: string): void;
export declare function handleOpenAIImageGenerations(res: http.ServerResponse, body: Record<string, unknown>, apiKeys: string[], resolvedModel: string | undefined): void;
//# sourceMappingURL=openai.d.ts.map