/**
 * council usage — 看本地 LLM 用量统计
 *
 * 跟 Anthropic Console (https://console.anthropic.com/settings/usage) 互补:
 *   - Console 是账单真相 (按月/按 Key)
 *   - 这里是上下文真相 (哪次议会、哪个 persona、哪个 prompt 阶段)
 *
 * 默认: 显示当月按 model 聚合.
 * --since 7d / 24h: 时间过滤
 * --by persona / model / label: 改变聚合维度
 * --detail: 列每条记录 (debug)
 */

import { log, c } from "../core/logger.ts";
import { paths } from "../core/paths.ts";
import { readAllUsage, type UsageEntry } from "../core/usage-log.ts";
import { shortName } from "../core/pricing.ts";

export interface UsageCmdOpts {
  since?: string;
  by?: "model" | "persona" | "label";
  detail?: boolean;
}

const DEFAULT_BY = "model";

function parseSince(s: string | undefined): Date | null {
  if (!s) return null;
  const m = s.match(/^(\d+)([dhm])$/);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  const unit = m[2];
  const ms =
    unit === "d" ? n * 86400e3 : unit === "h" ? n * 3600e3 : n * 60e3;
  return new Date(Date.now() - ms);
}

function startOfMonth(): Date {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

/** 从 label 抽 persona ref. label 形如 "statement:mentors:naval" / "synthesis" / "distill:identify" */
function personaOf(label?: string): string {
  if (!label) return "(none)";
  // statement:mentors:naval 或 cross-exam:mentors:naval
  const m = label.match(/^(statement|cross-exam):(.+)$/);
  if (m) return m[2];
  return "(global)";
}

export async function usageCommand(opts: UsageCmdOpts): Promise<void> {
  const all = readAllUsage();
  if (all.length === 0) {
    log.plain(`  尚无 LLM 调用记录. (议会还没开过, 或日志在: ${paths.usageLog()})`);
    return;
  }

  // 过滤时间
  const since = parseSince(opts.since) ?? startOfMonth();
  const filtered = all.filter((e) => new Date(e.ts) >= since);

  if (filtered.length === 0) {
    log.plain(`  ${opts.since ? `${opts.since} 内` : "本月"}尚无调用.`);
    return;
  }

  // 标题
  const sinceLabel = opts.since ?? "本月";
  log.heading(
    `Council 用量统计  ${c.gray(`(${sinceLabel} · ${filtered.length} 次调用)`)}`,
  );
  log.plain("");

  // detail 模式: 列每条
  if (opts.detail) {
    for (const e of filtered) {
      const time = e.ts.replace("T", " ").slice(0, 19);
      const cost = `$${e.cost_usd.toFixed(4)}`;
      log.plain(
        `  ${c.gray(time)}  ${shortName(e.model).padEnd(12)}  ${(e.label ?? "?").padEnd(28)}  in=${e.input_tokens}  out=${e.output_tokens}  ${c.green(cost)}`,
      );
    }
    return;
  }

  // 聚合
  const by: NonNullable<UsageCmdOpts["by"]> = opts.by ?? DEFAULT_BY;
  const groups = new Map<
    string,
    {
      calls: number;
      input: number;
      output: number;
      cache_w: number;
      cache_r: number;
      cost: number;
    }
  >();

  for (const e of filtered) {
    const key =
      by === "model"
        ? shortName(e.model)
        : by === "persona"
          ? personaOf(e.label)
          : (e.label ?? "(none)");
    const g = groups.get(key) ?? {
      calls: 0,
      input: 0,
      output: 0,
      cache_w: 0,
      cache_r: 0,
      cost: 0,
    };
    g.calls++;
    g.input += e.input_tokens;
    g.output += e.output_tokens;
    g.cache_w += e.cache_creation_input_tokens;
    g.cache_r += e.cache_read_input_tokens;
    g.cost += e.cost_usd;
    groups.set(key, g);
  }

  // 排序: 按成本降序
  const rows = [...groups.entries()].sort((a, b) => b[1].cost - a[1].cost);

  // 表头
  const headers = [
    `按 ${by} 聚合`.padEnd(22),
    "调用".padStart(5),
    "input".padStart(8),
    "out".padStart(7),
    "cache 写".padStart(9),
    "cache 读".padStart(9),
    "USD".padStart(8),
  ];
  log.plain(`  ${c.bold(headers.join("  "))}`);
  log.plain(`  ${c.gray("─".repeat(headers.join("  ").length))}`);

  // 行
  let totalCost = 0;
  let totalCalls = 0;
  let totalIn = 0;
  let totalOut = 0;
  let totalCacheW = 0;
  let totalCacheR = 0;
  for (const [key, g] of rows) {
    log.plain(
      `  ${key.padEnd(22)}  ${String(g.calls).padStart(5)}  ${formatTokens(g.input).padStart(8)}  ${formatTokens(g.output).padStart(7)}  ${formatTokens(g.cache_w).padStart(9)}  ${formatTokens(g.cache_r).padStart(9)}  ${c.green(`$${g.cost.toFixed(4)}`).padStart(8)}`,
    );
    totalCost += g.cost;
    totalCalls += g.calls;
    totalIn += g.input;
    totalOut += g.output;
    totalCacheW += g.cache_w;
    totalCacheR += g.cache_r;
  }

  log.plain(`  ${c.gray("─".repeat(headers.join("  ").length))}`);
  log.plain(
    `  ${c.bold("总计".padEnd(22))}  ${String(totalCalls).padStart(5)}  ${formatTokens(totalIn).padStart(8)}  ${formatTokens(totalOut).padStart(7)}  ${formatTokens(totalCacheW).padStart(9)}  ${formatTokens(totalCacheR).padStart(9)}  ${c.bold(c.green(`$${totalCost.toFixed(4)}`))}`,
  );

  // cache 命中率提示
  const cacheTotal = totalCacheW + totalCacheR;
  const cacheReadRatio = cacheTotal > 0 ? totalCacheR / cacheTotal : 0;
  log.plain("");
  if (cacheTotal === 0) {
    log.muted("  💡 此时段内未触发 prompt caching (system 太短或调用不足)");
  } else if (cacheReadRatio < 0.3) {
    log.muted(
      `  💡 cache 命中率 ${(cacheReadRatio * 100).toFixed(0)}% — 多数是 cache write. 频繁议会能让命中率提升`,
    );
  } else {
    log.muted(
      `  ✓ cache 命中率 ${(cacheReadRatio * 100).toFixed(0)}% — caching 起作用了, 比无 cache 节省了约 $${estimateSavings(filtered).toFixed(4)}`,
    );
  }

  log.plain("");
  log.muted(`  详细: council usage --detail`);
  log.muted(`  按 persona: council usage --by persona`);
  log.muted(`  按 prompt: council usage --by label`);
  log.muted(`  时间范围: council usage --since 7d / 24h`);
  log.muted(`  Anthropic Console (账单真相): https://console.anthropic.com/settings/usage`);
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

/** 粗估: 假设没 cache, cache_read 部分会按 input 全价付. 估省了多少. */
function estimateSavings(entries: UsageEntry[]): number {
  let saved = 0;
  for (const e of entries) {
    // 这条调用如果没 cache, cache_read 部分会按完整 input 价付
    // 实际付的是 0.10x, 节省的是 0.90x of (read tokens × input price)
    // 这里粗估: 假设 input price ~ $1/M (Haiku); 准确版应该按 priceOf(model)
    // 但简化: 用平均 $1/M 估算
    saved += (e.cache_read_input_tokens / 1_000_000) * 0.9;
  }
  return saved;
}
