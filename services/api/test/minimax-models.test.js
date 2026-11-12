import test from 'node:test';
import assert from 'node:assert/strict';
import { streamSimple } from '@earendil-works/pi-ai/api/anthropic-messages';
import { modelReady } from '../src/pi-runtime.js';
import { modelChain, requestOptions, responsesOptions, allowedAnalysisModels } from '../src/minimax-models.js';

test('new meal requests use 3.1 with bounded thinking and keep legacy provenance valid', () => {
  assert.deepEqual(modelChain({}), ['MiniMax-M3.1-Flash']);
  assert.deepEqual(modelChain({ MINIMAX_MEAL_MODEL: 'MiniMax-M3,MiniMax-M3.1-Flash' }), ['MiniMax-M3', 'MiniMax-M3.1-Flash']);
  const options = requestOptions(modelChain({})[0], 'vision');
  assert.equal(options.thinking, undefined);
  assert.equal(options.reasoning_effort, 'low');
  assert.equal(options.max_completion_tokens, 12000);
  assert.equal(responsesOptions('MiniMax-M3.1-Flash').reasoning.effort, 'low');
  assert.ok(allowedAnalysisModels.includes('MiniMax-M3'));
});

test('SDK sends the real 3.1 model and adaptive thinking for chat and reports', async () => {
  const runtime = await modelReady;
  const model = runtime.getModel('minimax-cn', 'MiniMax-M3.1-Flash');
  assert.equal(model.baseUrl, 'https://api.minimax.cn/anthropic');
  const previousKey = process.env.MINIMAX_CN_API_KEY;
  process.env.MINIMAX_CN_API_KEY = 'runtime-auth-fixture';
  try {
    const auth = await runtime.getAuth(model);
    assert.equal(auth.auth.apiKey, 'runtime-auth-fixture');
  } finally {
    if (previousKey === undefined) delete process.env.MINIMAX_CN_API_KEY;
    else process.env.MINIMAX_CN_API_KEY = previousKey;
  }
  for (const reasoning of ['low', 'medium']) {
    let payload;
    const result = await streamSimple(model, {
      messages: [{ role: 'user', content: 'transport fixture', timestamp: Date.now() }],
    }, {
      apiKey: 'local-test-only', reasoning,
      onPayload(value) {
        payload = value;
        // Inspect the actual SDK wire request; never contact the network.
        throw Error('fixture_stop_before_network');
      },
    }).result();
    assert.equal(result.errorMessage, 'fixture_stop_before_network');
    assert.equal(payload.model, 'MiniMax-M3.1-Flash');
    assert.equal(payload.thinking.type, 'adaptive');
    assert.equal(payload.output_config.effort, reasoning);
  }
});
