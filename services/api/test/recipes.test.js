import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { makeServer } from '../src/server.js';
import { recipeParameters } from '../src/recipes.js';
import { validateManifest, importRecipes } from '../scripts/import-recipes.js';

// Exercise the real request handler without binding a temporary port.
async function request(path, options = {}) {
  const server = makeServer({ cookbookStore: options.store || {
    list: async params => ({ recipes: [], total: 0, params }),
    get: async () => null, image: async () => null,
  } });
  return new Promise(resolve => {
    const response = { status: 0, headers: {},
      writeHead(status, headers) { this.status = status; this.headers = headers; },
      end(body) { resolve({ status: this.status, headers: this.headers, body }); },
    };
    server.emit('request', { url: path, method: options.method || 'GET',
      headers: { host: '127.0.0.1:8060', ...options.headers } }, response);
  });
}

const manifest = () => ({ format_version: 1,
  source: { title: '测试食谱', author: '测试作者', filename: 'fixture.pdf', sha256: 'a'.repeat(64), page_count: 10 },
  recipes: [{ title: '番茄配豆子', category: '蔬菜', servings: '2人份', description: '', source_page: 2, source_page_end: 3,
    original_text: '测试配料和步骤', ingredients: [{ position: 1, name: '番茄', text: '2 个番茄', quantity: '2', unit: '个' }],
    steps: ['将食材混合。'], notes: '', images: [] }] });

test('recipe filters reject excessive input and invalid pagination', () => {
  for (const page of ['0', '-1', '1.5', 'abc', '1000000']) assert.equal(recipeParameters(new URLSearchParams({ page })), null);
  assert.equal(recipeParameters(new URLSearchParams({ q: 'x'.repeat(101) })), null);
  assert.deepEqual(recipeParameters(new URLSearchParams({ q: ' 番茄 ', category: '海鲜', page: '2' })),
    { q: '番茄', category: '海鲜', page: 2, pageSize: 18 });
});

test('recipe routes stay read only, validate filters and expose distinct error states', async () => {
  assert.equal((await request('/api/recipes', { method: 'POST' })).status, 405);
  assert.equal((await request('/api/recipes?page=-1')).status, 400);
  assert.equal((await request('/api/recipes/1')).status, 404);
  assert.equal((await request('/api/recipes/1/images/0')).status, 404);
  assert.equal((await request('/api/recipes/1/images/-1')).status, 404);
  assert.equal((await request('/api/recipes/99999999999999999999')).status, 404);
  assert.equal((await request('/api/recipes', { headers: { origin: 'https://evil.example' } })).status, 403);
  const result = await request('/api/recipes?q=%E7%95%AA%E8%8C%84&page=2');
  assert.equal(result.status, 200);
  assert.equal(JSON.parse(result.body).params.q, '番茄');
  assert.equal((await request('/api/recipes', { store: { list: async () => { throw Error('private DB error'); } } })).body,
    JSON.stringify({ error: 'database_unavailable' }));
});

test('recipe image route returns bytes and supports conditional requests', async () => {
  const store = { image: async (id, index) => { assert.equal(id, '7'); assert.equal(index, 0);
    return { mime_type: 'image/jpeg', sha256: 'b'.repeat(64), data_base64: Buffer.from('image bytes').toString('base64') }; } };
  const first = await request('/api/recipes/7/images/0', { store });
  assert.equal(first.headers['Content-Type'], 'image/jpeg');
  assert.equal(first.body.toString(), 'image bytes');
  const cached = await request('/api/recipes/7/images/0', { store, headers: { 'if-none-match': first.headers.ETag } });
  assert.equal(cached.status, 304);
  assert.equal(cached.body, undefined);
});

test('cookbook manifest rejects duplicate recipes, broken order and corrupt photos before writing', () => {
  assert.ok(validateManifest(manifest()));
  const duplicate = manifest(); duplicate.recipes.push(duplicate.recipes[0]);
  assert.throws(() => validateManifest(duplicate), /Invalid recipe/);
  const noSteps = manifest(); noSteps.recipes[0].steps = [];
  assert.throws(() => validateManifest(noSteps), /Invalid recipe/);
  const order = manifest(); order.recipes[0].ingredients[0].position = 2;
  assert.throws(() => validateManifest(order), /Invalid ingredient/);
  const corrupt = manifest(); corrupt.recipes[0].images = [{ mime_type: 'image/jpeg', data_base64: 'no-photo' }];
  assert.throws(() => validateManifest(corrupt), /Invalid photograph/);
  const bytes = Buffer.concat([Buffer.from([0xff, 0xd8]), Buffer.alloc(200)]);
  const misplaced = manifest(); misplaced.recipes[0].images = [{ mime_type: 'image/jpeg', source_page: 9,
    data_base64: bytes.toString('base64'), sha256: createHash('sha256').update(bytes).digest('hex') }];
  assert.throws(() => validateManifest(misplaced), /Invalid photograph/);
});

test('cookbook import rolls back on ingredient failure and uses upsert for repeat imports', async () => {
  const queries = [];
  const db = { query: async (sql, values) => {
    queries.push({ sql, values });
    if (sql.startsWith('INSERT INTO recipes')) return { rows: [{ id: '1' }] };
    if (sql.startsWith('INSERT INTO recipe_ingredients')) throw Error('simulated failure');
    return { rows: [] };
  } };
  await assert.rejects(importRecipes(db, manifest()), /simulated failure/);
  assert.equal(queries.at(-1).sql, 'ROLLBACK');
  assert.equal(queries.some(q => q.sql === 'COMMIT'), false);
  const insert = queries.find(q => q.sql.startsWith('INSERT INTO recipes'));
  assert.match(insert.sql, /ON CONFLICT \(source_sha256, source_page\) DO UPDATE/);
  assert.equal(insert.values[0], '番茄配豆子');
  assert.equal(insert.sql.includes('番茄配豆子'), false);
});
