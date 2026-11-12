import { ModelRuntime } from "@earendil-works/pi-coding-agent";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defaultMiniMaxModel } from "./minimax-models.js";
export const serviceDir = resolve(
  fileURLToPath(new URL("..", import.meta.url)),
);
export const agentDir = resolve(process.env.HEALTH_AGENT_DIR || join(serviceDir, ".pi-agent"));
export const modelReady = ModelRuntime.create({
  authPath: join(agentDir, "auth.json"),
  modelsPath: null,
  refreshOnCreate: false,
}).then((models) => {
  // The pinned SDK catalog predates M3.1. Register its actual wire ID and
  // adaptive-thinking contract locally without changing the shared SDK.
  models.registerProvider("minimax-cn", {
    api: "anthropic-messages",
    baseUrl: "https://api.minimax.cn/anthropic",
    models: [
      ...Array.from(models.getModels()).filter((model) => model.provider === "minimax-cn"),
      {
        id: defaultMiniMaxModel,
        name: defaultMiniMaxModel,
        reasoning: true,
        input: ["text", "image"],
        // Pricing is not used for billing here; do not inherit M3 prices.
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        contextWindow: 1_000_000,
        maxTokens: 16_384,
        compat: { forceAdaptiveThinking: true },
      },
    ],
  });
  if (!models.getModel("minimax-cn", defaultMiniMaxModel))
    throw Error("MiniMax model unavailable");
  return models;
});
