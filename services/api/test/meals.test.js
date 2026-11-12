import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import sharp from 'sharp';
import { validateMeal, dateRange, sanitizePhoto, summarizeMeals, MealError } from '../src/meals.js';
import { parseAnalysis, analyzeMeal, chatMeal } from '../src/meal-analysis.js';
import { mealRoutes } from '../src/meal-routes.js';
import { makeMealTools, makeMealPhotoTool } from '../src/meal-tools.js';

const id = '7f431b60-dc12-4283-bcd4-af799d91ce70';
const item = { name: '米饭', portion: '一碗', calories: 200, protein_g: null, carbs_g: 40, fat_g: null };
const meal = { id, date: '2026-10-16', time: '12:10', kind: '午餐', name: '米饭', note: '', items: [item], nutrition_source: 'manual' };
const image = async () => ({ data_base64: (await sharp({ create: { width: 64, height: 32, channels: 3, background: '#abc' } }).jpeg().withMetadata({ exif: { IFD0: { Copyright: 'remove-me' } } }).toBuffer()).toString('base64') });
async function route(method, path, body, store = {}, analyze, headers = { 'x-meal-client': 'healthy' }, chat = undefined) {
  const req = Readable.from(body === undefined ? [] : [Buffer.from(typeof body === 'string' ? body : JSON.stringify(body))]);
  req.method = method; req.headers = headers;
  const res = { writeHead(code, headers) { this.code = code; this.headers = headers; }, end(bytes) { this.bytes = bytes; } };
  await mealRoutes(req, res, new URL(path, 'http://localhost'), (r, code, data) => { r.code = code; r.data = data; }, store, analyze, chat);
  return res;
}

test('meal validation rejects unconfirmed model values, invalid numbers, impossible dates and unversioned updates', () => {
  assert.equal(validateMeal(meal, id).items[0].protein_g, null);
  for (const invalid of [{ date: '2026-02-30' }, { time: '24:00' }, { name: '' }, { items: [{ ...item, calories: -1 }] }, { items: [{ ...item, calories: '200' }] }, { items: [{ ...item, fat_g: Infinity }] }, { items: Array(31).fill(item) }]) assert.throws(() => validateMeal({ ...meal, ...invalid }, id));
  assert.throws(() => validateMeal(meal, id, true));
  assert.throws(() => validateMeal({ ...meal, nutrition_source: 'model_estimate' }, id), /confirmation_required/);
  const approved = { ...meal, nutrition_source: 'model_estimate', nutrition_confirmed: true, analysis: { model: 'MiniMax-M3', items: [item], uncertainty: '份量估算' } };
  assert.equal(validateMeal(approved, id).analysis.uncertainty, '份量估算');
  assert.throws(() => validateMeal({ ...approved, analysis: { ...approved.analysis, search_status: 'used', sources: [{ title: 'bad', url: 'javascript:alert(1)' }] } }, id));
  assert.throws(() => dateRange(new URLSearchParams({ start_date: '2026-01-01', end_date: '2026-02-01' })));
});

test('missing nutrients stay unknown and partial totals disclose coverage', () => {
  const summary = summarizeMeals([meal, { ...meal, items: [] }]);
  assert.deepEqual(summary.totals.calories, { value: 200, complete_meals: 1 });
  assert.deepEqual(summary.totals.protein_g, { value: null, complete_meals: 0 });
  assert.equal(summarizeMeals([]).totals.calories.value, null);
});

test('photos are decoded, resized and stripped of EXIF; corrupt, oversized and disguised input fails', async () => {
  const clean = await sanitizePhoto(await image());
  assert.equal(clean.mime, 'image/jpeg');
  const metadata = await sharp(clean.bytes).metadata();
  assert.equal(metadata.exif, undefined);
  await assert.rejects(sanitizePhoto({ data_base64: Buffer.from('<svg/>').toString('base64') }), /invalid_photo/);
  await assert.rejects(sanitizePhoto({ data_base64: 'a'.repeat(7_000_004) }), /photo_too_large/);
  await assert.rejects(sanitizePhoto({ data_base64: 'abcd#===' }), /invalid_photo/);
});

