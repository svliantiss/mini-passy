import http from "node:http";
export async function isPortAvailable(port) {
    return new Promise((resolve) => {
        const req = http.get(`http://127.0.0.1:${port}/health`, () => {
            resolve(false); // Port is in use
        });
        req.on("error", () => {
            resolve(true); // Port is available
        });
        req.setTimeout(500, () => {
            req.destroy();
            resolve(true);
        });
    });
}
export async function findAvailablePort(startPort) {
    let port = startPort;
    for (let i = 0; i < 10; i++) {
        if (await isPortAvailable(port)) {
            return port;
        }
        port++;
    }
    throw new Error("No available port found");
}
export async function waitForHealth(port, maxAttempts = 50, intervalMs = 100) {
    for (let i = 0; i < maxAttempts; i++) {
        const healthy = await checkHealth(port);
        if (healthy)
            return true;
        await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }
    return false;
}
function checkHealth(port) {
    return new Promise((resolve) => {
        const req = http.get(`http://127.0.0.1:${port}/health`, (res) => {
            let data = "";
            res.on("data", (chunk) => (data += chunk));
            res.on("end", () => {
                try {
                    const json = JSON.parse(data);
                    resolve(json.status === "ok");
                }
                catch {
                    resolve(false);
                }
            });
        });
        req.on("error", () => resolve(false));
        req.setTimeout(500, () => {
            req.destroy();
            resolve(false);
        });
    });
}
//# sourceMappingURL=port.js.map