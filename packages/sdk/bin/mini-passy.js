#!/usr/bin/env node
import { createRequire } from "module";
import { spawn } from "child_process";

const require = createRequire(import.meta.url);
const gatewayPath = require.resolve("@mini-passy/sdk/dist/index.js");

// Spawn the gateway process
const proc = spawn("node", [gatewayPath], {
  stdio: "inherit",
  env: process.env,
});

proc.on("exit", (code) => {
  process.exit(code || 0);
});
