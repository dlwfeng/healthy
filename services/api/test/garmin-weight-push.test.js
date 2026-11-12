import test from 'node:test';
import assert from 'node:assert/strict';
import { pushWeighInsToGarmin } from '../src/body-measurements.js';

function fakeStore({ pushSince = null, rows = [] } = {}) {
  const calls = { setSince: 0, marked: [] };
  let since = pushSince;
  return {
    calls,
    async state() { return { garminPushSince: since }; },
    async setGarminPushSince(when) { calls.setSince++; since = when.toISOString(); },
    async pendingGarmin() { return rows; },
    async markGarminSynced(list) { calls.marked.push(...list); },
  };
}

const row = (iso, kg) => ({ measuredAt: iso, weightKg: kg });

test('首次启用只记录起点，不回溯历史记录', async () => {
  const store = fakeStore({ rows: [row('2026-11-08T01:30:42.000Z', 71.5)] });
  const garmin = { call: async () => assert.fail('不应该写 Garmin') };
  const result = await pushWeighInsToGarmin({ store, garmin, log: { error() {} } });
  assert.deepEqual(result, { baselineSet: true, pushed: 0, existing: 0 });
  assert.equal(store.calls.setSince, 1);
});

test('只推送起点之后且 Garmin 没有的新记录', async () => {
  const store = fakeStore({
    pushSince: '2026-11-01T00:00:00.000Z',
    rows: [
      row('2026-11-08T01:30:42.000Z', 71.5),
      row('2026-11-09T01:30:00.000Z', 71.2),
    ],
  });
  const written = [];
  const garmin = {
    async call(name, args) {
      if (name === 'get_body_composition') {
        // Garmin 已有 11-08 的 71.5
        return { dateWeightList: [{ calendarDate: '2026-11-08', weight: 71500 }] };
      }
      written.push(args);
      return {};
    },
  };

  const result = await pushWeighInsToGarmin({ store, garmin, log: { error() {} } });
  assert.deepEqual(result, { pushed: 1, existing: 1, failed: 0 });
  assert.equal(written.length, 1);
  assert.equal(written[0].weight_kg, 71.2);
  assert.equal(written[0].timestamp, '2026-11-09T09:30:00+08:00');
  assert.equal(store.calls.marked.length, 2);
});

test('读不到 Garmin 现有记录时宁可不写', async () => {
  const store = fakeStore({ pushSince: '2026-11-01T00:00:00.000Z', rows: [row('2026-11-08T01:30:42.000Z', 71.5)] });
  const garmin = { call: async () => { throw new Error('garmin_unavailable'); } };
  const result = await pushWeighInsToGarmin({ store, garmin, log: { error() {} } });
  assert.deepEqual(result, { skipped: 'garmin_unavailable' });
  assert.equal(store.calls.marked.length, 0);
});

test('写入失败时保留未同步状态，下一轮重试', async () => {
  const store = fakeStore({ pushSince: '2026-11-01T00:00:00.000Z', rows: [row('2026-11-08T01:30:42.000Z', 71.5)] });
  let reads = 0;
  const garmin = {
    async call(name) {
      if (name === 'get_body_composition') { reads++; return { dateWeightList: [] }; }
      throw new Error('write_failed');
    },
  };
  const result = await pushWeighInsToGarmin({ store, garmin, log: { error() {} } });
  assert.equal(reads, 1);
  assert.equal(result.pushed, 0);
  assert.equal(result.failed, 1);
  assert.equal(store.calls.marked.length, 0);
});
