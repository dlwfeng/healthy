import test from 'node:test';
import assert from 'node:assert/strict';
import { makeHealthTrendTools } from '../src/health-trend-tools.js';
import { answerChat } from '../src/chat.js';
import { READ_TOOLS, WRITE_TOOLS } from '../src/garmin.js';

const today = () => '2026-10-20';
const meal = (date, items) => ({ date, items, nutrition_source: 'manual', photo_url: '/private-photo', note: 'private-note' });
const item = (calories, protein_g = 10) => ({ calories, protein_g, carbs_g: 20, fat_g: 5 });
const call = async (tools, name, start, end, signal) => JSON.parse((await tools.find(tool => tool.name === name).execute('test', { start_date: start, end_date: end }, signal)).content[0].text);
const historyReader = async () => ({ points: [
  { date: '2026-10-15', value: 2000 }, { date: '2026-10-16', value: 2200 },
  { date: '2026-10-17', value: 2300 }, { date: '2026-10-18', value: 0 },
  { date: '2026-10-19', value: null }, { date: '2026-10-20', value: 600 },
] });
const store = { list: async () => [
  meal('2026-10-16', [item(2600)]),
  meal('2026-10-17', [item(500), item(null, null)]),
  meal('2026-10-18', [item(0, 0)]),
  meal('2026-10-19', [item(1800)]),
  meal('2026-10-20', [item(800)]),
] };

test('nutrition provides daily units, per-nutrient completeness and unknowns without private payload', async () => {
  const tools = makeHealthTrendTools({}, { store, today });
  const result = await call(tools, 'get_nutrition_trend', '2026-10-15', '2026-10-20');
  assert.equal(result.rows.length, 6);
  assert.equal(result.timezone, 'Asia/Shanghai');
  assert.equal(result.rows[0].nutrients.calories.value, null);
  assert.equal(result.rows[0].nutrients.calories.complete, false);
  assert.equal(result.rows[2].nutrients.calories.value, 500);
  assert.equal(result.rows[2].nutrients.calories.complete, false);
  assert.equal(result.rows[3].nutrients.protein_g.value, 0);
  assert.equal(result.rows[3].nutrients.protein_g.unit, 'g');
  assert.equal(result.rows[1].nutrients.calories.unit, 'kcal');
  assert.ok(result.rows.every(row => row.full_day_intake_confirmed === false));
  assert.doesNotMatch(JSON.stringify(result), /private-photo|private-note|photo_url/);
  assert.ok(tools.every(tool => tool.annotations.readOnlyHint));
});

test('energy aligns dates, preserves surplus, zero, missing and partial records; totals use matching past dates', async () => {
  const tools = makeHealthTrendTools({}, { store, historyReader, today });
  const result = await call(tools, 'get_energy_balance', '2026-10-15', '2026-10-20');
  const [missing, surplus, partial, zero, unsynced, current] = result.rows;
  assert.equal(missing.intake_kcal, null);
  assert.equal(missing.expenditure_kcal, 2000);
  assert.equal(missing.deficit_kcal, null);
  assert.equal(surplus.deficit_kcal, -400);
  assert.equal(partial.intake_status, 'partial');
  assert.equal(partial.intake_kcal, 500);
  assert.equal(partial.deficit_kcal, null);
  assert.equal(zero.deficit_kcal, 0);
  assert.equal(unsynced.expenditure_kcal, null);
  assert.equal(unsynced.deficit_kcal, null);
  assert.equal(current.provisional, true);
  assert.equal(current.deficit_kcal, -200);
  assert.deepEqual(result.summary.included_dates, ['2026-10-16', '2026-10-18']);
  assert.equal(result.summary.comparable_days, 2);
  assert.equal(result.summary.intake_kcal, 2600);
  assert.equal(result.summary.expenditure_kcal, 2200);
  assert.equal(result.summary.deficit_kcal, -400);
  assert.deepEqual(result.unavailable_dates, ['2026-10-19']);
});

test('ranges validate before IO and include every day across year boundaries, up to 31 days', async () => {
  let calls = 0;
  const tools = makeHealthTrendTools({}, { today, store: { list: async () => { calls++; return []; } } });
  for (const [start, end] of [['2026-02-30', '2026-03-01'], ['2026-10-16', '2026-10-15'], ['2026-01-01', '2026-02-01'], ['2026-10-21', '2026-10-21']]) {
    await assert.rejects(call(tools, 'get_energy_balance', start, end), /invalid_parameters/);
  }
  assert.equal(calls, 0);
  const result = await call(tools, 'get_nutrition_trend', '2025-12-15', '2026-01-14');
  assert.equal(result.rows.length, 31);
  assert.equal(result.rows[17].date, '2026-01-01');
});

