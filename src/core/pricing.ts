/**
 * Anthropic API 定价表 (USD per 1M tokens)
 * 数据来自 https://platform.claude.com/docs/en/about-claude/pricing (2026-04 拉取)
 *
 * 5min 缓存写: 1.25× input
 * 1h 缓存写: 2× input
 * 缓存命中读: 0.10× input
 *
 * 用 family-prefix 匹配, 支持任何具体日期版本. 找不到时退到 unknown 计费 (零 + 警告).
 */

export interface ModelPricing {
  /** $/M tokens */
  input: number;
  /** $/M tokens */
  output: number;
  /** 5min cache write — input × 1.25 */
  cache_5m_write: number;
  /** cache hit (read) — input × 0.10 */
  cache_read: number;
}

const PRICING_TABLE: Array<{ prefix: string; price: ModelPricing }> = [
  // Opus 4.x (含 4.7, 4.6, 4.5 — 都是 $5/$25)
  {
    prefix: "claude-opus-4",
    price: { input: 5, output: 25, cache_5m_write: 6.25, cache_read: 0.5 },
  },
  // Opus 4.0 / 4.1 (历史定价)
  {
    prefix: "claude-opus-4-0",
    price: { input: 15, output: 75, cache_5m_write: 18.75, cache_read: 1.5 },
  },
  {
    prefix: "claude-opus-4-1",
    price: { input: 15, output: 75, cache_5m_write: 18.75, cache_read: 1.5 },
  },
  // Sonnet 4.x
  {
    prefix: "claude-sonnet-4",
    price: { input: 3, output: 15, cache_5m_write: 3.75, cache_read: 0.3 },
  },
  // Haiku 4.x
  {
    prefix: "claude-haiku-4",
    price: { input: 1, output: 5, cache_5m_write: 1.25, cache_read: 0.1 },
  },
  // Haiku 3.5
  {
    prefix: "claude-haiku-3-5",
    price: { input: 0.8, output: 4, cache_5m_write: 1, cache_read: 0.08 },
  },
  // Haiku 3
  {
    prefix: "claude-haiku-3",
    price: {
      input: 0.25,
      output: 1.25,
      cache_5m_write: 0.3,
      cache_read: 0.03,
    },
  },
];

const UNKNOWN_PRICING: ModelPricing = {
  input: 0,
  output: 0,
  cache_5m_write: 0,
  cache_read: 0,
};

/**
 * 根据 model ID 查定价. 优先匹配最长 prefix (4-1 比 4 优先, 历史定价不被新版覆盖).
 */
export function priceOf(modelId: string): ModelPricing {
  const sorted = [...PRICING_TABLE].sort(
    (a, b) => b.prefix.length - a.prefix.length,
  );
  for (const { prefix, price } of sorted) {
    if (modelId.startsWith(prefix)) return price;
  }
  return UNKNOWN_PRICING;
}

/**
 * 根据 usage 字段计算单次调用成本 (USD).
 * 区分: 普通输入 / cache 写 / cache 读 / 输出.
 */
export function computeCost(
  modelId: string,
  usage: {
    input_tokens: number;
    output_tokens: number;
    cache_creation_input_tokens?: number;
    cache_read_input_tokens?: number;
  },
): number {
  const p = priceOf(modelId);
  const inputCost = (usage.input_tokens / 1_000_000) * p.input;
  const outputCost = (usage.output_tokens / 1_000_000) * p.output;
  const cacheWriteCost =
    ((usage.cache_creation_input_tokens ?? 0) / 1_000_000) * p.cache_5m_write;
  const cacheReadCost =
    ((usage.cache_read_input_tokens ?? 0) / 1_000_000) * p.cache_read;
  return inputCost + outputCost + cacheWriteCost + cacheReadCost;
}

/** 把 model ID 简化成人类可读名字 (在 usage 表头显示用) */
export function shortName(modelId: string): string {
  if (modelId.startsWith("claude-opus-4-7")) return "Opus 4.7";
  if (modelId.startsWith("claude-opus-4-6")) return "Opus 4.6";
  if (modelId.startsWith("claude-opus-4-5")) return "Opus 4.5";
  if (modelId.startsWith("claude-opus-4")) return "Opus 4.x";
  if (modelId.startsWith("claude-sonnet-4-6")) return "Sonnet 4.6";
  if (modelId.startsWith("claude-sonnet-4-5")) return "Sonnet 4.5";
  if (modelId.startsWith("claude-sonnet-4")) return "Sonnet 4.x";
  if (modelId.startsWith("claude-haiku-4-5")) return "Haiku 4.5";
  if (modelId.startsWith("claude-haiku-4")) return "Haiku 4.x";
  if (modelId.startsWith("claude-haiku-3-5")) return "Haiku 3.5";
  if (modelId.startsWith("claude-haiku-3")) return "Haiku 3";
  return modelId;
}
