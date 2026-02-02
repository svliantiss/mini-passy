import http from "node:http";
import { loadEnv } from "./env.js";
import { resolveAlias } from "./alias.js";
import {
  handleOpenAIModels,
  handleOpenAIChatCompletions,
  handleAnthropicMessages,
} from "./router/index.js";

const env = loadEnv();

function parseBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

function sendJson(res: http.ServerResponse, data: unknown, status = 200) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(data));
}

async function handleRequest(
  req: http.IncomingMessage,
  res: http.ServerResponse
) {
  const path = req.url || "/";
  const method = req.method || "GET";

  // Health check
  if (path === "/health" && method === "GET") {
    return sendJson(res, { status: "ok" });
  }

  // OpenAI: GET /v1/models (and /openai/v1/models for drop-in compatibility)
  if (
    (path === "/v1/models" || path === "/openai/v1/models") &&
    method === "GET"
  ) {
    return handleOpenAIModels(res, env.modelAliases);
  }

  // OpenAI: POST /v1/chat/completions (and /openai/v1/chat/completions)
  if (
    (path === "/v1/chat/completions" ||
      path === "/openai/v1/chat/completions") &&
    method === "POST"
  ) {
    const rawBody = await parseBody(req);
    const body = JSON.parse(rawBody);
    const modelInput = body.model;
    const resolved = resolveAlias(modelInput, env.modelAliases);

    if (resolved.provider === "openai") {
      return handleOpenAIChatCompletions(
        res,
        body,
        env.openaiApiKeys,
        resolved.model
      );
    }

    if (resolved.provider === "anthropic") {
      return handleAnthropicMessages(
        res,
        body,
        env.anthropicApiKeys,
        resolved.model
      );
    }
  }

  // Anthropic: POST /v1/messages (and /anthropic/v1/messages)
  if (
    (path === "/v1/messages" || path === "/anthropic/v1/messages") &&
    method === "POST"
  ) {
    const rawBody = await parseBody(req);
    const body = JSON.parse(rawBody);
    const modelInput = body.model;
    const resolved = resolveAlias(modelInput, env.modelAliases);

    return handleAnthropicMessages(
      res,
      body,
      env.anthropicApiKeys,
      resolved.model
    );
  }

  return sendJson(res, { error: "Not found" }, 404);
}

export function startServer(port: number): Promise<{ port: number; stop: () => void }> {
  return new Promise((resolve, reject) => {
    const server = http.createServer(handleRequest);

    server.on("error", (err: NodeJS.ErrnoException) => {
      if (err.code === "EADDRINUSE") {
        reject(err);
      } else {
        reject(err);
      }
    });

    server.listen(port, "127.0.0.1", () => {
      const addr = server.address();
      const actualPort = typeof addr === "object" && addr ? addr.port : port;
      resolve({
        port: actualPort,
        stop: () => server.close(),
      });
    });
  });
}

export { env };
