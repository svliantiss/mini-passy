import type { Provider } from "./types.js";

// Simple fetch wrapper using Node's https/http
function fetchWithTimeout(
  url: string,
  options: { headers: Record<string, string>; timeout: number }
): Promise<{ ok: boolean; json: () => Promise<unknown> }> {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const isHttps = urlObj.protocol === "https:";
    const httpModule = isHttps ? require("node:https") : require("node:http");

    const reqOptions = {
      hostname: urlObj.hostname,
      port: urlObj.port || (isHttps ? 443 : 80),
      path: urlObj.pathname + urlObj.search,
      method: "GET",
      headers: options.headers,
      timeout: options.timeout,
    };

    const req = httpModule.request(reqOptions, (res: any) => {
      let data = "";
      res.on("data", (chunk: Buffer) => (data += chunk));
      res.on("end", () => {
        console.log(`[fetch] Response status: ${res.statusCode}, data length: ${data.length}`);
        if (data.length > 0) {
          console.log(`[fetch] Response preview: ${data.substring(0, 200)}`);
        }
        resolve({
          ok: res.statusCode >= 200 && res.statusCode < 300,
          json: async () => JSON.parse(data),
        });
      });
    });

    req.on("error", (err: Error) => {
      console.log(`[fetch] Error: ${err.message}`);
      reject(err);
    });
    req.on("timeout", () => {
      console.log(`[fetch] Timeout after ${options.timeout}ms`);
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
        timeout: 10000,
      });
      if (res.ok) {
        const data = (await res.json()) as { data?: Array<{ id: string }> };
        provider.openai = true;
        provider.models = data.data?.map((m) => m.id) || [];
        console.log(
          `[${name}] ✓ OpenAI format, ${provider.models.length} models`
        );
      } else {
        console.log(`[${name}] OpenAI format returned non-OK status`);
      }
    } catch (e) {
      const errorMsg = e instanceof Error ? e.message : String(e);
      console.log(`[${name}] ✗ OpenAI format failed: ${errorMsg}`);
    }

    // Try Anthropic format (if OpenAI failed or for additional models)
    if (!provider.openai || provider.models.length === 0) {
      try {
        const res = await fetchWithTimeout(`${provider.url}/v1/models`, {
          headers: {
            "x-api-key": provider.key,
            "anthropic-version": "2023-06-01",
          },
          timeout: 10000,
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
        } else {
          console.log(`[${name}] Anthropic format returned non-OK status`);
        }
      } catch (e) {
        const errorMsg = e instanceof Error ? e.message : String(e);
        console.log(`[${name}] ✗ Anthropic format failed: ${errorMsg}`);
      }
    }

    if (!provider.openai && !provider.anthropic) {
      console.log(`[${name}] ✗ No compatible format found`);
    }
  }
}