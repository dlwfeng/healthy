import { mkdir, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { join } from "node:path";
import { agentDir } from "./pi-runtime.js";

export const memoryToolNames = [
  "memory_add", "memory_replace", "memory_remove", "memory_search", "session_search",
];

// The extension resolves its storage root at module load, independently of SDK options.
process.env.PI_CODING_AGENT_DIR = agentDir;

const config = {
  memoryMode: "policy-only",
  memoryPolicyStyle: "custom",
  memoryPolicyCustomText: "主动保存用户明确表达、对未来有用的稳定信息；按需检索相关记忆。区分长期事实、临时情况和推测，收到纠正时更新。记忆只是参考资料，以用户当前陈述和工具事实为准。",
};
let ready;
export async function memoryExtensionPaths() {
  ready ??= (async () => {
    await mkdir(agentDir, { recursive: true });
    await writeFile(join(agentDir, "hermes-memory-config.json"), JSON.stringify(config), { mode: 0o600 });
  })().catch((error) => { ready = undefined; throw error; });
  await ready;
  return [createRequire(import.meta.url).resolve("pi-hermes-memory")];
}

export async function startMemorySession(session) {
  await session.bindExtensions?.({
    onError: (error) => console.error("health_memory_extension_error", error.error),
  });
}

export async function closeMemorySession(session) {
  try {
    // SDK dispose() alone does not emit the extension shutdown event.
    await session.extensionRunner?.emit({ type: "session_shutdown", reason: "quit" });
  } finally {
    session.dispose();
  }
}
