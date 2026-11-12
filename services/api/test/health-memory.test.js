import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const root = await mkdtemp(join(tmpdir(), 'health-memory-'));
process.env.HEALTH_AGENT_DIR = root;
const { memoryExtensionPaths, memoryToolNames, startMemorySession, closeMemorySession } = await import('../src/health-memory.js');
const { modelReady, serviceDir, agentDir } = await import('../src/pi-runtime.js');
const { readHealthMemories } = await import('../src/memory-reader.js');
const { createAgentSession, DefaultResourceLoader, SessionManager, SettingsManager } = await import('@earendil-works/pi-coding-agent');

async function open() {
  const settingsManager = SettingsManager.create(serviceDir, agentDir);
  const resourceLoader = new DefaultResourceLoader({
    cwd: serviceDir, agentDir, settingsManager, systemPrompt: '你是健康助手。',
    noExtensions: true, additionalExtensionPaths: await memoryExtensionPaths(),
    noSkills: true, noPromptTemplates: true, noThemes: true, noContextFiles: true,
  });
  await resourceLoader.reload();
  assert.deepEqual(resourceLoader.getExtensions().errors, []);
  const models = await modelReady;
  const { session } = await createAgentSession({
    cwd: serviceDir, agentDir, resourceLoader, settingsManager,
    sessionManager: SessionManager.inMemory(serviceDir),
    modelRuntime: models, model: models.getModel('minimax-cn', 'MiniMax-M3.1-Flash'),
    noTools: 'all', tools: memoryToolNames,
  });
  await startMemorySession(session);
  return session;
}
async function call(session, name, args) {
  const tool = session.getToolDefinition(name);
  assert.ok(tool);
  return tool.execute('test-memory', args, undefined, undefined, session.extensionRunner.createContext());
}

test('native extension persists, recalls, corrects and deletes Chinese facts across fresh sessions', async () => {
  let session;
  try {
    session = await open();
    assert.deepEqual(session.getActiveToolNames().sort(), [...memoryToolNames].sort());
    const saved = await call(session, 'memory_add', { target: 'user', content: '测试用户常用陶瓷饭碗容量为450毫升。' });
    assert.equal(saved.details.success, true);
    const visible = await readHealthMemories(root);
    assert.equal(visible.entries.length, 1);
    assert.equal(visible.entries[0].kind, 'profile');
    assert.match(visible.entries[0].content, /450/);
    assert.deepEqual(Object.keys(visible.entries[0]).sort(), ['id', 'kind', 'content', 'created_at'].sort());
    await closeMemorySession(session);
    session = await open();
    const recalled = await call(session, 'memory_search', { query: '陶瓷饭碗' });
    assert.match(JSON.stringify(recalled), /450/);
    const updated = await call(session, 'memory_replace', { target: 'user', old_text: '测试用户常用陶瓷饭碗容量为450毫升。', content: '测试用户常用陶瓷饭碗容量为600毫升。' });
    assert.equal(updated.details.success, true);
    await closeMemorySession(session);
    session = await open();
    const corrected = JSON.stringify(await call(session, 'memory_search', { query: '陶瓷饭碗' }));
    assert.match(corrected, /600/);
    assert.doesNotMatch(corrected, /450/);
    const removed = await call(session, 'memory_remove', { target: 'user', old_text: '测试用户常用陶瓷饭碗容量为600毫升。' });
    assert.equal(removed.details.success, true);
    assert.deepEqual((await readHealthMemories(root)).entries, []);
    await closeMemorySession(session);
    session = await open();
    assert.doesNotMatch(JSON.stringify(await call(session, 'memory_search', { query: '陶瓷饭碗' })), /600/);
  } finally {
    if (session) await closeMemorySession(session);
    await rm(root, { recursive: true, force: true });
  }
});
