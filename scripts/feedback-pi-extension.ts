// Reuse the user's installed provider for OAuth refresh and quota accounting.
import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';

export default function (pi: ExtensionAPI) {
  pi.registerCommand('feedback-quota', {
    description: 'Read Gemini development allowance without starting an AI turn',
    handler: async (_args, ctx) => {
      try {
        const { fetchAccountUsage } = await import(process.env.PI_PROVIDER_USAGE!);
        const apiKey = await ctx.modelRegistry.getApiKeyForProvider('antigravity');
        if (!apiKey) throw new Error('provider_auth_unavailable');
        const usage = await fetchAccountUsage(apiKey);
        // Include only quota accounting, never tokens, identity or project IDs.
        console.log(JSON.stringify({type:'feedback_quota',quota:{
          models:usage.models.map((m: any)=>({model_id:m.modelId,remaining_fraction:m.remainingFraction,reset_time:m.resetTime})),
          groups:usage.groups,
          checked_at:usage.fetchedAt/1000,
        }}));
      } catch {
        console.log(JSON.stringify({type:'feedback_quota',error:'Gemini 额度读取失败，请检查开发助手的账号和连接'}));
      }
    },
  });
}
