export interface MiniLLMConfig {
    port?: number;
    env?: Record<string, string>;
}
export interface MiniLLMInstance {
    ready(): Promise<void>;
    url: string;
    stop(): Promise<void>;
}
//# sourceMappingURL=types.d.ts.map