test('model output is a validated proposal; non-food, malformed or invented nutrient strings fail', () => {
  const result = { is_food: true, name: '米饭', items: [item], uncertainty: '照片不能确定重量' };
  assert.equal(parseAnalysis('```json\n' + JSON.stringify(result) + '\n```').model, 'MiniMax-M3.1-Flash');
  assert.throws(() => parseAnalysis('{"is_food":false}'), /no_food_detected/);
  assert.throws(() => parseAnalysis('broken'), /analysis_invalid_response/);
  assert.throws(() => parseAnalysis(JSON.stringify({ ...result, items: [{ ...item, calories: '200 kcal' }] })), /analysis_invalid_response/);
});

test('vision call uses sanitized image, bounded timeout, and never leaks provider errors', async () => {
  const before = process.env.MINIMAX_CN_API_KEY;
  process.env.MINIMAX_CN_API_KEY = 'test-not-real';
  try {
    const result = await analyzeMeal({ photo: await image(), hint: '半碗' }, { fetchImpl: async (url, opts) => {
      const data = JSON.parse(opts.body);
      assert.equal(data.model, 'MiniMax-M3.1-Flash');
      if (url.endsWith('/chat/completions')) {
        assert.ok(data.messages[1].content[0].text.includes('半碗'));
        assert.equal((await sharp(Buffer.from(data.messages[1].content[1].image_url.url.split(',')[1], 'base64')).metadata()).exif, undefined);
        return { ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify({ is_food: true, name: '米饭', items: [{ ...item, portion: '约100克' }], uncertainty: '估算' }) } }] }) };
      }
      assert.equal(url, 'https://api.minimax.cn/v1/responses');
      assert.deepEqual(data.tools, [{ type: 'web_search' }]);
      assert.ok(!opts.body.includes('data:image'));
      return { ok: true, json: async () => ({ status: 'completed', output_text: JSON.stringify({ items: [{ calories: 116, protein_g: 2.6, carbs_g: 25.9, fat_g: 0.3, source_url: 'https://fooddb.mext.go.jp/details/rice' }] }), output: [
        { type: 'web_search_call', status: 'completed' },
        { type: 'message', content: [{ annotations: [{ type: 'url_citation', title: '食物资料', url: 'https://fooddb.mext.go.jp/details/rice' }] }] },
      ] }) };
    } });
    assert.equal(result.items[0].calories, 116);
    assert.equal(result.search_status, 'used');
    assert.equal(result.sources[0].url, 'https://fooddb.mext.go.jp/details/rice');
    assert.equal(validateMeal({ ...approvedMeal(), analysis: result }, id).analysis.sources.length, 1);
    await assert.rejects(analyzeMeal({ photo: await image() }, { fetchImpl: async () => { throw Error('secret upstream payload'); } }), /analysis_unavailable/);
  } finally { if (before === undefined) delete process.env.MINIMAX_CN_API_KEY; else process.env.MINIMAX_CN_API_KEY = before; }
});

test('web search corrects brand and food names from online information and accepts safe public sources', async () => {
  const before = process.env.MINIMAX_CN_API_KEY;
  process.env.MINIMAX_CN_API_KEY = 'test-not-real';
  try {
    const result = await analyzeMeal({ photo: await image(), hint: '杏皮茶' }, { fetchImpl: async (url, opts) => {
      if (url.endsWith('/chat/completions')) {
        return { ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify({
          is_food: true,
          name: '可口可乐小杏运',
          detected_text: '叮咚V5 小杏运 敦煌杏皮茶 750ml',
          items: [{ name: '可乐杏皮茶', portion: '750ml', calories: 200, protein_g: 0, carbs_g: 50, fat_g: 0 }],
          uncertainty: '疑似可乐',
        }) } }] }) };
      }
      const data = JSON.parse(opts.body);
      const input = JSON.parse(data.input);
      assert.equal(input.initial_name, '可口可乐小杏运');
      assert.equal(input.detected_text, '叮咚V5 小杏运 敦煌杏皮茶 750ml');
      assert.equal(input.user_hint, '杏皮茶');
      return { ok: true, json: async () => ({
        status: 'completed',
        output_text: JSON.stringify({
          name: '叮咚买菜 敦煌杏皮茶',
          items: [{ name: '叮咚V5 敦煌杏皮茶', portion: '750ml', calories: 345, protein_g: 0, carbs_g: 82, fat_g: 0 }],
          uncertainty: '已联网纠正为叮咚买菜自有品牌敦煌杏皮茶',
        }),
        output: [
          { type: 'web_search_call', status: 'completed' },
          { type: 'message', content: [{ annotations: [
            { type: 'url_citation', title: '新闻报道', url: 'https://www.sznews.com/news/content_123.htm' },
            { type: 'url_citation', title: '私有IP应被过滤', url: 'https://192.168.1.1/secret' },
            { type: 'url_citation', title: '电商详情', url: 'https://goods.taobao.com/item/456' },
          ] }] },
        ]
      }) };
    } });
    assert.equal(result.name, '叮咚买菜 敦煌杏皮茶');
    assert.equal(result.items[0].name, '叮咚V5 敦煌杏皮茶');
    assert.equal(result.items[0].calories, 345);
    assert.equal(result.search_status, 'used');
    assert.equal(result.sources.length, 2);
    assert.equal(result.sources[0].url, 'https://www.sznews.com/news/content_123.htm');
    assert.equal(result.sources[1].url, 'https://goods.taobao.com/item/456');
  } finally { if (before === undefined) delete process.env.MINIMAX_CN_API_KEY; else process.env.MINIMAX_CN_API_KEY = before; }
});

