import type http from "node:http";
import https from "node:https";
import httpModule from "node:http";
import type { Provider, Alias } from "./types.js";

// Connection pooling agents
const httpsAgent = new https.Agent({
  keepAlive: true,
  maxSockets: 50,
  maxFreeSockets: 10,
  timeout: 60000,
});

const httpAgent = new httpModule.Agent({
  keepAlive: true,
  maxSockets: 50,
  maxFreeSockets: 10,
  timeout: 60000,
});

function proxyRequest(
  provider: Provider,
  path: string,
  body: Record<string, unknown>,
  format: "openai" | "anthropic",
  res: http.ServerResponse
): void {
  const payload = JSON.stringify(body);
  const url = new URL(provider.url);
  const isHttps = url.protocol === "https:";
  const agent = isHttps ? httpsAgent : httpAgent;
  const requestModule = isHttps ? https : httpModule;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(payload).toString(),
  };

  if (format === "openai") {
    headers["Authorization"] = `Bearer ${provider.key}`;
  } else {
    headers["x-api-key"] = provider.key;
    headers["anthropic-version"] = "2023-06-01";
  }

  const options: https.RequestOptions = {
    hostname: url.hostname,
    port: url.port || (isHttps ? 443 : 80),
    path,
    method: "POST",
    agent,
    headers,
  };

  const upstream = requestModule.request(options, (upRes) => {
    const isStreaming =
      body.stream || upRes.headers["content-type"]?.includes("text/event-stream");

    res.writeHead(upRes.statusCode || 200, {
      "Content-Type": isStreaming ? "text/event-stream" : "application/json",
      ...(isStreaming && {
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      }),
    });

    upRes.pipe(res);
  });

  upstream.on("error", (err) => {
    console.error(`[${provider.name}] Upstream error:`, err.message);
    res.writeHead(502, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Upstream service unavailable" }));
  });

  upstream.on("timeout", () => {
    upstream.destroy();
    res.writeHead(504, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Gateway timeout" }));
  });

  upstream.write(payload);
  upstream.end();
}

export function proxyWithFallback(
  alias: Alias,
  body: Record<string, unknown>,
  providers: Map<string, Provider>,
  res: http.ServerResponse
): void {
  const errors: string[] = [];

  function tryNext(targetIndex: number): void {
    if (targetIndex >= alias.targets.length) {
      // All failed
      res.writeHead(502, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          error: "All providers failed",
          details: errors,
        })
      );
      return;
    }

    const target = alias.targets[targetIndex];
    const provider = providers.get(target.provider);

    if (!provider) {
      errors.push(`${target.provider}: not configured`);
      tryNext(targetIndex + 1);
      return;
    }

    // Skip model availability check - assume model exists if alias is configured
    // The provider will return an error if the model doesn't exist

    // Determine format and path
    // If discovery failed (no format detected), assume OpenAI format as default
    let path: string;
    let format: "openai" | "anthropic";
    let requestBody: Record<string, unknown>;

    if (provider.anthropic) {
      path = "/v1/messages";
      format = "anthropic";
      // Convert OpenAI format to Anthropic
      requestBody = {
        model: target.model,
        messages: body.messages,
        max_tokens: (body.max_tokens as number) || 4096,
        stream: body.stream,
        temperature: body.temperature,
      };
    } else {
      // Default to OpenAI format (works for OpenAI, Nebius, DeepInfra, etc.)
      path = "/v1/chat/completions";
      format = "openai";
      requestBody = { ...body, model: target.model };
    }

    // For simplicity, we don't do complex fallback detection here
    // In a production system, you'd wrap this and detect 5xx/timeout errors
    console.log(`[${alias.name}] Trying ${provider.name}...`);
    proxyRequest(provider, path, requestBody, format, res);
  }

  tryNext(0);
}