import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";

const mcpUrl = new URL(process.env.GARMIN_MCP_URL || "http://127.0.0.1:8765/mcp");

// Explicit API-side catalog guard. Schemas and descriptions come from MCP at session setup.
export const READ_TOOLS = Object.freeze([
  "get_full_name",
  "get_unit_system",
  "get_user_profile",
  "get_userprofile_settings",
  "get_user_summary",
  "get_daily_steps",
  "get_steps_data",
  "get_floors",
  "get_heart_rates",
  "get_rhr_day",
  "get_intensity_minutes",
  "get_all_day_stress",
  "get_all_day_events",
  "get_stats",
  "get_stats_and_body",
  "get_max_metrics",
  "get_fitness_age",
  "get_weight_goal",
  "get_cycling_ftp",
  "get_lactate_threshold",
  "get_hrv_data",
  "get_hydration_data",
  "get_weekly_steps",
  "get_weekly_stress",
  "get_progress_summary",
  "get_sleep_data",
  "get_stress_data",
  "get_body_battery",
  "get_body_battery_events",
  "get_body_composition",
  "get_weigh_ins",
  "get_daily_weigh_ins",
  "get_respiration_data",
  "get_spo2_data",
  "get_blood_pressure",
  "get_training_status",
  "get_training_readiness",
  "get_endurance_score",
  "get_hill_score",
  "get_race_predictions",
  "get_activities",
  "get_activities_by_date",
  "get_activities_fordate",
  "get_activity",
  "get_activity_details",
  "get_activity_exercise_sets",
  "get_activity_gear",
  "get_activity_types",
  "get_activity_weather",
  "get_activity_splits",
  "get_activity_split_summaries",
  "get_activity_typed_splits",
  "get_activity_hr_in_timezones",
  "get_last_activity",
  "download_activity",
  "get_workouts",
  "get_workout_by_id",
  "get_calendar",
  "get_personal_record",
  "get_earned_badges",
  "get_goals",
  "get_adhoc_challenges",
  "get_badge_challenges",
  "get_available_badge_challenges",
  "get_non_completed_badge_challenges",
  "get_inprogress_virtual_challenges",
  "get_devices",
  "get_device_settings",
  "get_device_alarms",
  "get_device_solar_data",
  "get_primary_training_device",
  "get_device_last_used",
  "get_gear",
  "get_gear_defaults",
  "get_gear_stats",
  "get_gear_ativities",
  "get_menstrual_calendar",
  "get_menstrual_data",
  "get_pregnancy_summary",
]);
// The profile sync uses this narrower list; get_user_profile is also in the 健康助手 read catalog.
export const PROFILE_READ_TOOLS = Object.freeze([
  "get_user_profile",
]);
export const WRITE_TOOLS = Object.freeze([
  "create_workout",
  "schedule_workout",
  "set_activity_type",
  "fix_badminton_activity_types",
  "sync_latest_data",
  // 仅供 Zepp 体重同步任务使用，不注册给健康助手。
  "add_weigh_in",
]);

export async function configurationStatus() {
  try {
    const response = await fetch(new URL("/health", mcpUrl), {
      signal: AbortSignal.timeout(3000),
    });
    if (!response.ok) return "garmin_unavailable";
    const data = await response.json();
    return data.state === "ready" ? "ready" : "not_configured";
  } catch {
    return "garmin_unavailable";
  }
}

export class GarminMcp {
  #client;
  #transport;
  #connecting;

  async connect() {
    if (this.#client) return this.#client;
    if (this.#connecting) return this.#connecting;
    this.#connecting = (async () => {
      const transport = new StreamableHTTPClientTransport(mcpUrl);
      const client = new Client({ name: "healthy-api", version: "0.1.0" });
      try {
        await client.connect(transport);
        transport.onclose = () => {
          this.#client = undefined;
          this.#transport = undefined;
        };
        this.#client = client;
        this.#transport = transport;
        return client;
      } catch (error) {
        await transport.close();
        throw error;
      }
    })();
    try {
      return await this.#connecting;
    } finally {
      this.#connecting = undefined;
    }
  }

  async listTools() {
    const client = await this.connect();
    return (await client.listTools()).tools;
  }

  async call(name, args) {
    if (![...READ_TOOLS, ...PROFILE_READ_TOOLS, ...WRITE_TOOLS].includes(name)) throw new Error("Tool not allowed");
    const client = await this.connect();
    const result = await client.callTool(
      { name, arguments: args },
      { timeout: 40_000 },
    );
    const text = result.content?.find((part) => part.type === "text")?.text;
    if (result.isError || typeof text !== "string")
      throw new Error("Garmin call failed");
    let value;
    try {
      value = JSON.parse(text);
    } catch {
      throw new Error("Garmin returned invalid JSON");
    }
    if (value && typeof value === "object" && typeof value.error === "string")
      throw new Error("Garmin call failed");
    return value;
  }

  async close() {
    const client = this.#client;
    this.#client = undefined;
    this.#transport = undefined;
    if (client) await client.close();
  }
}
