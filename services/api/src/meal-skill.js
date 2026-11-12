import { Type } from '@sinclair/typebox';
import { chatMeal } from './meal-analysis.js';

// Both explicit client Skill selection and 健康助手 tool calls use the existing engine.
export async function runMealSkill({ messages, onEvent = () => {}, chatter = chatMeal }) {
  const started = Date.now();
  onEvent({ type: 'tool_start', tool: 'record_meal' });
  try {
    const result = await chatter({ messages });
    if (result.meal_draft) onEvent({ type: 'meal_draft', draft: result.meal_draft });
    onEvent({ type: 'tool_end', tool: 'record_meal', success: true, durationMs: Date.now() - started });
    onEvent({ type: 'text', delta: result.reply });
    return result.reply;
  } catch (error) {
    onEvent({ type: 'tool_end', tool: 'record_meal', success: false, durationMs: Date.now() - started });
    throw error;
  }
}
export function makeMealRecordingTool({ messages, onEvent, chatter = chatMeal }) {
  let called = false;
  return {
    name: 'record_meal', label: '记餐 Skill', namespace: 'health',
    description: '按当前用户图文对话更新餐食草稿，复用识别、联网核对、多轮澄清。不保存，用户须在客户端核对保存。可传入已检索到的相关记忆作为参考。',
    parameters: Type.Object({ memory_context: Type.Optional(Type.String({ maxLength: 8000 })) }, { additionalProperties: false }),
    execute: async (_id, { memory_context } = {}) => {
      if (called) throw new Error('本轮餐食草稿已经处理，请等待用户补充。');
      called = true;
      const result = await chatter({ messages, ...(memory_context ? { memoryContext: memory_context } : {}) });
      if (result.meal_draft) onEvent({ type: 'meal_draft', draft: result.meal_draft });
      return { content: [{ type: 'text', text: JSON.stringify(result) }] };
    },
  };
}
