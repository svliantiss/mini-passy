import type http from "node:http";
import https from "node:https";

const ANTHROPIC_HOST = "api.anthropic.com";

let anthropicKeyIndex = 0;

function pickAnthropicKey(apiKeys: string[]): string | undefined {
  if (apiKeys.length === 0) return undefined;
  const key = apiKeys[anthropicKeyIndex % apiKeys.length];
  anthropicKeyIndex = (anthropicKeyIndex + 1) % apiKeys.length;
  return key;
}

export function handleAnthropicMessages(
  res: http.ServerResponse,
  body: Record<string, unknown>,
  apiKeys: string[],
  resolvedModel: string
): void {
  // Replace model with resolved upstream model
  body.model = resolvedModel;
  const payload = JSON.stringify(body);

  const apiKey = pickAnthropicKey(apiKeys);
  if (!apiKey) {
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "ANTHROPIC_API_KEY not set" }));
    return;
  }

  const options: https.RequestOptions = {
    hostname: ANTHROPIC_HOST,
    port: 443,
    path: "/v1/messages",
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Content-Length": Buffer.byteLength(payload),
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
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
