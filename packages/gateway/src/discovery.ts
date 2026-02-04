import type { Provider } from "./types.js";

// Simple fetch wrapper using Node's https
function fetchWithTimeout(
  url: string,
  options: { headers: Record<string, string>; timeout: number }
): Promise<{ ok: boolean; json: () => Promise<unknown> }> {
  return new Promise((resolve, reject) => {
    const https = require("node:https");
    const urlObj = new URL(url);

    const reqOptions = {
      hostname: urlObj.hostname,
      port: urlObj.port || 443,
      path: urlObj.pathname + urlObj.search,
      method: "GET",
      headers: options.headers,
      timeout: options.timeout,
    };

    const req = https.request(reqOptions, (res: any) => {
      let data = "";
      res.on("data", (chunk: Buffer) => (data += chunk));
      res.on("end", () => {
        resolve({
          ok: res.statusCode >= 200 && res.statusCode < 300,
          json: async () => JSON.parse(data),
        });
      });
    });

    req.on("error", reject);
    req.on("timeout", () => {
      req.destroy();
      reject(new Error("Timeout"));
    });

    req.end();
  });
}

export async function discoverProviders(
  providers: Map<string, Provider>
): Promise<void> {
  for (const [name, provider] of providers) {
    console.log(`[${name}] Discovering...`);

    // Try OpenAI format
    try {
      const res = await fetchWithTimeout(`${provider.url}/v1/models`, {
        headers: { Authorization: `Bearer ${provider.key}` },
        timeout: 5000,
      });
      if (res.ok) {
        const data = (await res.json()) as { data?: Array<{ id: string }> };
        provider.openai = true;
        provider.models = data.data?.map((m) => m.id) || [];
        console.log(
          `[${name}] ✓ OpenAI format, ${provider.models.length} models`
        );
      }
    } catch (e) {
      console.log(`[${name}] ✗ OpenAI format failed`);
    }

    // Try Anthropic format (if OpenAI failed or for additional models)
    if (!provider.openai || provider.models.length === 0) {
      try {
        const res = await fetchWithTimeout(`${provider.url}/v1/models`, {
          headers: {
            "x-api-key": provider.key,
            "anthropic-version": "2023-06-01",
          },
          timeout: 5000,
        });
        if (res.ok) {
          const data = (await res.json()) as { data?: Array<{ id: string }> };
          provider.anthropic = true;
          const anthropicModels = data.data?.map((m) => m.id) || [];
          // Merge models (avoid duplicates)
          provider.models = [...new Set([...provider.models, ...anthropicModels])];
          console.log(
            `[${name}] ✓ Anthropic format, ${anthropicModels.length} models`
          );
        }
      } catch (e) {
        console.log(`[${name}] ✗ Anthropic format failed`);
      }
    }

    if (!provider.openai && !provider.anthropic) {
      console.log(`[${name}] ✗ No compatible format found`);
    }
  }
}