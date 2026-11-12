const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { webcrypto } = require('node:crypto');

function harness({ crypto, draft = {}, id = null } = {}) {
  const code = fs.readFileSync(require.resolve('../app.js'), 'utf8');
  const state = { chats: [], date: '2026-10-29', page: 'home' };
  const piMeal = { id, draft: null };
  const context = {
    state, piMeal, crypto, Uint8Array, Intl, Date, AbortController, TextDecoder,
    setInterval: () => 1, clearInterval() {}, render() {}, updateChatLogs() {},
    document: { querySelectorAll: () => [] },
    fetch: async () => {
      let sent = false;
      const events = [
        { type: 'meal_draft', draft },
        { type: 'text', delta: '请核对餐食' },
        { type: 'done', answer: '请核对餐食' },
      ];
      return { ok: true, body: { getReader: () => ({ read: async () => {
        if (sent) return { done: true };
        sent = true;
        return { done: false, value: new TextEncoder().encode(events.map(e => JSON.stringify(e)).join('\n') + '\n') };
      } }) } };
    },
  };
  const start = code.includes('function createMealId(') ? 'function createMealId(' : 'function chatErrorMessage(';
  vm.runInNewContext(code.slice(code.indexOf(start), code.lastIndexOf('state.journalMonth =')), context);
  return { context, state, piMeal };
}

test('LAN HTTP chat receives a meal draft without crypto.randomUUID', async () => {
  const { context, state, piMeal } = harness({ crypto: { getRandomValues: a => webcrypto.getRandomValues(a) } });
  await context.sendMessage('午餐吃了米饭');
  assert.equal(state.chats.at(-1).text, '请核对餐食');
  assert.match(piMeal.id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  const id = piMeal.id;
  await context.sendMessage('再加一点蔬菜');
  assert.equal(piMeal.id, id, 'draft edits keep the save idempotency key');
  assert.equal(state.chatPending, false);
});

test('LAN HTTP copied meal gets a fresh UUID and completes the reply', async () => {
  const { context, state, piMeal } = harness({ crypto: { getRandomValues: a => webcrypto.getRandomValues(a) }, id: 'previous-id', draft: { copied_from: 'source-meal' } });
  await context.sendMessage('复制昨天的午餐');
  assert.equal(state.chats.at(-1).text, '请核对餐食');
  assert.notEqual(piMeal.id, 'previous-id');
  assert.match(piMeal.id, /^[0-9a-f-]{36}$/);
  const id = piMeal.id;
  await context.sendMessage('确认一下');
  assert.equal(piMeal.id, id);
});

test('secure contexts keep using the native UUID method', async () => {
  const { context, piMeal, state } = harness({ crypto: { randomUUID: () => 'c4164fe6-457b-4fa1-b027-ea649d407294' } });
  await context.sendMessage('记录午餐');
  assert.equal(state.chats.at(-1).text, '请核对餐食');
  assert.equal(piMeal.id, 'c4164fe6-457b-4fa1-b027-ea649d407294');
});
