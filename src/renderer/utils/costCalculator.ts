export interface ModelPricing {
  model: string;
  inputPricePer1K: number; // Price per 1K input tokens
  outputPricePer1K: number; // Price per 1K output tokens
}

// Current pricing as of 2026 (approximate)
export const MODEL_PRICING: ModelPricing[] = [
  { model: 'Qwen', inputPricePer1K: 0.0002, outputPricePer1K: 0.0006 },
  { model: 'Claude 4.6', inputPricePer1K: 0.003, outputPricePer1K: 0.015 },
  { model: 'GPT-5', inputPricePer1K: 0.005, outputPricePer1K: 0.015 },
];

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  model?: string;
}

export interface TaskMetrics {
  tokensUsed: number;
  inputTokens?: number;
  outputTokens?: number;
  estimatedCost: number;
  durationMs: number;
  model?: string;
}

export function calculateCost(usage: TokenUsage): number {
  const pricing = MODEL_PRICING.find(p => p.model === usage.model);
  
  if (!pricing) {
    // Default to Qwen pricing if model not found
    return (usage.inputTokens * 0.0002 + usage.outputTokens * 0.0006) / 1000;
  }
  
  return (
    (usage.inputTokens * pricing.inputPricePer1K + 
     usage.outputTokens * pricing.outputPricePer1K) / 1000
  );
}

export function formatCost(cost: number): string {
  if (cost < 0.0001) {
    return '< $0.0001';
  }
  return `$${cost.toFixed(4)}`;
}

export function formatTokenCount(tokens: number): string {
  if (tokens >= 1000000) {
    return `${(tokens / 1000000).toFixed(1)}M`;
  }
  if (tokens >= 1000) {
    return `${(tokens / 1000).toFixed(1)}K`;
  }
  return tokens.toString();
}

export function calculateTokensPerSecond(tokens: number, durationMs: number): number {
  if (durationMs === 0) return 0;
  return Math.round((tokens / durationMs) * 1000);
}

export function estimateReadTime(tokens: number, wordsPerToken: number = 0.75, wordsPerMinute: number = 200): number {
  const words = tokens * wordsPerToken;
  return Math.ceil(words / wordsPerMinute);
}

/**
 * Mapping from API model identifiers to user-friendly display names
 */
const API_MODEL_TO_DISPLAY_NAME: Record<string, string> = {
  // Qwen models
  'qwen3.6-plus': 'Qwen 3.6 Plus',
  'qwen3.5-plus': 'Qwen 3.5 Plus',
  'qwen3-max-2026-01-23': 'Qwen 3 Max',
  'qwen3-coder-next': 'Qwen 3 Coder Next',
  'qwen3-coder-plus': 'Qwen 3 Coder Plus',
  // Zhipu models
  'glm-5': 'GLM-5',
  'glm-4.7': 'GLM-4.7',
  // Kimi models
  'kimi-k2.5': 'Kimi K2.5',
  // MiniMax models
  'minimax-m2.5': 'MiniMax M2.5',
  // Other providers
  'claude-4.6': 'Claude 4.6',
  'gpt-5': 'GPT-5',
};

/**
 * Convert an API model identifier to a user-friendly display name
 */
export function getDisplayModelName(apiModelName?: string): string | undefined {
  if (!apiModelName) return undefined;
  return API_MODEL_TO_DISPLAY_NAME[apiModelName] ?? apiModelName;
}
