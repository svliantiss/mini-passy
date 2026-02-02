import { createMiniLLM } from "./gateway-manager.js";

export type { MiniLLMConfig, MiniLLMInstance } from "./types.js";
export { createMiniLLM } from "./gateway-manager.js";

// Default singleton instance
export const miniLLM = createMiniLLM();
