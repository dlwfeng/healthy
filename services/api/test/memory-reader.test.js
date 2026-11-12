import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { EventEmitter } from 'node:events';
import { mkdtemp, rm, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readHealthMemories } from '../src/memory-reader.js';
import { makeServer } from '../src/server.js';

test('reading memory before the first conversation returns empty without creating files', async () => {
  const root = await mkdtemp(join(tmpdir(), 'memory-reader-'));
  try {
    assert.deepEqual(await readHealthMemories(root), { entries: [] });
    assert.deepEqual(await readdir(root), []);
  } finally { await rm(root, { recursive: true, force: true }); }
});

async function request(memoryReader, { method = 'GET', origin } = {}) {
  const server = makeServer({ memoryReader });
  const req = Readable.from([]);
  req.url = '/api/memory'; req.method = method;
  req.headers = { host: '127.0.0.1:8060', ...(origin ? { origin } : {}) };
  const res = new EventEmitter();
  let code, headers, body;
  res.writeHead = (status, values) => { code = status; headers = values; };
  res.end = value => { body = JSON.parse(value); };
  await server.listeners('request')[0](req, res);
  server.close();
  return { code, headers, body };
}

test('memory listing is read-only, uncached and rejects cross-origin reads', async () => {
  let reads = 0;
  const reader = async () => { reads++; return { entries: [{ id: 1, content: '<script>plain text</script>' }] }; };
  const result = await request(reader);
  assert.equal(result.code, 200);
  assert.equal(result.headers['Cache-Control'], 'no-store');
  assert.equal(result.body.entries[0].content, '<script>plain text</script>');
  assert.equal((await request(reader, { method: 'POST' })).code, 405);
  assert.equal((await request(reader, { origin: 'https://untrusted.example' })).code, 403);
  assert.equal(reads, 1);
});

test('memory read failures return a recoverable error without paths or database details', async () => {
  const result = await request(async () => { throw Error('private /secret/path database details'); });
  assert.equal(result.code, 503);
  assert.deepEqual(result.body, { error: 'memory_unavailable' });
});
