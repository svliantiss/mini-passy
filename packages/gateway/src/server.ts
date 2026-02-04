import http from "node:http";
import { loadEnv } from "./env.js";
import { discoverProviders } from "./discovery.js";
import { proxyWithFallback } from "./proxy.js";
import type { EnvConfig } from "./types.js";

const MAX_BODY_SIZE = 10 * 1024 * 1024; // 10MB

function parseBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let totalSize = 0;

    req.on("data", (chunk: Buffer) => {
      totalSize += chunk.length;
      if (totalSize > MAX_BODY_SIZE) {
        reject(new Error("Request body too large"));
        return;
      }
      chunks.push(chunk);
    });

    req.on("end", () => {
      try {
        resolve(Buffer.concat(chunks).toString("utf-8"));
      } catch (err) {
        reject(new Error("Failed to decode request body"));
      }
    });

    req.on("error", reject);
    req.on("aborted", () => reject(new Error("Request aborted")));
  });
}

function sendJson(res: http.ServerResponse, data: unknown, status = 200) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(data));
}

function sendError(
  res: http.ServerResponse,
  message: string,
  status = 500,
  code?: string
) {
  const error: { error: string; code?: string } = { error: message };
  if (code) error.code = code;
  sendJson(res, error, status);
}

function createRequestHandler(env: EnvConfig) {
  return async function handleRequest(
    req: http.IncomingMessage,
    res: http.ServerResponse
  ) {
    const path = req.url || "/";
    const method = req.method || "GET";

    try {
      // Health check
      if (path === "/health" && method === "GET") {
        return sendJson(res, {
          status: "ok",
          providers: Array.from(env.providers.values()).map((p) => ({
            name: p.name,
            models: p.models.length,
            openai: p.openai,
            anthropic: p.anthropic,
          })),
          aliases: Array.from(env.aliases.keys()),
        });
      }

      // List models (from aliases)
      if (path === "/v1/models" && method === "GET") {
        const data = Array.from(env.aliases.values()).map((alias) => ({
          id: alias.name,
          object: "model",
          created: Date.now(),
          owned_by: alias.targets[0]?.provider || "unknown",
        }));
        return sendJson(res, { object: "list", data });
      }

      // Chat completions
      if (path === "/v1/chat/completions" && method === "POST") {
        const rawBody = await parseBody(req);
        let body: { model?: string };
        try {
          body = JSON.parse(rawBody) as { model?: string };
        } catch {
          return sendError(
            res,
            "Invalid JSON in request body",
            400,
            "invalid_json"
          );
        }

        const aliasName = body.model?.toLowerCase();
        if (!aliasName) {
          return sendError(
            res,
            "Missing 'model' field in request body",
            400,
            "missing_model"
          );
        }

        const alias = env.aliases.get(aliasName);
        if (!alias) {
          return sendJson(
            res,
            { error: `Unknown model: ${aliasName}` },
            404
          );
        }

        return proxyWithFallback(alias, body, env.providers, res);
      }

      // Anthropic messages endpoint
      if (path === "/v1/messages" && method === "POST") {
        const rawBody = await parseBody(req);
        let body: { model?: string };
        try {
          body = JSON.parse(rawBody) as { model?: string };
        } catch {
          return sendError(
            res,
            "Invalid JSON in request body",
            400,
            "invalid_json"
          );
        }

        const aliasName = body.model?.toLowerCase();
        if (!aliasName) {
          return sendError(
            res,
            "Missing 'model' field in request body",
            400,
            "missing_model"
          );
        }

        const alias = env.aliases.get(aliasName);
        if (!alias) {
          return sendJson(
            res,
            { error: `Unknown model: ${aliasName}` },
            404
          );
        }

        return proxyWithFallback(alias, body, env.providers, res);
      }

      return sendError(res, "Not found", 404, "not_found");
    } catch (err) {
      console.error("Request handling error:", err);
      const message =
        err instanceof Error ? err.message : "Internal server error";
      const sanitizedMessage = message.includes("body too large")
        ? "Request body too large"
        : "Internal server error";
      sendError(res, sanitizedMessage, 500, "internal_error");
    }
  };
}

export async function startServer(
  port: number
): Promise<{ port: number; stop: () => void }> {
  // Load environment and discover providers
  const env = loadEnv();
  await discoverProviders(env.providers);

  const server = http.createServer(createRequestHandler(env));

  return new Promise((resolve, reject) => {
    server.on("error", (err: NodeJS.ErrnoException) => {
      reject(err);
    });

    server.listen(port, "127.0.0.1", () => {
      const addr = server.address();
      const actualPort = typeof addr === "object" && addr ? addr.port : port;
      console.log(`Mini-Passy running on http://127.0.0.1:${actualPort}`);
      console.log(`Aliases: ${Array.from(env.aliases.keys()).join(", ")}`);
      resolve({
        port: actualPort,
        stop: () => {
          server.closeAllConnections?.();
          server.close();
        },
      });
    });
  });
}
