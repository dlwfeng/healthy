import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Writable } from 'node:stream';
import { handleMobileRelease } from '../src/mobile-releases.js';

// Exercise streaming and failures without starting any extra listening ports.
async function fixture(t) {
  const directory = await mkdtemp(join(tmpdir(), 'healthy-release-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const bytes = Buffer.from('apk-test-bytes');
  const release = {
    version: '1.0.2', buildNumber: 3, packageName: 'com.example.zhixu_mobile',
    size: bytes.length, sha256: 'a'.repeat(64), notes: '新增应用内更新',
    publishedAt: '2026-10-25T02:00:00Z', filename: `3-${'a'.repeat(64)}.apk`,
  };
  async function request(path = 'latest', method = 'GET') {
    const chunks = [];
    const res = new Writable({ write(chunk, encoding, done) { chunks.push(chunk); done(); } });
    res.writeHead = (status, headers) => { res.status = status; res.headers = headers; };
    const respond = (output, status, value) => {
      output.writeHead(status, {}); output.end(JSON.stringify(value));
    };
    await handleMobileRelease({ method }, res,
      new URL(`http://localhost/api/mobile/releases/${path}`), respond, directory);
    return { status: res.status, headers: res.headers, body: Buffer.concat(chunks) };
  }
  return { directory, release, bytes, request };
}

test('unpublished is explicit; a missing APK or corrupt metadata is never advertised', async t => {
  const { directory, release, request } = await fixture(t);
  assert.deepEqual(JSON.parse((await request()).body), { release: null });
  await writeFile(join(directory, 'latest.json'), JSON.stringify(release));
  assert.equal((await request()).status, 404);
  await writeFile(join(directory, release.filename), 'wrong size');
  assert.equal((await request()).status, 503);
  await writeFile(join(directory, 'latest.json'), '{broken');
  assert.equal((await request()).status, 503);
});

test('manifest points to immutable streamed APK; old downloads survive a later release', async t => {
  const { directory, release, bytes, request } = await fixture(t);
  await writeFile(join(directory, release.filename), bytes);
  await writeFile(join(directory, 'latest.json'), JSON.stringify(release));
  const metadata = JSON.parse((await request()).body).release;
  assert.equal(metadata.downloadPath, `/api/mobile/releases/${release.filename}`);
  assert.equal(metadata.filename, undefined);
  const apk = await request(release.filename);
  assert.equal(apk.status, 200);
  assert.deepEqual(apk.body, bytes);
  assert.equal(apk.headers['Content-Length'], bytes.length);
  assert.equal(apk.headers['Content-Type'], 'application/vnd.android.package-archive');
  assert.equal((await request(release.filename, 'HEAD')).body.length, 0);
  await writeFile(join(directory, 'latest.json'), JSON.stringify({ ...release,
    buildNumber: 4, filename: `4-${release.sha256}.apk` }));
  assert.deepEqual((await request(release.filename)).body, bytes);
});

test('rejects arbitrary paths, writes, package mismatch and untrusted download filenames', async t => {
  const { directory, release, request } = await fixture(t);
  assert.equal((await request('latest', 'POST')).status, 405);
  assert.equal((await request('latest.json')).status, 404);
  assert.equal((await request('%2e%2e%2flatest.json')).status, 404);
  for (const change of [{ filename: '../secret.apk' }, { packageName: 'other.app' },
    { size: -1 }, { buildNumber: '3' }, { sha256: 'invalid' }]) {
    await writeFile(join(directory, 'latest.json'), JSON.stringify({ ...release, ...change }));
    assert.equal((await request()).status, 503);
  }
});
