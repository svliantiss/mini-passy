import http from "node:http";
import { miniLLM } from "../sdk/src/index.js";

interface BenchResult {
  provider: "mini-llm" | "bifrost";
  size: "small" | "medium" | "large";
  status: number;
  duration: number;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  error?: string;
}

function httpPost(
  url: string,
  body: unknown,
  extraHeaders?: http.OutgoingHttpHeaders
): Promise<{ status: number; data: string }> {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const payload = JSON.stringify(body);

    const req = http.request(
      {
        hostname: urlObj.hostname,
        port: urlObj.port || 80,
        path: urlObj.pathname,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(payload),
          ...extraHeaders,
        },
      },
      (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () =>
          resolve({ status: res.statusCode || 200, data })
        );
      }
    );

    req.on("error", reject);
    req.write(payload);
    req.end();
  });
}

function getPrompts() {
  const small = "Say hello in one short sentence.";

  const medium =
    "Explain what a binary search tree is and give a short example in plain text.";

  const largeBase =
    "Explain in detail how a modern LLM gateway works, including routing, streaming, and provider abstraction. Focus on architecture and performance considerations.";
  const large = Array.from({ length: 8 }, () => largeBase).join(" ");

  return {
    small,
    medium,
    large,
  } as const;
}

async function runForProvider(
  label: "mini-llm" | "bifrost",
  baseUrl: string,
  model: string
): Promise<BenchResult[]> {
  const prompts = getPrompts();
  const results: BenchResult[] = [];

  for (const [size, content] of Object.entries(prompts) as [
    "small" | "medium" | "large",
    string
  ][]) {
    const url = `${baseUrl}/chat/completions`;
    const body = {
      model,
      messages: [{ role: "user", content }],
      stream: false,
    };

    const start = Date.now();
    try {
      const res = await httpPost(url, body);
      const duration = Date.now() - start;

      let promptTokens: number | undefined;
      let completionTokens: number | undefined;
      let totalTokens: number | undefined;

      try {
        const parsed = JSON.parse(res.data);
        if (parsed && typeof parsed === "object" && parsed.usage) {
          promptTokens = parsed.usage.prompt_tokens;
          completionTokens = parsed.usage.completion_tokens;
          totalTokens = parsed.usage.total_tokens;
        }
      } catch {
        // Ignore JSON/usage parsing errors; this is just for extra metrics.
      }

      results.push({
        provider: label,
        size,
        status: res.status,
        duration,
        promptTokens,
        completionTokens,
        totalTokens,
      });
    } catch (err) {
      const duration = Date.now() - start;
      results.push({
        provider: label,
        size,
        status: 0,
        duration,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return results;
}

async function main() {
  console.log("\nMini-LLM vs Bifrost benchmark (non-streaming)\n");

  const model = process.env.BENCH_MODEL || "gpt-4o-mini";

  // Start Mini-LLM gateway via SDK
  console.log("Starting embedded Mini-LLM gateway via SDK...");
  await miniLLM.ready();
  const miniBase =
    process.env.MINI_LLM_BASE_URL || `${miniLLM.url}/openai/v1`;
  console.log(`Mini-LLM base URL: ${miniBase}`);

  const bifrostBase =
    process.env.BIFROST_BASE_URL || "http://127.0.0.1:8080/openai/v1";
  console.log(`Bifrost base URL:   ${bifrostBase}`);

  console.log("\nRunning benchmark with 3 prompts (small, medium, large)...\n");

  const miniResults = await runForProvider("mini-llm", miniBase, model);

  // For Bifrost, treat BIFROST_API_KEY as a virtual key and send it
  // via the governance header x-bf-vk, so that Bifrost uses its
  // configured provider API keys instead of forwarding our auth
  // header directly to OpenAI.
  const bifrostHeaders = process.env.BIFROST_API_KEY
    ? { "x-bf-vk": process.env.BIFROST_API_KEY }
    : undefined;

  const origHttpPost = httpPost;
  async function runBifrostWithAuth(
    baseUrl: string,
    mdl: string
  ): Promise<BenchResult[]> {
    const prompts = getPrompts();
    const results: BenchResult[] = [];

    for (const [size, content] of Object.entries(prompts) as [
      "small" | "medium" | "large",
      string
    ][]) {
      const url = `${baseUrl}/chat/completions`;
      const body = {
        model: mdl,
        messages: [{ role: "user", content }],
        stream: false,
      };

      const start = Date.now();
      try {
        const res = await origHttpPost(url, body, bifrostHeaders);
        const duration = Date.now() - start;

        let promptTokens: number | undefined;
        let completionTokens: number | undefined;
        let totalTokens: number | undefined;

        try {
          const parsed = JSON.parse(res.data);
          if (parsed && typeof parsed === "object" && parsed.usage) {
            promptTokens = parsed.usage.prompt_tokens;
            completionTokens = parsed.usage.completion_tokens;
            totalTokens = parsed.usage.total_tokens;
          }
        } catch {
          // Ignore JSON/usage parsing errors; this is just for extra metrics.
        }

        results.push({
          provider: "bifrost",
          size,
          status: res.status,
          duration,
          promptTokens,
          completionTokens,
          totalTokens,
        });
      } catch (err) {
        const duration = Date.now() - start;
        results.push({
          provider: "bifrost",
          size,
          status: 0,
          duration,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    return results;
  }

  const bifrostResults = await runBifrostWithAuth(bifrostBase, model);

  const all = [...miniResults, ...bifrostResults];

  const header =
    "Provider     Size     Status   Duration (ms)  Prompt  Completion  Total";
  console.log(header);
  console.log("-".repeat(header.length));

  for (const r of all) {
    const name = r.provider.padEnd(11, " ");
    const size = r.size.padEnd(10, " ");
    const status = String(r.status).padEnd(8, " ");
    const duration = String(r.duration).padEnd(15, " ");
    const prompt = (r.promptTokens ?? "-").toString().padEnd(7, " ");
    const completion = (r.completionTokens ?? "-")
      .toString()
      .padEnd(11, " ");
    const total = (r.totalTokens ?? "-").toString().padEnd(5, " ");
    console.log(
      `${name} ${size} ${status} ${duration}${prompt} ${completion} ${total} ${
        r.error ?? ""
      }`
    );
  }

  const byProvider: Record<string, BenchResult[]> = {
    "mini-llm": [],
    bifrost: [],
  };
  for (const r of all) {
    byProvider[r.provider].push(r);
  }

  console.log("\nSummary (average durations):");
  for (const [provider, rows] of Object.entries(byProvider)) {
    if (rows.length === 0) continue;
    const avg =
      rows.reduce((sum, r) => sum + r.duration, 0) / rows.length;
    console.log(`  ${provider}: ${Math.round(avg)}ms (n=${rows.length})`);
  }

  await miniLLM.stop();
}

main().catch((err) => {
  console.error("Benchmark error:", err);
  process.exit(1);
});
