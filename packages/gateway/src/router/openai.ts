import type http from "node:http";
import https from "node:https";

const OPENAI_HOST = "api.openai.com";

let openaiKeyIndex = 0;

function pickOpenAIKey(apiKeys: string[]): string | undefined {
  if (apiKeys.length === 0) return undefined;
  const key = apiKeys[openaiKeyIndex % apiKeys.length];
  openaiKeyIndex = (openaiKeyIndex + 1) % apiKeys.length;
  return key;
}

export function handleOpenAIModels(
  res: http.ServerResponse,
  aliases: Record<string, string>
): void {
  // Return aliased model IDs, not upstream names
  const aliasedModels = Object.keys(aliases)
    .filter((alias) => {
      const resolved = aliases[alias];
      return (
        resolved.startsWith("openai:") ||
        (!resolved.startsWith("anthropic:") && !resolved.includes("claude"))
      );
    })
    .map((id) => ({
      id,
      object: "model",
      created: Date.now(),
      owned_by: "mini-llm",
    }));

  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ object: "list", data: aliasedModels }));
}

export function handleOpenAIChatCompletions(
  res: http.ServerResponse,
  body: Record<string, unknown>,
  apiKeys: string[],
  resolvedModel: string
): void {
  // Replace model with resolved upstream model
  body.model = resolvedModel;
  const payload = JSON.stringify(body);

  const apiKey = pickOpenAIKey(apiKeys);
  if (!apiKey) {
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "OPENAI_API_KEY not set" }));
    return;
  }

  const options: https.RequestOptions = {
    hostname: OPENAI_HOST,
    port: 443,
    path: "/v1/chat/completions",
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Content-Length": Buffer.byteLength(payload),
      Authorization: `Bearer ${apiKey}`,
    },
  };

  const upstream = https.request(options, (upstreamRes) => {
    // Stream passthrough - no buffering
    if (body.stream) {
      res.writeHead(upstreamRes.statusCode || 200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      });
      upstreamRes.pipe(res);
    } else {
      res.writeHead(upstreamRes.statusCode || 200, {
        "Content-Type": "application/json",
      });
      upstreamRes.pipe(res);
    }
  });

  upstream.on("error", (err) => {
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: err.message }));
  });

  upstream.write(payload);
  upstream.end();
}
