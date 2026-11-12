import test from 'node:test';
import assert from 'node:assert/strict';
import { makeMealCopyTool } from '../src/meal-copy-tool.js';
import { chatMeal } from '../src/meal-analysis.js';
import { validateMeal } from '../src/meals.js';

const id = '11111111-1111-4111-8111-111111111111';
const otherId = '22222222-2222-4222-8222-222222222222';
const meal = { id, date: '2026-10-27', time: '08:30', kind: '早餐', name: '牛奶鸡蛋', note: '无糖', nutrition_source: 'manual', items: [{ name: '牛奶', portion: '250ml', calories: 150, protein_g: 8, carbs_g: null, fat_g: 8 }], analysis: null, version: 4, photo_url: '/private-photo', photo: 'private-bytes' };
const args = { source_date: meal.date, source_kind: '早餐', target_date: '2026-10-28' };
const decode = result => JSON.parse(result.content[0].text);

test('copy reads a saved meal and emits an independent unsaved draft, preserving unknown nutrition and provenance', async () => {
  const events = [];
  const tool = makeMealCopyTool({ store: { list: async (...dates) => { assert.deepEqual(dates, [meal.date, meal.date]); return [meal]; } }, onEvent: e => events.push(e) });
  const value = decode(await tool.execute('1', args));
  assert.equal(value.status, 'draft_ready');
  assert.deepEqual(value.meal_draft.items, meal.items);
  assert.equal(value.meal_draft.date, args.target_date);
  assert.equal(value.meal_draft.time, '08:30');
  assert.equal(value.meal_draft.kind, '早餐');
  assert.equal(value.meal_draft.nutrition_source, 'manual');
  assert.equal(value.meal_draft.note, '无糖');
  for (const field of ['id', 'version', 'photo', 'photo_url', 'nutrition_confirmed']) assert.equal(field in value.meal_draft, false);
  assert.equal(events[0].type, 'meal_draft');
  value.meal_draft.items[0].portion = '半杯';
  assert.equal(meal.items[0].portion, '250ml');
  validateMeal({ ...events[0].draft, id: otherId }, otherId);
});

test('multiple matches require a selection; absent or mismatched meals never emit drafts', async () => {
  const events = [];
  const tool = makeMealCopyTool({ store: { list: async () => [meal, { ...meal, id: otherId, name: '另一条早餐' }] }, onEvent: e => events.push(e) });
  const value = decode(await tool.execute('1', args));
  assert.equal(value.status, 'needs_selection');
  assert.equal(value.candidates.length, 2);
  assert.equal(JSON.stringify(value).includes('private-'), false);
  assert.equal(events.length, 0);
  assert.equal(decode(await tool.execute('2', { ...args, source_kind: '晚餐' })).status, 'not_found');
  const selected = decode(await tool.execute('3', { ...args, source_id: otherId, target_kind: '午餐', target_time: '12:15' }));
  assert.equal(selected.meal_draft.name, '另一条早餐');
  assert.equal(selected.meal_draft.kind, '午餐');
  assert.equal(selected.meal_draft.time, '12:15');
  await assert.rejects(tool.execute('4', { ...args, target_date: '2026-02-30' }), /invalid_parameters/);
  await assert.rejects(tool.execute('5', { ...args, target_time: '25:00' }), /invalid_parameters/);
});

test('model estimated copy retains analysis and still requires explicit confirmation to save', async () => {
  const analysis = { model: 'MiniMax-M3.1-Flash', items: meal.items, uncertainty: '包装估算', sources: [], search_status: 'unavailable' };
  const tool = makeMealCopyTool({ store: { list: async () => [{ ...meal, nutrition_source: 'model_estimate', analysis }] } });
  const draft = decode(await tool.execute('1', args)).meal_draft;
  assert.deepEqual(draft.analysis, analysis);
  assert.throws(() => validateMeal({ ...draft, id: otherId }, otherId), /confirmation_required/);
  validateMeal({ ...draft, id: otherId, nutrition_confirmed: true }, otherId);
});

const response = message => ({ ok: true, json: async () => ({ choices: [{ message }] }) });
const call = args => ({ role: 'assistant', content: null, tool_calls: [{ id: 'copy1', type: 'function', function: { name: 'copy_meal', arguments: JSON.stringify(args) } }] });
test('meal conversation executes copy tool and returns exact stored nutrition without model rewriting', async () => {
  const before = process.env.MINIMAX_CN_API_KEY;
  process.env.MINIMAX_CN_API_KEY = 'test-only';
  try {
    let calls = 0;
    const result = await chatMeal({ messages: [{ role: 'user', content: '今天早餐和昨天一样' }] }, {
      store: { list: async () => [meal] },
      fetchImpl: async (_url, options) => {
        calls++;
        const request = JSON.parse(options.body);
        assert.ok(request.tools.some(t => t.function.name === 'copy_meal'));
        assert.match(request.messages[0].content, /当前上海日期/);
        return response(call(args));
      },
    });
    assert.equal(calls, 1);
    assert.deepEqual(result.meal_draft.items, meal.items);
    assert.match(result.reply, /核对后点击保存/);
    const revised = await chatMeal({ messages: [
      { role: 'user', content: '今天早餐和昨天一样' },
      { role: 'assistant', content: result.reply, meal_draft: result.meal_draft },
      { role: 'user', content: '牛奶改为半杯' },
    ] }, {
      fetchImpl: async () => response({ content: '已改为半杯。\n```json\n' + JSON.stringify({
        is_food: true, name: meal.name, items: [{ ...meal.items[0], portion: '125ml', calories: 75 }], uncertainty: '按半杯调整',
      }) + '\n```' }),
    });
    assert.equal(revised.meal_draft.items[0].calories, 75);
    assert.equal(revised.meal_draft.date, args.target_date);
    assert.equal(revised.meal_draft.kind, '早餐');
    assert.equal(revised.meal_draft.nutrition_source, 'model_estimate');
    assert.equal(revised.meal_draft.copied_from.id, meal.id);

    let step = 0;
    const missing = await chatMeal({ messages: [{ role: 'user', content: '今天早餐和昨天一样' }] }, {
      store: { list: async () => [] },
      fetchImpl: async (_url, options) => {
        if (step++ === 0) return response(call(args));
        const messages = JSON.parse(options.body).messages;
        assert.equal(JSON.parse(messages.at(-1).content).status, 'not_found');
        return response({ content: '没有找到昨天的早餐，请补充。\n```json\n{"name":"虚构食物","items":[]}\n```' });
      },
    });
    assert.equal(missing.meal_draft, null);
  } finally {
    if (before === undefined) delete process.env.MINIMAX_CN_API_KEY;
    else process.env.MINIMAX_CN_API_KEY = before;
  }
});
