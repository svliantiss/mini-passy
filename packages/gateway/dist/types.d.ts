export interface Provider {
    name: string;
    url: string;
    key: string;
    openai: boolean;
    anthropic: boolean;
    models: string[];
}
export interface Alias {
    name: string;
    targets: {
        provider: string;
        model: string;
    }[];
    fallbackOn: string[];
}
export interface EnvConfig {
    port: number;
    providers: Map<string, Provider>;
    aliases: Map<string, Alias>;
}
//# sourceMappingURL=types.d.ts.map