function approvedMeal() { return { ...meal, nutrition_source: 'model_estimate', nutrition_confirmed: true }; }

test('an overloaded upstream model falls back to the next model in the chain', async () => {
  const before = process.env.MINIMAX_CN_API_KEY;
  const beforeModel = process.env.MINIMAX_MEAL_MODEL;
  process.env.MINIMAX_MEAL_MODEL = 'MiniMax-M3,MiniMax-M3.1-Flash';
  process.env.MINIMAX_CN_API_KEY = 'test-not-real';
  try {
    const models = [];
    const result = await analyzeMeal({ photo: await image() }, { fetchImpl: async (url, opts) => {
      const data = JSON.parse(opts.body);
      if (url.endsWith('/responses')) return { ok: true, json: async () => ({ status: 'completed', output: [] }) };
      models.push(data.model);
      if (data.model === 'MiniMax-M3') return { ok: false, status: 529, json: async () => ({}) };
      assert.equal(data.thinking, undefined);
      return { ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify({ is_food: true, name: '米饭', items: [item], uncertainty: '估算' }) } }] }) };
    } });
    assert.deepEqual(models, ['MiniMax-M3', 'MiniMax-M3.1-Flash']);
    assert.equal(result.model, 'MiniMax-M3.1-Flash');
    assert.equal(result.search_status, 'unavailable');
    assert.equal(validateMeal({ ...approvedMeal(), analysis: result }, id).analysis.model, 'MiniMax-M3.1-Flash');
    assert.throws(() => validateMeal({ ...approvedMeal(), analysis: { ...result, model: 'MiniMax-M4' } }, id), /invalid_parameters/);
  } finally {
    if (beforeModel === undefined) delete process.env.MINIMAX_MEAL_MODEL; else process.env.MINIMAX_MEAL_MODEL = beforeModel;
    if (before === undefined) delete process.env.MINIMAX_CN_API_KEY; else process.env.MINIMAX_CN_API_KEY = before; }
});

test('a busy upstream on every model reports a retryable overloaded error', async () => {
  const before = process.env.MINIMAX_CN_API_KEY;
  process.env.MINIMAX_CN_API_KEY = 'test-not-real';
  try {
    const failure = await analyzeMeal({ photo: await image() }, { fetchImpl: async () => ({ ok: false, status: 529, json: async () => ({}) }) })
      .then(() => null, error => error);
    assert.equal(failure.message, 'analysis_overloaded');
    assert.equal(failure.status, 503);
  } finally { if (before === undefined) delete process.env.MINIMAX_CN_API_KEY; else process.env.MINIMAX_CN_API_KEY = before; }
});

test('search failure keeps the photo estimate and hides unavailable sources', async () => {
  const before = process.env.MINIMAX_CN_API_KEY;
  process.env.MINIMAX_CN_API_KEY = 'test-not-real';
  try {
    const result = await analyzeMeal({ photo: await image() }, { fetchImpl: async url => {
      if (url.endsWith('/responses')) throw Error('search unavailable');
      return { ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify({ is_food: true, name: '米饭', items: [item], uncertainty: '估算' }) } }] }) };
    } });
    assert.equal(result.items[0].calories, 200);
    assert.equal(result.search_status, 'unavailable');
    assert.deepEqual(result.sources, []);
  } finally { if (before === undefined) delete process.env.MINIMAX_CN_API_KEY; else process.env.MINIMAX_CN_API_KEY = before; }
});

