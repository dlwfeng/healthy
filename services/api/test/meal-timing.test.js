import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { sanitizePhoto } from '../src/meals.js';
import { parseAnalysis, analyzeMeal, chatMeal } from '../src/meal-analysis.js';

const food = { is_food: true, name: '米饭', items: [{ name: '米饭', portion: '一碗', calories: 200 }], uncertainty: '估算' };
const response = value => ({ ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify(value) } }] }) });
const photo = async exif => ({ data_base64: (await sharp({ create: { width: 32, height: 32, channels: 3, background: '#abc' } }).jpeg().withExif(exif).toBuffer()).toString('base64') });

test('capture time is extracted before stripping EXIF, with offset converted to Shanghai', async () => {
  const p = await photo({ IFD2: { DateTimeOriginal: '2026:11:10 23:40:12', OffsetTimeOriginal: '-05:00' } });
  const clean = await sanitizePhoto(p);
  assert.deepEqual(clean.meal_timing, { date: '2026-11-11', time: '12:40', kind: '午餐' });
  assert.equal((await sharp(clean.bytes).metadata()).exif, undefined);
  const invalid = await sanitizePhoto(await photo({ IFD2: { DateTimeOriginal: '2026:02:30 12:00:00' } }));
  assert.equal(invalid.meal_timing, undefined);
});

test('analysis validates optional date, time and kind instead of discarding them', () => {
  assert.deepEqual(Object.fromEntries(Object.entries(parseAnalysis(JSON.stringify({ ...food, date: '2026-11-10', time: '22:10', kind: '晚餐' }))).filter(([k]) => ['date', 'time', 'kind'].includes(k))), { date: '2026-11-10', time: '22:10', kind: '晚餐' });
  assert.equal(parseAnalysis(JSON.stringify({ ...food, time: '08:10' })).kind, '早餐');
  const invalid = parseAnalysis(JSON.stringify({ ...food, date: '2026-02-30', time: '25:00', kind: '宵夜' }));
  assert.equal(invalid.date, undefined);
  assert.equal(invalid.time, undefined);
  assert.equal(invalid.kind, undefined);
});

test('photo timing survives nutrition search; conversation overrides it and follow-ups retain timing', async () => {
  const before = process.env.MINIMAX_CN_API_KEY;
  process.env.MINIMAX_CN_API_KEY = 'test-only';
  try {
    const p = await photo({ IFD2: { DateTimeOriginal: '2026:11:10 12:40:00' } });
    const analyzed = await analyzeMeal({ photo: p }, { fetchImpl: async url => url.endsWith('/responses') ? { ok: false, status: 400 } : response(food) });
    assert.equal(analyzed.time, '12:40');
    assert.equal(analyzed.kind, '午餐');
    const searched = await analyzeMeal({ photo: p }, { fetchImpl: async url => url.endsWith('/responses') ? {
      ok: true, json: async () => ({ status: 'completed', output: [
        { type: 'web_search_call', status: 'completed' },
        { type: 'message', content: [{ type: 'output_text', text: JSON.stringify(food), annotations: [{ type: 'url_citation', title: '资料', url: 'https://example.com/rice' }] }] },
      ] }),
    } : response(food) });
    assert.equal(searched.search_status, 'used');
    assert.equal(searched.date, '2026-11-10');
    assert.equal(searched.time, '12:40');
    const initial = await chatMeal({ messages: [{ role: 'user', content: '这是昨天晚上十点的晚餐', photo: p }] }, { fetchImpl: async (url, opts) => {
      if (url.endsWith('/responses')) return { ok: false, status: 400 };
      const payload = JSON.parse(opts.body);
      if (payload.messages[0].content.includes('餐食照片记录助手')) {
        assert.match(payload.messages[0].content, /date/);
        assert.match(payload.messages[1].content[0].text, /12:40/);
      }
      return response({ ...food, date: '2026-11-10', time: '22:00', kind: '晚餐' });
    } });
    assert.equal(initial.meal_draft.time, '22:00');
    assert.equal(initial.meal_draft.kind, '晚餐');
    const messages = [{ role: 'assistant', content: '已识别', meal_draft: initial.meal_draft }, { role: 'user', content: '只吃了半碗' }];
    const revised = await chatMeal({ messages }, { fetchImpl: async () => response(food) });
    assert.equal(revised.meal_draft.date, '2026-11-10');
    assert.equal(revised.meal_draft.time, '22:00');
    assert.equal(revised.meal_draft.kind, '晚餐');
    const corrected = await chatMeal({ messages: [...messages, { role: 'user', content: '改成早上八点早餐' }] }, { fetchImpl: async () => response({ ...food, time: '08:00', kind: '早餐' }) });
    assert.equal(corrected.meal_draft.time, '08:00');
    assert.equal(corrected.meal_draft.kind, '早餐');
    assert.equal(corrected.meal_draft.date, '2026-11-10');
  } finally {
    if (before === undefined) delete process.env.MINIMAX_CN_API_KEY;
    else process.env.MINIMAX_CN_API_KEY = before;
  }
});
