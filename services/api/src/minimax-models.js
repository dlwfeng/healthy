// 应用模型升级到 3.1；M3 仅用于显式配置的兼容回退和历史记录校验。
export const defaultMiniMaxModel = 'MiniMax-M3.1-Flash';
export const modelProfiles = {
  'MiniMax-M3': {
    thinking: { type: 'disabled' },
    budgets: { vision: 2500, reply: 300, chat: 1500, search: 1000 },
    responses: {},
  },
  'MiniMax-M3.1-Flash': {
    thinking: null,
    reasoning_effort: 'low',
    budgets: { vision: 12000, reply: 3000, chat: 6000, search: 8000 },
    // Responses 接口的联网检索会反复扩展上下文，用最低思考档并限制检索次数，避免拖长识别等待。
    responses: { reasoning: { effort: 'low' }, max_tool_calls: 2 },
  },
};

export const defaultModelChain = [defaultMiniMaxModel];
export const allowedAnalysisModels = Object.keys(modelProfiles);

// 429/5xx/529 属于上游临时不可用，允许换模型重试；400 等其它错误视为配置问题。
export function isTransientStatus(status) {
  return status === 429 || status === 500 || status === 502 || status === 503 || status === 504 || status === 529;
}

export function modelChain(env = process.env) {
  const configured = typeof env.MINIMAX_MEAL_MODEL === 'string'
    ? env.MINIMAX_MEAL_MODEL.split(',').map(name => name.trim()).filter(name => modelProfiles[name])
    : [];
  return configured.length ? configured : defaultModelChain;
}

export function requestOptions(model, purpose) {
  const profile = modelProfiles[model] ?? modelProfiles[defaultModelChain[0]];
  return {
    ...(profile.thinking ? { thinking: profile.thinking } : {}),
    ...(profile.reasoning_effort ? { reasoning_effort: profile.reasoning_effort } : {}),
    max_completion_tokens: profile.budgets[purpose] ?? profile.budgets.vision,
  };
}

export function responsesOptions(model) {
  return modelProfiles[model]?.responses ?? {};
}
