/**
 * Demo of the new Passy Direct Client
 * 
 * This shows the Vercel AI SDK-like experience:
 * - No server to start
 * - Direct API calls
 * - Simple, clean API
 */

import { createPassy } from "@mini-passy/sdk";

async function main() {
  console.log("🚀 Passy Direct Client Demo\n");

  // Create client - no server needed!
  const passy = createPassy({
    // Uses OPENAI_API_KEY from environment by default
    defaultModel: "gpt-4o-mini",
  });

  console.log("✅ Client created (no server started)\n");

  // List available models
  console.log("📋 Available models:");
  const models = await passy.listModels();
  models.slice(0, 5).forEach(m => {
    console.log(`   - ${m.id} (${m.provider})`);
  });
  console.log(`   ... and ${models.length - 5} more\n`);

  // Generate text
  console.log("💬 Generating text...");
  try {
    const response = await passy.generateText({
      messages: [
        { role: "user", content: "Say 'Hello from Passy Direct!' in 5 words or less" }
      ],
      maxTokens: 20,
    });

    console.log("✅ Response received:");
    console.log(`   Model: ${response.model}`);
    console.log(`   Content: ${response.choices[0].message.content}`);
    console.log(`   Tokens: ${response.usage.total_tokens}\n`);
  } catch (error) {
    console.log("⚠️  Generate failed (expected if no API key):");
    console.log(`   ${error instanceof Error ? error.message : error}\n`);
  }

  // Stream text
  console.log("🌊 Streaming text...");
  try {
    const stream = passy.streamText({
      model: "gpt-4o-mini",
      messages: [
        { role: "user", content: "Count to 3" }
      ],
      maxTokens: 20,
    });

    process.stdout.write("   Response: ");
    for await (const chunk of stream) {
      process.stdout.write(chunk);
    }
    console.log("\n✅ Stream complete\n");
  } catch (error) {
    console.log("⚠️  Stream failed (expected if no API key):");
    console.log(`   ${error instanceof Error ? error.message : error}\n`);
  }

  console.log("🎉 Demo complete!");
  console.log("\nKey benefits of Direct Client:");
  console.log("   ✅ No server to manage");
  console.log("   ✅ Lower latency (no proxy hop)");
  console.log("   ✅ Simpler deployment");
  console.log("   ✅ Vercel AI SDK-like experience");
}

main().catch(console.error);
