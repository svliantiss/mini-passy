import { createMiniPassy } from "./gateway-manager.js";

export type { MiniPassyConfig, MiniPassyInstance } from "./types.js";
export { createMiniPassy } from "./gateway-manager.js";

// Default singleton instance
export const miniPassy = createMiniPassy();