test('Garmin failure retains intake and never invents a deficit or exposes upstream errors', async () => {
  const tools = makeHealthTrendTools({}, { store, today, historyReader: async () => { throw Error('secret-token'); } });
  const result = await call(tools, 'get_energy_balance', '2026-10-16', '2026-10-16');
  assert.equal(result.rows[0].intake_kcal, 2600);
  assert.equal(result.rows[0].deficit_kcal, null);
  assert.equal(result.summary.comparable_days, 0);
  assert.equal(result.summary.deficit_kcal, null);
  assert.doesNotMatch(JSON.stringify(result), /secret-token/);
  await assert.rejects(call(makeHealthTrendTools({}, { today, store: { list: async () => { throw Error('postgres://secret'); } } }), 'get_nutrition_trend', '2026-10-16', '2026-10-16'), /^Error: meal_data_unavailable$/);
});

test('energy shares the page history cache and reads total expenditure without adding activity calories', async () => {
  let calls = 0;
  const garmin = { call: async name => { assert.equal(name, 'get_user_summary'); calls++; return { totalKilocalories: 2200, activeKilocalories: 900 }; } };
  const options = { today, store: { list: async () => [meal('2024-12-28', [item(1800)])] } };
  const first = await call(makeHealthTrendTools(garmin, options), 'get_energy_balance', '2024-12-28', '2024-12-28');
  await call(makeHealthTrendTools(garmin, options), 'get_energy_balance', '2024-12-28', '2024-12-28');
  assert.equal(calls, 1);
  assert.equal(first.rows[0].deficit_kcal, 400);
});

test('aborting an energy query propagates cancellation rather than returning unavailable data', async () => {
  const controller = new AbortController();
  const tools = makeHealthTrendTools({}, { store, today, historyReader: async () => {
    controller.abort(new Error('cancelled'));
    throw Error('upstream closed');
  } });
  await assert.rejects(call(tools, 'get_energy_balance', '2026-10-16', '2026-10-16', controller.signal), /cancelled/);
});

test('chat activates both trend tools and streams their execution status', async () => {
  let subscriber, disposed = false;
  const events = [];
  const garmin = { async listTools() { return [...READ_TOOLS, ...WRITE_TOOLS].map(name => ({ name, description: name, inputSchema: { type: 'object', properties: {} } })); } };
  const answer = await answerChat({ garmin, date: '2026-10-20', messages: [{ role: 'user', content: '最近的营养和热量缺口呢？' }], onEvent: event => events.push(event),
    sessionFactory: async options => {
      assert.equal(options.model.id, 'MiniMax-M3.1-Flash');
      assert.equal(options.thinkingLevel, 'low');
      for (const name of ['get_meals', 'get_nutrition_trend', 'get_energy_balance']) {
        assert.ok(options.tools.includes(name), `${name} is active`);
        assert.equal(options.customTools.find(tool => tool.name === name).annotations.readOnlyHint, true);
      }
      assert.equal(options.noTools, 'all');
      return { session: {
        subscribe(fn) { subscriber = fn; return () => {}; },
        messages: [{ role: 'assistant', content: [{ type: 'text', text: '已查询。' }] }],
        async prompt() {
          subscriber({ type: 'tool_execution_start', toolName: 'get_energy_balance' });
          subscriber({ type: 'tool_execution_end', toolName: 'get_energy_balance', isError: false, durationMs: 12 });
        },
        dispose() { disposed = true; },
      } };
    },
  });
  assert.equal(answer, '已查询。');
  assert.equal(events[0].tool, 'get_energy_balance');
  assert.equal(events[1].success, true);
  assert.equal(disposed, true);
});

test('selected meal skill shares memory tools, forwards recalled context and needs no Garmin discovery', async () => {
  const messages = [{ role: 'user', content: '照常记午餐', photos: [{ data_base64: 'original' }] }];
  const events = [];
  await answerChat({
    garmin: { listTools() { throw Error('Garmin must not be required'); } },
    date: '2026-10-29', messages, selectedSkill: 'meal-recording', onEvent: event => events.push(event),
    mealChatter: async input => {
      assert.equal(input.messages, messages);
      assert.equal(input.memoryContext, '测试餐具资料');
      return { reply: '请核对', meal_draft: { name: '午餐', items: [] } };
    },
    sessionFactory: async options => {
      assert.deepEqual(options.tools, ['memory_add', 'memory_replace', 'memory_remove', 'memory_search', 'session_search', 'record_meal']);
      const tool = options.customTools.find(t => t.name === 'record_meal');
      return { session: {
        subscribe() { return () => {}; }, dispose() {},
        messages: [{ role: 'assistant', content: [{ type: 'text', text: '请核对' }] }],
        async prompt(text) {
          assert.match(text, /附有餐食照片/);
          await tool.execute('meal', { memory_context: '测试餐具资料' });
        },
      } };
    },
  });
  assert.equal(events.find(e => e.type === 'meal_draft').draft.name, '午餐');
});
