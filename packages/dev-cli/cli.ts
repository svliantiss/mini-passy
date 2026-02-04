#!/usr/bin/env npx tsx
import { miniLLM } from "../sdk/src/index.js";

const args = process.argv.slice(2);
const command = args[0];

async function main() {
  switch (command) {
    case "start":
      await miniLLM.ready();
      console.log(`Mini-LLM gateway started at: ${miniLLM.url}`);
      console.log("Press Ctrl+C to stop");
      // Keep process alive
      await new Promise(() => {});
      break;

    case "health":
      await miniLLM.ready();
      console.log(`Gateway: ${miniLLM.url}`);
      const http = await import("node:http");
      http.get(`${miniLLM.url}/health`, (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          console.log("Health:", data);
          miniLLM.stop();
        });
      });
      break;

    case "test":
      console.log("Running smoke tests...");
      await import("./smoke-test.js");
      break;

    default:
      console.log(`
Mini-LLM Dev CLI

Usage:
  mini-llm-dev start    Start the gateway
  mini-llm-dev health   Check gateway health
  mini-llm-dev test     Run smoke tests
`);
  }
}

main().catch(console.error);
