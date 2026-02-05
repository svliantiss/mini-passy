import { config } from "dotenv";
import { resolve } from "path";
import { startServer } from "./server.js";
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
        }
        catch (e) {
            if (e instanceof Error &&
                "code" in e &&
                e.code === "EADDRINUSE") {
                currentPort++;
            }
            else {
                throw e;
            }
        }
    }
    console.error("Failed to start Mini-Passy: all ports occupied");
    process.exit(1);
}
main();
//# sourceMappingURL=index.js.map