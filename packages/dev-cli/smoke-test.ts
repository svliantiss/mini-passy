import http from "node:http";
import { miniLLM } from "../sdk/src/index.js";

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
  duration: number;
}

const results: TestResult[] = [];

function httpRequest(
  method: string,
  url: string,
  body?: unknown
): Promise<{ status: number; data: string; headers: http.IncomingHttpHeaders }> {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const payload = body ? JSON.stringify(body) : undefined;

    const req = http.request(
      {
        hostname: urlObj.hostname,
        port: urlObj.port,
        path: urlObj.pathname,
        method,
        headers: payload
          ? {
              "Content-Type": "application/json",
              "Content-Length": Buffer.byteLength(payload),
            }
          : undefined,
      },
      (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () =>
          resolve({ status: res.statusCode || 200, data, headers: res.headers })
        );
      }
    );

    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function test(name: string, fn: () => Promise<void>) {
  const start = Date.now();
  try {
    await fn();
    const duration = Date.now() - start;
    results.push({ name, passed: true, duration });
    console.log(`✅ ${name} (${duration}ms)`);
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    const duration = Date.now() - start;
    results.push({ name, passed: false, error, duration });
    console.log(`❌ ${name} (${duration}ms): ${error}`);
  }
}

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

async function runSmokeTests() {
  console.log("\nMini-LLM Smoke Tests\n");
  console.log("Starting gateway via SDK (embedded inside the app)...");

  // Start gateway
  await miniLLM.ready();
  const baseUrl = miniLLM.url;
  console.log(`Gateway running at: ${baseUrl}`);

  const openaiKeyCount = (process.env.OPENAI_API_KEYS
    ? process.env.OPENAI_API_KEYS.split(",").filter((k) => k.trim().length > 0).length
    : process.env.OPENAI_API_KEY
    ? 1
    : 0);

  const anthropicKeyCount = (process.env.ANTHROPIC_API_KEYS
    ? process.env.ANTHROPIC_API_KEYS.split(",").filter((k) => k.trim().length > 0).length
    : process.env.ANTHROPIC_API_KEY
    ? 1
    : 0);

  console.log("\nEnvironment summary:");
  console.log(`  OpenAI keys configured: ${openaiKeyCount}`);
  console.log(`  Anthropic keys configured: ${anthropicKeyCount}`);

  console.log("\nRunning endpoint smoke tests...\n");

  console.log("[1] Health & models");

  // Test 1: Health endpoint
  await test("GET /health returns ok", async () => {
    const res = await httpRequest("GET", `${baseUrl}/health`);
    assert(res.status === 200, `Expected 200, got ${res.status}`);
    const json = JSON.parse(res.data);
    assert(json.status === "ok", `Expected status ok, got ${json.status}`);
  });

  // Test 2: Models endpoint (without API key, should error gracefully)
  await test("GET /v1/models responds", async () => {
    const res = await httpRequest("GET", `${baseUrl}/v1/models`);
    // Either returns models or error about missing key
    assert(res.status === 200 || res.status === 500, `Unexpected status ${res.status}`);
  });

  console.log("\n[2] OpenAI chat completions (/v1)\n");

  // Test 3: Chat completions endpoint structure
  await test("POST /v1/chat/completions accepts request", async () => {
    const res = await httpRequest("POST", `${baseUrl}/v1/chat/completions`, {
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: "test" }],
      stream: false,
    });
    // Should return response (error about quota/key/rate is fine, means routing works)
    assert([200, 400, 401, 429, 500].includes(res.status), `Unexpected status ${res.status}`);
    const json = JSON.parse(res.data);
    assert("error" in json || "choices" in json, "Response should have error or choices");
  });

  // Test 4: Streaming endpoint returns correct headers
  await test("POST /v1/chat/completions streaming returns SSE headers", async () => {
    const res = await httpRequest("POST", `${baseUrl}/v1/chat/completions`, {
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: "test" }],
      stream: true,
    });
    // Check content-type for streaming
    const contentType = res.headers["content-type"] || "";
    assert(
      contentType.includes("text/event-stream") || contentType.includes("application/json"),
      `Expected SSE or JSON content-type, got ${contentType}`
    );
  });

  console.log("\n[3] Anthropic messages (/v1)\n");

  // Test 5: Anthropic endpoint
  await test("POST /v1/messages accepts Anthropic format", async () => {
    const res = await httpRequest("POST", `${baseUrl}/v1/messages`, {
      model: "claude-3-haiku-20240307",
      messages: [{ role: "user", content: "test" }],
      max_tokens: 10,
    });
    // 401/400 means routing works but auth failed (expected with dummy key)
    assert([200, 400, 401, 429, 500].includes(res.status), `Unexpected status ${res.status}`);
  });

  console.log("\n[4] Routing invariants & safety checks\n");

  // Test 6: 404 for unknown routes
  await test("GET /unknown returns 404", async () => {
    const res = await httpRequest("GET", `${baseUrl}/unknown`);
    assert(res.status === 404, `Expected 404, got ${res.status}`);
  });

  // Test 7: Gateway URL is local (no external gateway)
  await test("Gateway URL is localhost (no external gateway)", async () => {
    assert(
      baseUrl.includes("127.0.0.1") || baseUrl.includes("localhost"),
      `Expected local URL, got ${baseUrl}`
    );
  });

  // Test 8: Single gateway process
  await test("SDK returns same URL on multiple ready() calls", async () => {
    const url1 = miniLLM.url;
    await miniLLM.ready();
    const url2 = miniLLM.url;
    assert(url1 === url2, `URLs differ: ${url1} vs ${url2}`);
  });

  console.log("\n[5] Batch behavior (multiple OpenAI requests)\n");

  // Test 9: Batch OpenAI chat completions (sequential, to observe stability and aggregate latency)
  await test("Batch POST /v1/chat/completions (3 sequential requests)", async () => {
    const prompts = ["one", "two", "three"];

    for (const p of prompts) {
      const res = await httpRequest("POST", `${baseUrl}/v1/chat/completions`, {
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: `batch test: ${p}` }],
        stream: false,
      });

      assert(
        [200, 400, 401, 429, 500].includes(res.status),
        `Unexpected status ${res.status} for prompt ${p}`
      );
    }
  });

  // Summary
  console.log("\n" + "=".repeat(50));
  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;
  console.log(`\n📊 Results: ${passed} passed, ${failed} failed\n`);

  if (results.length > 0) {
    const totalDuration = results.reduce((sum, r) => sum + r.duration, 0);
    const avgDuration = Math.round(totalDuration / results.length);
    const slowest = results.reduce((a, b) => (b.duration > a.duration ? b : a));
    console.log("Performance summary:");
    console.log(`  Total test time: ${totalDuration}ms`);
    console.log(`  Average per test: ${avgDuration}ms`);
    console.log(
      `  Slowest test: ${slowest.name} (${slowest.duration}ms)`
    );
  }

  if (failed > 0) {
    console.log("Failed tests:");
    results
      .filter((r) => !r.passed)
      .forEach((r) => console.log(`  - ${r.name}: ${r.error}`));
  }

  // Cleanup
  await miniLLM.stop();
  console.log("\n✨ Smoke tests complete\n");

  process.exit(failed > 0 ? 1 : 0);
}

runSmokeTests().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