test('meal HTTP routes protect writes, preserve photos on edit, validate deletion version and report database failure', async () => {
  assert.equal((await route('POST', '/api/meals', meal, {}, undefined, {})).code, 403);
  assert.equal((await route('POST', '/api/meals', 'bad')).code, 400);
  assert.equal((await route('POST', '/api/meals', 'x'.repeat(32_000_001))).code, 413);
  let calls = 0;
  const store = {
    save: async (record, photo, updating) => { calls++; assert.equal(photo, updating ? undefined : null); return record; },
    list: async () => [meal], remove: async (key, version) => { assert.equal(key, id); assert.equal(version, 1); },
  };
  assert.equal((await route('POST', '/api/meals', meal, store)).code, 201);
  assert.equal((await route('PUT', `/api/meals/${id}`, { ...meal, version: 1 }, store)).code, 200);
  assert.equal(calls, 2);
  assert.equal((await route('DELETE', `/api/meals/${id}`, undefined, store)).code, 400);
  assert.equal((await route('DELETE', `/api/meals/${id}?version=1`, undefined, store)).code, 200);
  assert.equal((await route('GET', '/api/meals?start_date=2026-10-16&end_date=2026-10-16', undefined, store)).data.summary.meals, 1);
  assert.equal((await route('GET', '/api/meals?start_date=2026-10-16&end_date=2026-10-16', undefined, { list: async () => { throw Error('postgres://secret'); } })).data.error, 'database_unavailable');
  assert.equal((await route('GET', '/api/meals/bad', undefined, store)).code, 404);
});

test('健康助手 diet tool is read-only and excludes photo contents, URLs and model provenance payload', async () => {
  const tools = makeMealTools({ list: async () => [{ ...meal, photo: 'private-bytes', photo_url: '/secret', analysis: { items: [item], uncertainty: '估算' } }] });
  assert.deepEqual(tools.map(t => t.name), ['get_meals']);
  const result = await tools[0].execute('call', { start_date: '2026-10-16', end_date: '2026-10-16' });
  const text = result.content[0].text;
  assert.ok(!text.includes('private-bytes') && !text.includes('/secret'));
  assert.match(text, /估算/);
});

test('saved meal photos are returned only on demand with missing photos reported', async () => {
  const id = '123e4567-e89b-42d3-a456-426614174000';
  const tool = makeMealPhotoTool({
    get: async () => ({ id, date: '2026-10-16', kind: '午餐', name: '午餐', photo_count: 2 }),
    photo: async (_, index) => index === 0 ? { photo: Buffer.from('photo bytes'), photo_mime: 'image/jpeg' } : null,
  });
  const result = await tool.execute('call', { meal_id: id });
  assert.deepEqual(result.content.find(part => part.type === 'image'), { type: 'image', data: Buffer.from('photo bytes').toString('base64'), mimeType: 'image/jpeg' });
  assert.match(result.content.at(-1).text, /第 2 张照片无法读取/);
  await assert.rejects(tool.execute('call', { meal_id: 'bad' }), /invalid_parameters/);
  const empty = makeMealPhotoTool({ get: async () => ({ photo_count: 0, date: '2026-10-16', kind: '午餐', name: '餐食' }) });
  assert.match((await empty.execute('call', { meal_id: id })).content.at(-1).text, /没有保存照片/);
  const missing = makeMealPhotoTool({ get: async () => null });
  assert.match((await missing.execute('call', { meal_id: id })).content[0].text, /未找到/);
});

