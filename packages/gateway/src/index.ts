#!/usr/bin/env node
import { config } from "dotenv";
import { resolve } from "path";
import { startServer } from "./server.js";

// Export for programmatic use
export { startServer } from "./server.js";
export { loadEnv } from "./env.js";
export { discoverProviders } from "./discovery.js";
export { proxyWithFallback } from "./proxy.js";
export type { EnvConfig, Provider, Alias } from "./types.js";

// Load .env from project root (wherever the command is run from)
const envPath = resolve(process.cwd(), ".env");
config({ path: envPath });

const port = parseInt(process.env.PORT || "3333", 10);

async function main() {
  let currentPort = port;

  // Try to bind, auto-increment if occupied
  for (let attempt = 0; attempt < 10; attempt++) {
    try {
      const server = await startServer(currentPort);
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

  console.error("Failed to start Mini-Passy: all ports occupied");
  process.exit(1);
}

// Only run main if this is the entry point
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
