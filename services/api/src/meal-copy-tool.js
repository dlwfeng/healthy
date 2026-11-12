import { Type } from '@sinclair/typebox';
import { mealStore, mealKinds, validMealId, MealError, validateItems } from './meals.js';
import { validDate } from './daily-status.js';

export function makeMealCopyTool({ store = mealStore, onEvent = () => {} } = {}) {
  return {
    name: 'copy_meal', label: '复制餐食到草稿', namespace: 'health',
    description: '读取已保存的一餐并原样复制食物、份量、营养到未保存草稿。必须明确来源日期和餐别、目标日期；同餐别有多条时返回候选，询问用户后再传 source_id 选择。不会保存，不复制旧照片。',
    parameters: Type.Object({
      source_date: Type.String(), source_kind: Type.Union(mealKinds.map(k => Type.Literal(k))),
      source_id: Type.Optional(Type.String()), target_date: Type.String(),
      target_kind: Type.Optional(Type.Union(mealKinds.map(k => Type.Literal(k)))),
      target_time: Type.Optional(Type.String()),
    }, { additionalProperties: false }),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    execute: async (_id, args) => {
      if (!validDate(args.source_date) || !validDate(args.target_date) || !mealKinds.includes(args.source_kind)
        || (args.source_id !== undefined && !validMealId(args.source_id))
        || (args.target_kind !== undefined && !mealKinds.includes(args.target_kind))
        || (args.target_time !== undefined && !/^([01]\d|2[0-3]):[0-5]\d$/.test(args.target_time))) throw new MealError('invalid_parameters');
      const entries = (await store.list(args.source_date, args.source_date)).filter(m => m.kind === args.source_kind);
      const matches = args.source_id ? entries.filter(m => m.id === args.source_id) : entries;
      const result = value => ({ content: [{ type: 'text', text: JSON.stringify(value) }] });
      if (!matches.length) return result({ status: 'not_found', message: '没有找到指定餐食，请向用户澄清，不要编造草稿。' });
      if (matches.length > 1) return result({ status: 'needs_selection', candidates: matches.map(({ id, date, time, kind, name, items }) => ({ id, date, time, kind, name, items })), message: '找到多条记录，请用户选择要复制哪一条。' });
      const meal = matches[0];
      const draft = structuredClone({
        name: meal.name, items: validateItems(meal.items), note: meal.note || '',
        nutrition_source: meal.nutrition_source, analysis: meal.analysis,
        model: meal.analysis?.model, uncertainty: meal.analysis?.uncertainty || '沿用历史餐食的份量与营养，请核对本次实际食用量。',
        sources: meal.analysis?.sources || [], search_status: meal.analysis?.search_status || 'unavailable',
        date: args.target_date, kind: args.target_kind || meal.kind, time: args.target_time || meal.time,
        copied_from: { id: meal.id, date: meal.date, kind: meal.kind, time: meal.time },
      });
      onEvent({ type: 'meal_draft', draft });
      return result({ status: 'draft_ready', reply: `已将${meal.date}的${meal.kind}「${meal.name}」加载为${draft.date}${draft.kind}草稿，请核对后点击保存。`, meal_draft: draft });
    },
  };
}
