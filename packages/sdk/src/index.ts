import { createMiniPassy } from "./gateway-manager.js";
import { createPassy } from "./direct-client.js";

export type { 
  MiniPassyConfig, 
  MiniPassyInstance,
  PassyConfig,
  GenerateOptions,
  StreamOptions,
  GenerateResponse,
  ModelInfo,
  Message,
} from "./types.js";
export { createMiniPassy } from "./gateway-manager.js";
export { createPassy } from "./direct-client.js";

// Default singleton instances
export const miniPassy = createMiniPassy();
export const passy = createPassy();
