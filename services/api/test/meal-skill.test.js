import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { EventEmitter } from 'node:events';
import { runMealSkill, makeMealRecordingTool } from '../src/meal-skill.js';
import { makeServer } from '../src/server.js';

test('meal Skill preserves original image/history and publishes an unsaved draft', async () => {
  const messages = [{ role: 'user', content: '喝了半瓶', photo: { data_base64: 'original' } }];
  const draft = { name: '杏皮茶', items: [{ portion: '375 ml', calories: 70 }] };
  const events = [];
  const chatter = async input => { assert.equal(input.messages, messages); return { reply: '请核对草稿', meal_draft: draft }; };
  assert.equal(await runMealSkill({ messages, chatter, onEvent: e => events.push(e) }), '请核对草稿');
  assert.deepEqual(events.map(e => e.type), ['tool_start', 'meal_draft', 'tool_end', 'text']);
  assert.equal(events[1].draft, draft);
  const tool = makeMealRecordingTool({ messages, chatter, onEvent: e => events.push(e) });
  const result = JSON.parse((await tool.execute('1', {})).content[0].text);
  assert.deepEqual(result.meal_draft, draft);
});

test('failed recognition exposes a failed process step and retains engine error', async () => {
  const events = [];
  await assert.rejects(runMealSkill({ messages: [], onEvent: e => events.push(e), chatter: async () => { throw Error('analysis_busy'); } }), /analysis_busy/);
  assert.equal(events.at(-1).success, false);
  assert.equal(events.some(e => e.type === 'meal_draft'), false);
});

// Exercise the actual HTTP handler without opening any test port.
async function request(server, body, stream = false) {
  const req = Readable.from([Buffer.from(JSON.stringify(body))]);
  req.url = '/api/chat'; req.method = 'POST';
  req.headers = { host: '127.0.0.1:8060', ...(stream ? { accept: 'application/x-ndjson' } : {}) };
  const res = new EventEmitter();
  let output = '';
  res.writeHead = status => { res.statusCode = status; };
  res.write = chunk => { output += chunk; };
  res.end = chunk => { output += chunk ?? ''; };
  await server.listeners('request')[0](req, res);
  return { status: res.statusCode, body: stream ? output.trim().split('\n').map(JSON.parse) : JSON.parse(output) };
}
test('unified 健康助手 endpoint supports meal Skill NDJSON, JSON and ordinary 健康助手 with Garmin offline', async () => {
  const oldKey = process.env.MINIMAX_CN_API_KEY;
  process.env.MINIMAX_CN_API_KEY = 'local-test-only';
  try {
    let normal = 0, meals = 0;
    const server = makeServer({ configStatus: async () => 'garmin_unavailable',
      mealChatter: async ({ messages }) => { meals++; assert.equal(messages[0].content, '记午餐'); return { reply: '待核对', meal_draft: { name: '午餐', items: [] } }; },
      chatService: async ({ selectedSkill, messages, onEvent, mealChatter }) => {
        if (selectedSkill === 'meal-recording') return runMealSkill({ messages, onEvent, chatter: mealChatter });
        normal++; return '健康助手回答';
      },
    });
    const body = { date: '2026-10-20', messages: [{ role: 'user', content: '记午餐' }], skill: 'meal-recording' };
    const streamed = await request(server, body, true);
    assert.equal(streamed.status, 200);
    assert.equal(streamed.body.at(-1).type, 'done');
    assert.equal(streamed.body.at(-1).meal_draft.name, '午餐');
    assert.equal(streamed.body.find(e => e.type === 'tool_start').tool, 'record_meal');
    const json = await request(server, body);
    assert.equal(json.body.answer, '待核对'); assert.equal(meals, 2); assert.equal(normal, 0);
    const ordinary = await request(server, { ...body, skill: undefined });
    assert.equal(ordinary.body.answer, '健康助手回答'); assert.equal(normal, 1);
    assert.equal((await request(server, { ...body, skill: 'unknown' })).status, 400);
    server.close();
  } finally {
    if (oldKey === undefined) delete process.env.MINIMAX_CN_API_KEY;
    else process.env.MINIMAX_CN_API_KEY = oldKey;
  }
});
