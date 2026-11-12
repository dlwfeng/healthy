import Database from 'better-sqlite3';
import { join } from 'node:path';
import { access } from 'node:fs/promises';
import { agentDir } from './pi-runtime.js';

// Read the extension's authoritative store without initializing or mutating it.
export async function readHealthMemories(root = agentDir) {
  const file = join(root, 'pi-hermes-memory', 'sessions.db');
  try { await access(file); }
  catch (error) { if (error.code === 'ENOENT') return { entries: [] }; throw error; }
  const db = new Database(file, { readonly: true, fileMustExist: true, timeout: 3000 });
  try {
    const entries = db.prepare('SELECT id, target, content, created FROM memories ORDER BY created DESC, id DESC').all()
      .map(({ id, target, content, created }) => ({ id, kind: target === 'user' ? 'profile' : target === 'failure' ? 'learning' : 'memory', content, created_at: created }));
    return { entries };
  } finally { db.close(); }
}
