import http from "node:http";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { miniLLM } from "../sdk/src/index.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = 4000;

async function main() {
  // Start the mini-llm gateway
  await miniLLM.ready();
  console.log(`Mini-LLM gateway ready at: ${miniLLM.url}`);

  const server = http.createServer(async (req, res) => {
    const url = req.url || "/";

    // Serve the HTML UI
    if (url === "/" && req.method === "GET") {
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(readFileSync(join(__dirname, "index.html"), "utf-8"));
      return;
    }

    // API: Stream chat completion
    if (url === "/api/chat" && req.method === "POST") {
      let body = "";
      req.on("data", (chunk) => (body += chunk));
      req.on("end", async () => {
        try {
          const { message, model } = JSON.parse(body);

          // Proxy to mini-llm gateway
          const payload = JSON.stringify({
            model: model || "gpt-4o-mini",
            messages: [{ role: "user", content: message }],
            stream: true,
          });

          const gatewayUrl = new URL(`${miniLLM.url}/v1/chat/completions`);

          const proxyReq = http.request(
            {
              hostname: gatewayUrl.hostname,
              port: gatewayUrl.port,
              path: gatewayUrl.pathname,
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "Content-Length": Buffer.byteLength(payload),
              },
            },
            (proxyRes) => {
              res.writeHead(proxyRes.statusCode || 200, {
                "Content-Type": "text/event-stream",
                "Cache-Control": "no-cache",
                Connection: "keep-alive",
              });
              // Stream passthrough
              proxyRes.pipe(res);
            }
          );

          proxyReq.on("error", (err) => {
            res.writeHead(500, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: err.message }));
          });

          proxyReq.write(payload);
          proxyReq.end();
        } catch (err) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Invalid request" }));
        }
      });
      return;
    }

    res.writeHead(404);
    res.end("Not found");
  });

  server.listen(PORT, () => {
    console.log(`Test app running at http://localhost:${PORT}`);
  });

  // Cleanup on exit
  process.on("SIGINT", async () => {
    await miniLLM.stop();
    server.close();
    process.exit(0);
  });
}

main().catch(console.error);
