import http from "node:http";
import { miniLLM } from "../sdk/src/index.js";

function httpGet(url: string): Promise<{ status: number; data: string }> {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => resolve({ status: res.statusCode || 200, data }));
    }).on("error", reject);
  });
}

function httpPost(
  url: string,
  body: unknown,
  onData?: (chunk: string) => void
): Promise<{ status: number; data: string }> {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const payload = JSON.stringify(body);

    const req = http.request(
      {
        hostname: urlObj.hostname,
        port: urlObj.port,
        path: urlObj.pathname,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(payload),
        },
      },
      (res) => {
        let data = "";
        res.on("data", (chunk) => {
          data += chunk;
          if (onData) onData(chunk.toString());
        });
        res.on("end", () => resolve({ status: res.statusCode || 200, data }));
      }
    );

    req.on("error", reject);
    req.write(payload);
    req.end();
  });
}

function countKeys(single?: string, multiple?: string): number {
  if (multiple && multiple.trim().length > 0) {
    return multiple
      .split(",")
      .map((k) => k.trim())
      .filter((k) => k.length > 0).length;
  }
  if (single && single.trim().length > 0) return 1;
  return 0;
}

async function main() {
  console.log("\nMini-LLM Plain Demo\n");

  // Wait for gateway to be ready
  console.log("Starting gateway via SDK (embedded)...");
  await miniLLM.ready();
  const baseUrl = miniLLM.url;
  console.log(`Gateway ready at: ${baseUrl}`);

  const openaiKeyCount = countKeys(
    process.env.OPENAI_API_KEY,
    process.env.OPENAI_API_KEYS
  );
  const anthropicKeyCount = countKeys(
    process.env.ANTHROPIC_API_KEY,
    process.env.ANTHROPIC_API_KEYS
  );

  console.log("\nEnvironment summary (keys loaded from process.env):");
  console.log(`  OpenAI keys configured: ${openaiKeyCount}`);
  console.log(`  Anthropic keys configured: ${anthropicKeyCount}`);

  // Test health endpoint
  console.log("\n[1] Health check\n");
  const healthRes = await httpGet(`${baseUrl}/health`);
  console.log("/health ->", healthRes.data);

  // OpenAI section
  console.log("\n[2] OpenAI chat completions (via /v1/chat/completions)\n");

  console.log("2a) Streaming response");
  const streamRes = await httpPost(
    `${baseUrl}/v1/chat/completions`,
    {
      model: "gpt-4o-mini", // uses direct model for reliability
      messages: [
        { role: "user", content: "Say hello in 10 words or less." },
      ],
      stream: true,
    },
    (chunk) => process.stdout.write(chunk)
  );

  if (streamRes.status !== 200) {
    console.log("\nOpenAI streaming error:");
    console.log(streamRes.data);
  } else {
    console.log("\n[stream complete]\n");
  }

  console.log("\n2b) Non-streaming response");
  const nonStreamRes = await httpPost(`${baseUrl}/v1/chat/completions`, {
    model: "gpt-4o-mini",
    messages: [{ role: "user", content: "What is 2 + 2?" }],
    stream: false,
  });

  if (nonStreamRes.status !== 200) {
    console.log("OpenAI non-streaming error:");
    console.log(nonStreamRes.data);
  } else {
    try {
      const json = JSON.parse(nonStreamRes.data);
      const content = json.choices?.[0]?.message?.content;
      console.log("Assistant:", content ?? nonStreamRes.data);
    } catch {
      console.log("Raw response:", nonStreamRes.data);
    }
  }

  // Anthropic section
  console.log("\n[3] Anthropic messages (via /v1/messages)\n");

  if (anthropicKeyCount === 0) {
    console.log(
      "ANTHROPIC_API_KEY(S) not configured. Skipping Anthropic demo section."
    );
  } else {
    const anthropicRes = await httpPost(`${baseUrl}/v1/messages`, {
      model: "claude-3-haiku-20240307",
      messages: [{ role: "user", content: "Say hello from Anthropic." }],
      max_tokens: 50,
      stream: false,
    });

    if (anthropicRes.status !== 200) {
      console.log("Anthropic error:");
      console.log(anthropicRes.data);
    } else {
      try {
        const json = JSON.parse(anthropicRes.data);
        console.log("Anthropic response:");
        console.log(JSON.stringify(json, null, 2));
      } catch {
        console.log("Raw response:", anthropicRes.data);
      }
    }
  }

  // Cleanup
  await miniLLM.stop();
  console.log("\nDemo complete.\n");
}

main().catch((err) => {
  console.error("Demo error:", err);
});
