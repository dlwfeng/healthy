import test from 'node:test';
import assert from 'node:assert/strict';
import { HISTORY_METRICS } from '../src/normalize.js';

test('body battery history uses the daily summary reading and preserves missing values', () => {
  const metric = HISTORY_METRICS.bodyBattery;
  assert.equal(metric.tool, 'get_user_summary');
  assert.equal(metric.unit, '/100');
  assert.equal(metric.value({ bodyBatteryMostRecentValue: 64 }), 64);
  assert.equal(metric.value({ bodyBatteryMostRecentValue: 0 }), 0);
  for (const value of [undefined, null, -1, 101, '64']) {
    assert.equal(metric.value({ bodyBatteryMostRecentValue: value }), null);
  }
});
