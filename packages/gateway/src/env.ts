import type { Provider, Alias, EnvConfig } from "./types.js";

export function loadEnv(): EnvConfig {
  const port = parseInt(process.env.PORT || "3333", 10);
  const providers = new Map<string, Provider>();
  const aliases = new Map<string, Alias>();

  // Parse PROVIDER_*_URL and PROVIDER_*_KEY
  for (const [key, value] of Object.entries(process.env)) {
    const match = key.match(/^PROVIDER_(.+)_URL$/);
    if (match && value) {
      const name = match[1].toLowerCase();
      const url = value;
      const apiKey = process.env[`PROVIDER_${match[1]}_KEY`];
      if (apiKey) {
        providers.set(name, {
          name,
          url,
          key: apiKey,
          openai: false,
          anthropic: false,
          models: [],
        });
      }
    }
  }

  // Parse ALIAS_* and ALIAS_*_FALLBACK
  for (const [key, value] of Object.entries(process.env)) {
    const match = key.match(/^ALIAS_(.+)$/);
    if (match && value && !key.endsWith("_FALLBACK")) {
      const name = match[1].toLowerCase();
      // Parse "provider:model" or just "provider" (uses same model name)
      const [providerName, modelName] = value.includes(":")
        ? value.split(":")
        : [value, name];

      const fallbackKey = `ALIAS_${match[1]}_FALLBACK`;
      const fallbackStr = process.env[fallbackKey];
      const fallbackProviders = fallbackStr
        ? fallbackStr.split(",").map((s) => s.trim().toLowerCase())
        : [];

      // Build targets list: primary + fallbacks
      const targets = [
        { provider: providerName.toLowerCase(), model: modelName || name },
      ];
      for (const fb of fallbackProviders) {
        if (fb !== providerName.toLowerCase()) {
          targets.push({ provider: fb, model: modelName || name });
        }
      }

      aliases.set(name, {
        name,
        targets,
        fallbackOn: ["5xx", "timeout", "rate_limit"],
      });
    }
  }

  return { port, providers, aliases };
}