test('conversational meal chat produces proactive questions on Turn 1 and updates meal draft on follow-up turns', async () => {
  const before = process.env.MINIMAX_CN_API_KEY;
  process.env.MINIMAX_CN_API_KEY = 'test-not-real';
  try {
    const img = await image();
    const turn1Result = await chatMeal({
      messages: [{ role: 'user', content: '看看这个杏皮茶', photo: img }],
      memoryContext: '测试用户常用餐具资料。'.repeat(220),
    }, {
      fetchImpl: async (url, opts) => {
        if (url.endsWith('/responses')) {
          const payload = JSON.parse(JSON.parse(opts.body).input);
          assert.equal(payload.user_hint, '看看这个杏皮茶');
          assert.match(payload.memory_reference.content, /测试用户常用餐具资料/);
          return { ok: true, json: async () => ({
            status: 'completed',
            output_text: JSON.stringify({
              name: '小杏运 敦煌杏皮茶',
              items: [{ name: '敦煌杏皮茶', portion: '750ml', calories: 140, protein_g: 0, carbs_g: 35, fat_g: 0 }],
              uncertainty: '已核实商品规格750ml',
            }),
            output: [
              { type: 'web_search_call', status: 'completed' },
              { type: 'message', content: [{ annotations: [{ type: 'url_citation', title: '商品详情', url: 'https://example.com/tea' }] }] },
            ],
          }) };
        }
        const data = JSON.parse(opts.body);
        if (data.messages?.[0]?.content?.includes('健康饮食顾问')) {
          return { ok: true, json: async () => ({
            choices: [{ message: { content: '识别到一瓶【小杏运 敦煌杏皮茶】（750ml）。请问你今天喝了多少呢？是全部喝完还是只喝了一部分？' } }],
          }) };
        }
        assert.match(data.messages[1].content[0].text, /历史记忆参考/);
        return { ok: true, json: async () => ({
          choices: [{ message: { content: JSON.stringify({
            is_food: true,
            name: '小杏运 敦煌杏皮茶',
            detected_text: '小杏运 敦煌杏皮茶 750ml',
            items: [{ name: '敦煌杏皮茶', portion: '750ml', calories: 140, protein_g: 0, carbs_g: 35, fat_g: 0 }],
            uncertainty: '按整瓶估算',
          }) } }],
        }) };
      },
    });

    assert.ok(turn1Result.reply.includes('喝了多少'));
    assert.equal(turn1Result.meal_draft.name, '小杏运 敦煌杏皮茶');
    assert.equal(turn1Result.meal_draft.items[0].calories, 140);
    assert.equal(turn1Result.meal_draft.search_status, 'used');
    assert.equal(turn1Result.meal_draft.sources[0].url, 'https://example.com/tea');

    const turn2Result = await chatMeal({
      messages: [
        { role: 'user', content: '看看这个杏皮茶', photo: img },
        { role: 'assistant', content: turn1Result.reply, meal_draft: turn1Result.meal_draft },
        { role: 'user', content: '我只喝了半瓶，大概 375ml' },
      ],
    }, {
      fetchImpl: async (url, opts) => {
        const data = JSON.parse(opts.body);
        assert.equal(data.model, 'MiniMax-M3.1-Flash');
        assert.ok(data.messages.some(m => typeof m.content === 'string' && m.content.includes('只喝了半瓶')));
        return { ok: true, json: async () => ({
          choices: [{
            message: {
              content: '好的！已按半瓶（375ml）折算，热量约为 70 kcal，碳水 17.5g。还有其他食物需要记录吗？\n\n```json\n' + JSON.stringify({
                is_food: true,
                name: '小杏运 敦煌杏皮茶',
                items: [{ name: '敦煌杏皮茶', portion: '375ml (半瓶)', calories: 70, protein_g: 0, carbs_g: 17.5, fat_g: 0 }],
                uncertainty: '份量依据用户反馈半瓶(375ml)折算',
              }) + '\n```',
            },
          }],
        }) };
      },
    });

    assert.ok(turn2Result.reply.includes('半瓶（375ml）折算'));
    assert.equal(turn2Result.meal_draft.items[0].portion, '375ml (半瓶)');
    assert.equal(turn2Result.meal_draft.items[0].calories, 70);
    assert.equal(turn2Result.meal_draft.items[0].carbs_g, 17.5);
    assert.equal(turn2Result.meal_draft.sources[0].url, 'https://example.com/tea');
    assert.equal(turn2Result.meal_draft.search_status, 'used');

    const mockChat = async (body) => {
      if (!body?.messages || body.messages.length === 0) throw new MealError('invalid_parameters', 400);
      assert.equal(body.messages.length, 1);
      return { reply: '你好', meal_draft: null };
    };
    const routeRes = await route('POST', '/api/meals/chat', { messages: [{ role: 'user', content: '你好' }] }, {}, undefined, { 'x-meal-client': 'healthy' }, mockChat);
    assert.equal(routeRes.code, 200);
    assert.equal(routeRes.data.reply, '你好');

    assert.equal((await route('POST', '/api/meals/chat', { messages: [] }, {}, undefined, { 'x-meal-client': 'healthy' }, mockChat)).code, 400);
    assert.equal((await route('GET', '/api/meals/chat', undefined, {}, undefined, { 'x-meal-client': 'healthy' }, mockChat)).code, 405);
    assert.equal((await route('POST', '/api/meals/chat', { messages: [{ role: 'user', content: 'test' }] }, {}, undefined, {}, mockChat)).code, 403);
  } finally {
    if (before === undefined) delete process.env.MINIMAX_CN_API_KEY;
    else process.env.MINIMAX_CN_API_KEY = before;
  }
});

