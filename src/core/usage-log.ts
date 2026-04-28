/**
 * Usage Log — 每次 LLM 调用 append 一条到 ~/.council/.usage.jsonl
 *
 * 设计原则:
 *   - 一行一个 JSON object (jsonl), 方便 grep/awk 流式分析
 *   - 信息含: 时间戳 / model / label (含 persona ref) / token 各项 / 计算后的 USD 成本
 *   - 跟 Anthropic Console 的 usage 互补: 这里给"哪次议会、哪个 persona"上下文,
 *     Console 给账单真相
 *
 * 字段说明:
 *   - input_tokens: 真实输入 (扣掉 cache 命中部分)
 *   - cache_creation_input_tokens: 写 cache 的 token (1.25× input 价)
 *   - cache_read_input_tokens: 命中 cache 的 token (0.10× input 价)
 *   - output_tokens: 输出
 *   - cost_usd: 当次调用的总 USD 估算
 */

import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { paths, ensureDir } from "./paths.ts";
import { dirname } from "node:path";
import { computeCost } from "./pricing.ts";

export interface UsageEntry {
  ts: string;
  model: string;
  label?: string;
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens: number;
  cache_read_input_tokens: number;
  cost_usd: number;
}

interface AnthropicUsage {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens?: number | null;
  cache_read_input_tokens?: number | null;
  // SDK 1.x 还有别的字段, 但我们只用这几个
}

export function recordUsage(input: {
  model: string;
  label?: string;
  usage: AnthropicUsage;
}): void {
  // 静默模式: COUNCIL_QUIET=1 (MCP server 设的) 仍然记, 因为这是数据不是 stdout 噪音
  // COUNCIL_NO_USAGE_LOG=1 给单测/preflight 关闭
  if (process.env.COUNCIL_NO_USAGE_LOG === "1") return;

  const u = input.usage;
  const entry: UsageEntry = {
    ts: new Date().toISOString(),
    model: input.model,
    label: input.label,
    input_tokens: u.input_tokens,
    output_tokens: u.output_tokens,
    cache_creation_input_tokens: u.cache_creation_input_tokens ?? 0,
    cache_read_input_tokens: u.cache_read_input_tokens ?? 0,
    cost_usd: computeCost(input.model, {
      input_tokens: u.input_tokens,
      output_tokens: u.output_tokens,
      cache_creation_input_tokens: u.cache_creation_input_tokens ?? 0,
      cache_read_input_tokens: u.cache_read_input_tokens ?? 0,
    }),
  };

  try {
    const path = paths.usageLog();
    ensureDir(dirname(path));
    appendFileSync(path, JSON.stringify(entry) + "\n", "utf-8");
  } catch {
    /* 写不进去就算了——usage 记录不应阻塞 LLM 调用 */
  }
}

/** 读取所有 usage 记录 (按时间顺序) */
export function readAllUsage(): UsageEntry[] {
  const path = paths.usageLog();
  if (!existsSync(path)) return [];
  try {
    const raw = readFileSync(path, "utf-8");
    return raw
      .split("\n")
      .filter((line) => line.trim())
      .map((line) => {
        try {
          return JSON.parse(line) as UsageEntry;
        } catch {
          return null;
        }
      })
      .filter((e): e is UsageEntry => e !== null);
  } catch {
    return [];
  }
}
