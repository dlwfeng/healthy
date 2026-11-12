import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeGarminProfile, ageBand } from '../src/nutrition-profile.js';
import { makeServer } from '../src/server.js';
import { READ_TOOLS, PROFILE_READ_TOOLS } from '../src/garmin.js';

test('Garmin profile keeps only valid birth date and sex, with birthday-aware age bands', () => {
  assert.deepEqual(normalizeGarminProfile({ userData: { birthDate: '1980-10-16', gender: 'MALE', fullName: 'Private' } }), { birthDate: '1980-10-16', sex: 'male' });
  assert.equal(normalizeGarminProfile({ userData: { birthDate: '1980-02-30', gender: 'MALE' } }), null);
  assert.equal(normalizeGarminProfile({ userData: { birthDate: '1980-10-16', gender: 'UNKNOWN' } }), null);
  assert.equal(ageBand('1976-10-17', '2026-10-16'), '18-49');
  assert.equal(ageBand('1976-10-16', '2026-10-16'), '50-64');
  assert.equal(ageBand('2010-10-16', '2026-10-16'), null);
});

test('profile is available to backend sync and exposed in the full 健康助手 Garmin catalog', () => {
  assert.ok(PROFILE_READ_TOOLS.includes('get_user_profile'));
  assert.ok(READ_TOOLS.includes('get_user_profile'));
});

test('nutrition profile route syncs missing data and returns only a public age band', async () => {
  let synced = false;
  const server = makeServer({ profileStore: {
    async publicProfile() { return synced ? { status: 'ready', profile: { age_band: '18-49', sex: 'male', synced_at: '2026-10-16T00:00:00Z' } } : { status: 'missing', profile: null }; },
    async syncIfDue(client) { assert.ok(client); synced = true; },
  } });
  const result = await new Promise(resolve => {
    const chunks = [];
    const res = { writeHead(code) { this.code = code; }, end(bytes) { chunks.push(bytes); resolve({ code: this.code, body: JSON.parse(chunks.join('')) }); } };
    server.emit('request', { method: 'GET', url: '/api/nutrition-profile', headers: { host: 'localhost:4173' } }, res);
  });
  server.close();
  assert.equal(result.code, 200);
  assert.equal(result.body.profile.age_band, '18-49');
  assert.equal(JSON.stringify(result.body).includes('birthDate'), false);
});
