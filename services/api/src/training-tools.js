import { Type } from "@sinclair/typebox";

const pick = (values) => Type.Union(values.map((value) => Type.Literal(value)));
const options = { additionalProperties: false };

export function makeTrainingTools(garmin) {
  let writes = 0;
  const definitions = [
    {
      name: "create_workout", label: "创建佳明训练", description: "在 Garmin 创建计时训练课程。仅当用户明确要求创建或添加训练时调用；只讨论建议时不要写入。支持跑步、骑行、力量、有氧、瑜伽、普拉提、HIIT、灵活性及其他运动的计时步骤和可选心率区间；不支持动作/重量/次数或游泳结构。重复间歇展开为多个步骤，不擅自替换用户要求的运动类型。复用相同课程。verified=true 表示步骤回读通过；否则先用 get_workout_by_id 核对。创建课程不等于排入日历，随后必须调用 schedule_workout。",
      parameters: Type.Object({
        name: Type.String({ minLength: 1, maxLength: 80 }),
        sport: pick(["running", "cycling", "strength_training", "cardio_training", "yoga", "pilates", "hiit", "mobility", "other"]),
        description: Type.Optional(Type.String({ maxLength: 500 })),
        steps: Type.Array(Type.Object({
          type: pick(["warmup", "interval", "recovery", "cooldown", "rest"]),
          duration_seconds: Type.Integer({ minimum: 1, maximum: 21600 }),
          description: Type.Optional(Type.String({ maxLength: 200 })),
          target_hr_zone: Type.Optional(Type.Integer({ minimum: 1, maximum: 5 })),
        }, options), { minItems: 1, maxItems: 50 }),
      }, options),
    },
    {
      name: "schedule_workout", label: "安排佳明日历", description: "把已有 workout_id 的训练安排到用户指定的日期（YYYY-MM-DD，上海时区，今天或未来）。仅在用户明确要求添加、安排或确认该训练后调用；同课程同日期复用已有安排。返回 verified=true 才能说已在佳明日历确认；否则说明写入已被接受但尚待核对，并用 get_calendar 查询，勿重复创建。",
      parameters: Type.Object({ workout_id: Type.Integer({ minimum: 1 }), date: Type.String({ pattern: "^\\d{4}-\\d{2}-\\d{2}$" }) }, options),
    },
  ];
  return definitions.map((tool) => ({ ...tool, namespace: "garmin",
    promptSnippet: tool.description,
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    execute: async (_id, args) => {
      if (++writes > 16) throw new Error("Training write limit reached; stop and report which dates are completed");
      const result = await garmin.call(tool.name, args);
      return { content: [{ type: "text", text: JSON.stringify(result) }] };
    },
  }));
}
