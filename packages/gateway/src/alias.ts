export interface ResolvedModel {
  provider: "openai" | "anthropic";
  model: string;
}

export function resolveAlias(
  modelInput: string,
  aliases: Record<string, string>
): ResolvedModel {
  const resolved = aliases[modelInput] || modelInput;

  if (resolved.startsWith("openai:")) {
    return { provider: "openai", model: resolved.slice(7) };
  }
  if (resolved.startsWith("anthropic:")) {
    return { provider: "anthropic", model: resolved.slice(10) };
  }

  // Default: infer provider from model name
  if (
    resolved.startsWith("claude") ||
    resolved.includes("claude")
  ) {
    return { provider: "anthropic", model: resolved };
  }

  // Default to OpenAI
  return { provider: "openai", model: resolved };
}

export function getAliasedModels(
  aliases: Record<string, string>
): string[] {
  return Object.keys(aliases);
}
