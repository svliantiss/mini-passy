export interface EnvConfig {
  port: number;
  /**
   * One or more OpenAI API keys. Parsed from:
   * - OPENAI_API_KEYS (comma-separated)
   * - or single OPENAI_API_KEY
   */
  openaiApiKeys: string[];
  /**
   * One or more Anthropic API keys. Parsed from:
   * - ANTHROPIC_API_KEYS (comma-separated)
   * - or single ANTHROPIC_API_KEY
   */
  anthropicApiKeys: string[];
  modelAliases: Record<string, string>;
}

function parseKeys(single?: string, multiple?: string): string[] {
  if (multiple && multiple.trim().length > 0) {
    return multiple
      .split(",")
      .map((k) => k.trim())
      .filter((k) => k.length > 0);
  }

  if (single && single.trim().length > 0) {
    return [single.trim()];
  }

  return [];
}

export function loadEnv(): EnvConfig {
  const port = parseInt(process.env.MINI_LLM_PORT || "3333", 10);

  const openaiApiKeys = parseKeys(
    process.env.OPENAI_API_KEY,
    process.env.OPENAI_API_KEYS
  );

  const anthropicApiKeys = parseKeys(
    process.env.ANTHROPIC_API_KEY,
    process.env.ANTHROPIC_API_KEYS
  );

  let modelAliases: Record<string, string> = {};
  const aliasesEnv = process.env.MINI_LLM_MODEL_ALIASES;
  if (aliasesEnv) {
    try {
      modelAliases = JSON.parse(aliasesEnv);
    } catch {
      // Invalid JSON, ignore
    }
  }

  return {
    port,
    openaiApiKeys,
    anthropicApiKeys,
    modelAliases,
  };
}
