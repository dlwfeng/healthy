import { Type } from '@sinclair/typebox';
import { mealStore, dateRange, summarizeMeals, nutrientKeys } from './meals.js';
import { loadHistory } from './overview.js';
import { todayInShanghai } from './daily-status.js';
import { shiftDay } from './report-time.js';

const parameters = Type.Object({
  start_date: Type.String({ pattern: '^\\d{4}-\\d{2}-\\d{2}$', description: '开始日期，上海时区 YYYY-MM-DD，含当天' }),
  end_date: Type.String({ pattern: '^\\d{4}-\\d{2}-\\d{2}$', description: '结束日期，含当天，不晚于今天；范围最多31天' }),
}, { additionalProperties: false });
const round = value => value === null ? null : Math.round(value * 10) / 10;
const output = value => ({ content: [{ type: 'text', text: JSON.stringify(value) }] });

export function makeHealthTrendTools(garmin, {
  store = mealStore, historyReader = loadHistory, today = todayInShanghai,
} = {}) {
  let queriedEnergyDays = 0;
  const readNutrition = async (args, signal) => {
    signal?.throwIfAborted();
    const [start, end] = dateRange(new URLSearchParams(args));
    const currentDay = today();
    if (end > currentDay) throw Error('invalid_parameters');
    let entries;
    try { entries = await store.list(start, end); }
    catch { signal?.throwIfAborted(); throw Error('meal_data_unavailable'); }
    signal?.throwIfAborted();
    const rows = [];
    for (let date = start; date <= end; date = shiftDay(date, 1)) {
      const summary = summarizeMeals(entries.filter(meal => meal.date === date));
      rows.push({ date, meals: summary.meals, model_estimated_meals: summary.model_estimated_meals,
        is_today: date === currentDay, full_day_intake_confirmed: false,
        nutrients: Object.fromEntries(nutrientKeys.map(key => [key, {
          ...summary.totals[key], unit: key === 'calories' ? 'kcal' : 'g',
          complete: summary.meals > 0 && summary.totals[key].complete_meals === summary.meals,
        }])),
      });
    }
    return { start_date: start, end_date: end, timezone: 'Asia/Shanghai', rows };
  };
  const define = (name, label, description, execute) => ({
    name, label, description, promptSnippet: description, namespace: 'health', parameters,
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    execute,
  });
  return [
    define('get_nutrition_trend', '营养趋势',
      '按上海日期查询最多31天的逐日饮食营养：热量(kcal)、蛋白质/碳水/脂肪(g)。与网页营养图同源。包含未记录日期和各指标的已记录餐食完整性；complete不代表全天饮食已记全，未知值为null。逐餐明细另用get_meals。',
      async (_id, args, signal) => output({
        source: '用户饮食记录（用户填报或确认的营养估算）',
        ...await readNutrition(args, signal),
        notes: ['未记录不代表没吃；缺失营养不补零。', 'complete仅说明已记录餐食的该营养字段齐全，不代表全天记录完整。'],
      })),
    define('get_energy_balance', '热量平衡',
      '按上海日期查询最多31天的逐日摄入、Garmin总消耗和估算热量缺口(kcal)，复用网页Garmin历史缓存。缺口=总消耗−已记录摄入，负值表示盈余，不叠加运动热量。缺失值为null，热量未填全不计算缺口；漏记会使缺口偏大。今日为暂估，周期汇总仅含有可比数据的过去日期，并注明覆盖天数。',
      async (_id, args, signal) => {
        const nutrition = await readNutrition(args, signal);
        const days = nutrition.rows.length;
        if (queriedEnergyDays + days > 62) throw Error('energy_query_limit_reached');
        queriedEnergyDays += days;
        let history;
        try {
          history = await historyReader(garmin, nutrition.end_date, days, 'calories', { signal });
        } catch {
          signal?.throwIfAborted();
          history = { points: [], unavailable: nutrition.rows.map(row => row.date) };
        }
        signal?.throwIfAborted();
        const points = new Map(history.points.map(point => [point.date, point.value]));
        const rows = nutrition.rows.map(row => {
          const calories = row.nutrients.calories;
          const raw = points.get(row.date);
          const expenditure = Number.isFinite(raw) && raw >= 0 ? raw : null;
          const deficit = calories.complete && expenditure !== null ? round(expenditure - calories.value) : null;
          return { date: row.date, meals: row.meals, intake_kcal: calories.value,
            expenditure_kcal: expenditure, deficit_kcal: deficit,
            intake_status: !row.meals ? 'unrecorded' : calories.value === null ? 'unknown' : calories.complete ? 'recorded' : 'partial',
            expenditure_status: expenditure === null ? 'unavailable' : 'available',
            is_today: row.is_today, provisional: row.is_today,
            full_day_intake_confirmed: false,
          };
        });
        const comparable = rows.filter(row => !row.is_today && row.deficit_kcal !== null);
        const total = key => comparable.length ? round(comparable.reduce((sum, row) => sum + row[key], 0)) : null;
        return output({
          source: { intake: '用户饮食记录（营养估算）', expenditure: 'Garmin Connect总消耗', deficit: '应用估算，非Garmin分析' },
          start_date: nutrition.start_date, end_date: nutrition.end_date, timezone: nutrition.timezone, unit: 'kcal',
          formula: 'deficit_kcal = expenditure_kcal - intake_kcal; negative means surplus',
          rows, unavailable_dates: rows.filter(row => row.expenditure_kcal === null).map(row => row.date),
          summary: { comparable_days: comparable.length, requested_days: days,
            included_dates: comparable.map(row => row.date), excluded_dates: rows.filter(row => row.is_today || row.deficit_kcal === null).map(row => row.date),
            intake_kcal: total('intake_kcal'), expenditure_kcal: total('expenditure_kcal'), deficit_kcal: total('deficit_kcal'),
            estimates_only: true,
          },
          notes: ['总消耗已包含活动消耗，不再加训练热量。', '缺口按已记录摄入估算；无法确认全天是否记全，漏记会使缺口偏大。', '缺少摄入、消耗或热量未填全时缺口为null；今日截至当前，周期汇总排除今天和缺失日期。'],
        });
      }),
  ];
}
