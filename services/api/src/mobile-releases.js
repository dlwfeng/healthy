import { open, readFile, stat } from 'node:fs/promises';
import { constants } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const mobileReleaseDirectory = process.env.MOBILE_RELEASE_DIR ||
  fileURLToPath(new URL('../../../data/mobile-releases/', import.meta.url));
const apkName = /^[1-9]\d{0,9}-[a-f0-9]{64}\.apk$/;

export function validMobileRelease(value) {
  return value && /^\d+\.\d+\.\d+$/.test(value.version) &&
    Number.isSafeInteger(value.buildNumber) && value.buildNumber > 0 &&
    value.buildNumber <= 2100000000 &&
    value.packageName === 'com.example.zhixu_mobile' &&
    Number.isSafeInteger(value.size) && value.size > 0 && value.size <= 512 * 1024 * 1024 &&
    /^[a-f0-9]{64}$/.test(value.sha256) &&
    value.filename === `${value.buildNumber}-${value.sha256}.apk` &&
    apkName.test(value.filename) && typeof value.notes === 'string' &&
    value.notes.length <= 10000 && typeof value.publishedAt === 'string' &&
    Number.isFinite(Date.parse(value.publishedAt));
}

export async function handleMobileRelease(req, res, url, respond, directory = mobileReleaseDirectory) {
  if (!url.pathname.startsWith('/api/mobile/releases/')) return false;
  if (!['GET', 'HEAD'].includes(req.method)) {
    respond(res, 405, { error: 'method_not_allowed' });
    return true;
  }
  const name = url.pathname.slice('/api/mobile/releases/'.length);
  try {
    if (name === 'latest') {
      let release;
      try {
        release = JSON.parse(await readFile(join(directory, 'latest.json'), 'utf8'));
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
        respond(res, 200, { release: null });
        return true;
      }
      if (!validMobileRelease(release)) throw new Error('invalid_release');
      const info = await stat(join(directory, release.filename));
      if (!info.isFile() || info.size !== release.size) throw new Error('invalid_apk');
      const { filename, ...metadata } = release;
      respond(res, 200, { release: {
        ...metadata, downloadPath: `/api/mobile/releases/${filename}`,
      } });
      return true;
    }
    if (!apkName.test(name)) {
      respond(res, 404, { error: 'not_found' });
      return true;
    }
    const file = await open(resolve(directory, name), constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
      const info = await file.stat();
      if (!info.isFile()) throw new Error('invalid_apk');
      res.writeHead(200, {
        'Content-Type': 'application/vnd.android.package-archive',
        'Content-Length': info.size,
        'Content-Disposition': `attachment; filename="healthy-${name}"`,
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
      });
      if (req.method === 'HEAD') res.end();
      else await pipeline(file.createReadStream({ autoClose: false }), res);
    } finally {
      await file.close();
    }
  } catch (error) {
    if (res.headersSent) res.destroy();
    else respond(res, error.code === 'ENOENT' ? 404 : 503, {
      error: error.code === 'ENOENT' ? 'not_found' : 'mobile_release_unavailable',
    });
  }
  return true;
}
