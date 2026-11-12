import { Type } from "@sinclair/typebox";
import { READ_TOOLS, WRITE_TOOLS } from "./garmin.js";

const TRAINING_TOOLS = new Set(["create_workout", "schedule_workout"]);
const ADDITIONAL_WRITES = WRITE_TOOLS.filter((name) => !TRAINING_TOOLS.has(name));

export async function makeGarminTools(garmin, { limit = 40, includeWrites = false } = {}) {
  const catalog = await garmin.listTools();
  const definitions = new Map(catalog.map((tool) => [tool.name, tool]));
  const allowedNames = [...READ_TOOLS, ...(includeWrites ? ADDITIONAL_WRITES : [])];
  let calls = 0;
  let writes = 0;
  return allowedNames.map((name) => {
    const source = definitions.get(name);
    if (!source) throw new Error(`Garmin MCP tool unavailable: ${name}`);
    const isWrite = ADDITIONAL_WRITES.includes(name);
    const writeGuidance = {
      set_activity_type: "This changes an existing Garmin activity. Call only when the user explicitly asks to change its type.",
      fix_badminton_activity_types: "This can change existing Garmin activity types. First use dry_run=true to show candidates; only apply changes when the user explicitly requests them.",
      sync_latest_data: "This requests a Garmin data sync. Call only when the user explicitly asks to sync.",
    }[name];
    return {
      name,
      label: `Garmin ${name}`,
      description: isWrite ? `${source.description} ${writeGuidance}` : `Read Garmin data: ${source.description}`,
      promptSnippet: source.description,
      namespace: "garmin",
      annotations: {
        readOnlyHint: !isWrite,
        destructiveHint: false,
        idempotentHint: !isWrite,
        openWorldHint: false,
      },
      parameters: Type.Unsafe(source.inputSchema),
      execute: async (_id, args) => {
        if (++calls > limit) throw new Error("Garmin query limit reached");
        if (isWrite && ++writes > 4) throw new Error("Garmin write limit reached");
        const result = await garmin.call(name, args);
        return { content: [{ type: "text", text: JSON.stringify(result) }] };
      },
    };
  });
}
