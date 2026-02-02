import { startServer, env } from "./server.js";

const port = env.port;

async function main() {
  let currentPort = port;

  // Try to bind, auto-increment if occupied
  for (let attempt = 0; attempt < 10; attempt++) {
    try {
      const server = await startServer(currentPort);
      console.log(`mini-llm-gateway running on http://127.0.0.1:${server.port}`);
      return;
    } catch (e: unknown) {
      if (
        e instanceof Error &&
        "code" in e &&
        (e as NodeJS.ErrnoException).code === "EADDRINUSE"
      ) {
        currentPort++;
      } else {
        throw e;
      }
    }
  }

  console.error("Failed to start gateway: all ports occupied");
  process.exit(1);
}

main();