test('multi-photo support allows multiple images in analyze, chat, save and retrieval', async () => {
  const before = process.env.MINIMAX_CN_API_KEY;
  process.env.MINIMAX_CN_API_KEY = 'test-not-real';
  try {
    const img1 = await image();
    const img2 = await image();

    // 1. analyzeMeal with multiple photos sends multiple image_urls
    let imageCountInAnalyze = 0;
    const analyzeResult = await analyzeMeal({ photos: [img1, img2], hint: '两张图' }, {
      fetchImpl: async (url, opts) => {
        if (url.endsWith('/chat/completions')) {
          const data = JSON.parse(opts.body);
          const userContent = data.messages[1].content;
          imageCountInAnalyze = userContent.filter(c => c.type === 'image_url').length;
          return { ok: true, json: async () => ({
            choices: [{
              message: {
                content: JSON.stringify({
                  is_food: true,
                  name: '双拼套餐',
                  items: [
                    { name: '主食', portion: '一份', calories: 300, protein_g: 10, carbs_g: 50, fat_g: 5 },
                    { name: '饮品', portion: '一杯', calories: 80, protein_g: 0, carbs_g: 20, fat_g: 0 },
                  ],
                  uncertainty: '综合两张照片估算',
                }),
              },
            }],
          }) };
        }
        return { ok: true, json: async () => ({ status: 'completed', output_text: '', output: [] }) };
      },
    });
    assert.equal(imageCountInAnalyze, 2);
    assert.equal(analyzeResult.name, '双拼套餐');
    assert.equal(analyzeResult.items.length, 2);

    // 2. chatMeal with multiple photos on turn 1
    let imageCountInChat = 0;
    const chatResult = await chatMeal({
      messages: [{ role: 'user', content: '这是我的午餐', photos: [img1, img2] }],
    }, {
      fetchImpl: async (url, opts) => {
        if (url.endsWith('/chat/completions')) {
          const data = JSON.parse(opts.body);
          const userMsg = data.messages.find(m => m.role === 'user');
          if (Array.isArray(userMsg?.content)) {
            imageCountInChat = userMsg.content.filter(c => c.type === 'image_url').length;
          }
          return { ok: true, json: async () => ({
            choices: [{
              message: {
                content: JSON.stringify({
                  is_food: true,
                  name: '双拼套餐',
                  items: [{ name: '食物', portion: '1份', calories: 380, protein_g: 10, carbs_g: 70, fat_g: 5 }],
                  uncertainty: '综合分析',
                }),
              },
            }],
          }) };
        }
        return { ok: true, json: async () => ({ status: 'completed', output_text: '', output: [] }) };
      },
    });
    assert.equal(imageCountInChat, 2);
    assert.equal(chatResult.meal_draft.name, '双拼套餐');

    // 3. HTTP route saves photos array and serves photos by index
    let savedPhotos = null;
    const mockStore = {
      save: async (record, photos, updating) => {
        savedPhotos = photos;
        return { ...record, photo_count: photos.length, photo_urls: photos.map((_, i) => `/api/meals/${record.id}/photos/${i}`) };
      },
      photo: async (id, index) => {
        if (index === 0) return { photo: Buffer.from('photo-0'), photo_mime: 'image/jpeg' };
        if (index === 1) return { photo: Buffer.from('photo-1'), photo_mime: 'image/jpeg' };
        return null;
      },
    };

    const postRes = await route('POST', '/api/meals', { ...meal, photos: [img1, img2] }, mockStore);
    assert.equal(postRes.code, 201);
    assert.equal(savedPhotos.length, 2);

    const getPhoto0 = await route('GET', `/api/meals/${id}/photos/0`, undefined, mockStore);
    assert.equal(getPhoto0.code, 200);
    assert.equal(getPhoto0.bytes.toString(), 'photo-0');

    const getPhoto1 = await route('GET', `/api/meals/${id}/photos/1`, undefined, mockStore);
    assert.equal(getPhoto1.code, 200);
    assert.equal(getPhoto1.bytes.toString(), 'photo-1');

    const getPhotoNotFound = await route('GET', `/api/meals/${id}/photos/2`, undefined, mockStore);
    assert.equal(getPhotoNotFound.code, 404);
  } finally {
    if (before === undefined) delete process.env.MINIMAX_CN_API_KEY;
    else process.env.MINIMAX_CN_API_KEY = before;
  }
});

