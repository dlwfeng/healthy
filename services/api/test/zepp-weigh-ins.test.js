import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeWeighIn, fetchAllWeighIns, ZeppAuthError } from '../src/zepp-weigh-ins.js';

const raw = {
  userId: '1000000001', memberId: '-1', deviceSource: 101,
  generatedTime: 1767260000, createTime: 1767259900, weightType: 0, deviceId: '0000000000000000',
  summary: {
    weight: 68.4, height: 170, bmi: 23.7, fatRate: 22.531, bodyWaterRate: 53.812,
    boneMass: 2.76, metabolism: 1520, muscleRate: 45.274, muscleAge: 30,
    proteinRatio: 18.423, standBodyWeight: 62.5, visceralFat: 8, impedance: 512,
    encryptImpedance: '512', bodyScore: 81, bodyStyle: 5, deviceType: 1, source: 1,
  },
};

test('体重按千克保存并按界面精度取整，不做克换算', () => {
  const row = normalizeWeighIn(raw);
  assert.equal(row.weightKg, 68.4);
  assert.equal(row.measuredAt, '2026-01-01T09:33:20.000Z');
  assert.equal(row.heightCm, 170);
  assert.equal(row.bodyFatPct, 22.5);
  assert.equal(row.bodyWaterPct, 53.8);
  assert.equal(row.muscleRatePct, 45.3);
  assert.equal(row.proteinPct, 18.4);
  assert.equal(row.boneMassKg, 2.76);
  assert.equal(row.basalMetabolismKcal, 1520);
  assert.equal(row.visceralFat, 8);
  assert.equal(row.bodyScore, 81);
  assert.equal(row.deviceSource, 101);
});

test('缺失字段保持 null，不用 0 冒充', () => {
  const row = normalizeWeighIn({ generatedTime: 1794101442, summary: { weight: 70 } });
  assert.equal(row.weightKg, 70);
  for (const key of ['bmi', 'bodyFatPct', 'bodyWaterPct', 'muscleRatePct', 'proteinPct', 'boneMassKg', 'basalMetabolismKcal', 'visceralFat', 'bodyScore']) {
    assert.equal(row[key], null, key);
  }
});

test('没有有效时间或体重的记录被丢弃', () => {
  assert.equal(normalizeWeighIn({ summary: { weight: 70 } }), null);
  assert.equal(normalizeWeighIn({ generatedTime: 1794101442, summary: { weight: 0 } }), null);
  assert.equal(normalizeWeighIn({ generatedTime: 1794101442, summary: { weight: 70000 } }), null);
});

test('401 抛 ZeppAuthError，供页面提示重新授权', async () => {
  const fetchImpl = async () => ({ status: 401, ok: false, json: async () => ({}) });
  await assert.rejects(
    () => fetchAllWeighIns({ token: 't', userId: '1', fetchImpl }),
    (err) => err instanceof ZeppAuthError,
  );
});

test('超出单页上限时按时间向前翻页并去重', async () => {
  const pages = [
    { items: [item(3000), item(2000)] },
    { items: [item(1000)] },
  ];
  let call = 0;
  const fetchImpl = async () => ({ status: 200, ok: true, json: async () => pages[call++] });

  function item(seconds) {
    return { generatedTime: seconds, summary: { weight: 70 + seconds / 10000 } };
  }

  const rows = await fetchAllWeighIns({ token: 't', userId: '1', fetchImpl, limit: 2, now: 4000 * 1000 });
  assert.equal(call, 2);
  assert.deepEqual(rows.map((r) => r.weightKg), [70.1, 70.2, 70.3]);
});

test('单页未填满时不再请求下一页', async () => {
  let call = 0;
  const fetchImpl = async () => {
    call++;
    return { status: 200, ok: true, json: async () => ({ items: [{ generatedTime: 1794101442, summary: { weight: 71.5 } }] }) };
  };
  const rows = await fetchAllWeighIns({ token: 't', userId: '1', fetchImpl, limit: 300 });
  assert.equal(call, 1);
  assert.equal(rows.length, 1);
});

test('未配置时直接报 zepp_not_configured，不发请求', async () => {
  await assert.rejects(
    () => fetchAllWeighIns({ token: '', userId: '', fetchImpl: async () => assert.fail('不该发请求') }),
    /zepp_not_configured/,
  );
});
