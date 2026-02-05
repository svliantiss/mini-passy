import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { existsSync } from "node:fs";
import { waitForHealth } from "./port.js";
const DEFAULT_PORT = 3333;
let gatewayProcess = null;
let gatewayPort = null;
let readyPromise = null;
function getGatewayEntryPath() {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = dirname(__filename);
    // Try to find the built JS version first (for production), fallback to TS (for development)
    const builtPath = join(__dirname, "../../gateway/dist/index.js");
    const sourcePath = join(__dirname, "../../gateway/src/index.ts");
    // Check if built version exists
    if (existsSync(builtPath)) {
        return { path: builtPath, useNode: true };
    }
    return { path: sourcePath, useNode: false };
}
function spawnGateway(config) {
    return new Promise((resolve, reject) => {
        const port = config.port || DEFAULT_PORT;
        const { path: gatewayEntry, useNode } = getGatewayEntryPath();
        const env = {
            ...process.env,
            PORT: String(port),
            ...config.env,
        };
        // Use node for built JS, tsx for TypeScript source
        const command = useNode ? "node" : "npx";
        const args = useNode ? [gatewayEntry] : ["tsx", gatewayEntry];
        gatewayProcess = spawn(command, args, {
            env,
            stdio: ["ignore", "pipe", "pipe"],
        });
        let actualPort = port;
        let resolved = false;
        gatewayProcess.stdout?.on("data", (data) => {
            const output = data.toString();
            const match = output.match(/running on http:\/\/127\.0\.0\.1:(\d+)/);
            if (match && !resolved) {
                actualPort = parseInt(match[1], 10);
                resolved = true;
                resolve(actualPort);
            }
        });
        gatewayProcess.stderr?.on("data", (data) => {
            if (!resolved) {
                console.error("Gateway stderr:", data.toString());
            }
        });
        gatewayProcess.on("error", (err) => {
            if (!resolved) {
                resolved = true;
                reject(err);
            }
        });
        gatewayProcess.on("exit", (code) => {
            if (!resolved) {
                resolved = true;
                reject(new Error(`Gateway exited with code ${code}`));
            }
        });
        // Timeout after 10 seconds
        setTimeout(() => {
            if (!resolved) {
                resolved = true;
                resolve(actualPort);
            }
        }, 10000);
    });
}
async function ensureGateway(config) {
    if (gatewayPort !== null) {
        // Check if existing gateway is still healthy
        const healthy = await waitForHealth(gatewayPort, 3, 100);
        if (healthy)
            return;
        // Gateway died, restart it
        cleanup();
    }
    const port = await spawnGateway(config);
    const healthy = await waitForHealth(port, 50, 100);
    if (!healthy) {
        throw new Error("Gateway failed to start");
    }
    gatewayPort = port;
}
function cleanup() {
    if (gatewayProcess) {
        gatewayProcess.kill();
        gatewayProcess = null;
        gatewayPort = null;
    }
}
// Register cleanup handlers
process.on("exit", cleanup);
process.on("SIGINT", () => {
    cleanup();
    process.exit(0);
});
process.on("SIGTERM", () => {
    cleanup();
    process.exit(0);
});
export function createMiniPassy(config = {}) {
    return {
        ready() {
            if (!readyPromise) {
                readyPromise = ensureGateway(config);
            }
            return readyPromise;
        },
        get url() {
            if (gatewayPort === null) {
                throw new Error("Gateway not ready. Call ready() first.");
            }
            return `http://127.0.0.1:${gatewayPort}`;
        },
        async stop() {
            cleanup();
            readyPromise = null;
        },
    };
}
//# sourceMappingURL=gateway-manager.js.map