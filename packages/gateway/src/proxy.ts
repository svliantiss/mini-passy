import type http from "node:http";
import https from "node:https";
import httpModule from "node:http";
import type { Provider, Alias } from "./types.js";

// Connection pooling agents for upstream calls
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
    // Detect whether the client requested streaming and whether the upstream
    // is already sending SSE. We want to:
    // - passthrough real SSE streams from providers like OpenAI, and
    // - convert single JSON responses into OpenAI-style SSE when stream=true.
    const wantsStream = Boolean((body as { stream?: boolean }).stream);
    const upstreamContentType = upRes.headers["content-type"] || "";
    const upstreamIsSSE = upstreamContentType.includes("text/event-stream");

    // Case 1: Upstream is already streaming (OpenAI-style SSE) or client did not request stream.
    // In this case we just proxy the response as-is and keep headers simple.
    if (upstreamIsSSE || !wantsStream) {
      const isStreaming = upstreamIsSSE || wantsStream;

      res.writeHead(upRes.statusCode || 200, {
        "Content-Type": isStreaming ? "text/event-stream" : "application/json",
        ...(isStreaming && {
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        }),
      });

      upRes.pipe(res);
      return;
    }

    // Case 2: Client requested stream=true but upstream responded with a single JSON body.
    // To keep IDEs like Cursor compatible, we transform the JSON response into
    // an OpenAI chat.completion.chunk SSE stream with a final [DONE] sentinel.
    const chunks: Buffer[] = [];

    upRes.on("data", (chunk: Buffer) => {
      chunks.push(chunk);
    });

    upRes.on("end", () => {
      const statusCode = upRes.statusCode || 200;
      const rawBody = Buffer.concat(chunks).toString("utf8");

      try {
        const completion = JSON.parse(rawBody) as {
          id?: string;
          object?: string;
          created?: number;
          model?: string;
          choices?: Array<{
            index?: number;
            message?: { role?: string; content?: string };
            finish_reason?: string | null;
          }>;
          usage?: unknown;
          [key: string]: unknown;
        };

        const baseId = completion.id ?? `chatcmpl-${Date.now()}`;
        const baseCreated =
          completion.created ?? Math.floor(Date.now() / 1000);
        const baseModel =
          completion.model ??
          (body.model as string | undefined) ??
          provider.name;

        const firstChoice = completion.choices?.[0];
        const messageContent =
          firstChoice?.message?.content ?? rawBody;
        const finishReason = firstChoice?.finish_reason ?? "stop";

        // First SSE chunk: delta with assistant role and content.
        const deltaChunk = {
          id: baseId,
          object: "chat.completion.chunk",
          created: baseCreated,
          model: baseModel,
          choices: [
            {
              index: 0,
              delta: {
                role: "assistant",
                content: messageContent,
              },
              finish_reason: null,
            },
          ],
        };

        // Second SSE chunk: finish event (empty delta, finish_reason + usage if present).
        const finishChunk: Record<string, unknown> = {
          id: baseId,
          object: "chat.completion.chunk",
          created: baseCreated,
          model: baseModel,
          choices: [
            {
              index: 0,
              delta: {},
              finish_reason: finishReason,
            },
          ],
        };

        if (completion.usage) {
          finishChunk.usage = completion.usage;
        }

        const ssePayload =
          `data: ${JSON.stringify(deltaChunk)}\n\n` +
          `data: ${JSON.stringify(finishChunk)}\n\n` +
          "data: [DONE]\n\n";

        res.writeHead(statusCode, {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        });
        res.end(ssePayload);
      } catch (err) {
        // If anything goes wrong during transformation, fall back to JSON
        // so the client at least receives a valid response.
        console.error(
          `[${provider.name}] Failed to transform JSON response to SSE:`,
          err
        );
        res.writeHead(statusCode, { "Content-Type": "application/json" });
        res.end(rawBody);
      }
    });
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