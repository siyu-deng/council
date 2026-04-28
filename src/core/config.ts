import { readFileSync, writeFileSync } from "node:fs";
import { AsyncLocalStorage } from "node:async_hooks";
import YAML from "yaml";
import { paths } from "./paths.ts";

/**
 * 请求级 model override 上下文.
 *
 * 为什么要这个: MCP server 是长驻进程, 多个 tool call 可能交错处理. 如果用全局
 * process.env 来传 override, 两个并发调用会互相污染 (Caller A 想要 opus,
 * Caller B 同时想要 haiku — 用 env 谁都拿不准看到哪个值).
 *
 * AsyncLocalStorage 把 override 绑到 async chain (run 进去的回调及其所有 await),
 * 跨 microtask 也保持隔离. 这是 Node 16+ 标准方式做 request-scoped state.
 *
 * CLI 模式 (council convene --model opus) 仍可用 process.env.COUNCIL_MODEL_OVERRIDE,
 * 因为 CLI 是短进程, 没有并发. 两条路 loadConfig 都读, ALS 优先.
 */
const modelOverrideStore = new AsyncLocalStorage<string>();

/**
 * 在指定 model 上下文里跑一段异步逻辑. 之内所有 loadConfig() 都拿到 override,
 * 之外不受影响. 用于 MCP tool handler 包住 LLM 调用.
 */
export function withModelOverride<T>(
  model: string | undefined,
  fn: () => Promise<T>,
): Promise<T> {
  if (!model) return fn();
  return modelOverrideStore.run(model, fn);
}

export interface CouncilConfig {
  models: {
    distill: string;
    summon: string;
    statement: string;
    cross_exam: string;
    synthesis: string;
    merge: string;
  };
  convene: {
    min_personas: number;
    max_personas: number;
    require_diversity: boolean;
  };
  locale: "zh" | "en";
}

export const DEFAULT_CONFIG: CouncilConfig = {
  models: {
    distill: "claude-haiku-4-5-20251001",
    summon: "claude-haiku-4-5-20251001",
    statement: "claude-haiku-4-5-20251001",
    cross_exam: "claude-haiku-4-5-20251001",
    synthesis: "claude-haiku-4-5-20251001",
    merge: "claude-haiku-4-5-20251001",
  },
  convene: {
    min_personas: 3,
    max_personas: 5,
    require_diversity: true,
  },
  locale: "zh",
};

/**
 * 短名 → 完整 model ID. 不在表里的当作完整 ID 透传.
 * Anthropic model ID 带日期版本; 这里 hardcode 一组合理 latest. 用户可在
 * config.yml 用更具体的版本号覆盖.
 */
export function resolveModelAlias(name: string): string {
  const aliases: Record<string, string> = {
    haiku: "claude-haiku-4-5-20251001",
    sonnet: "claude-sonnet-4-5-20250929",
    opus: "claude-opus-4-5",
  };
  return aliases[name.toLowerCase()] ?? name;
}

export function loadConfig(): CouncilConfig {
  let cfg: CouncilConfig;
  try {
    const raw = readFileSync(paths.config(), "utf-8");
    const parsed = YAML.parse(raw) as Partial<CouncilConfig>;
    cfg = {
      ...DEFAULT_CONFIG,
      ...parsed,
      models: { ...DEFAULT_CONFIG.models, ...(parsed.models ?? {}) },
      convene: { ...DEFAULT_CONFIG.convene, ...(parsed.convene ?? {}) },
    };
  } catch {
    cfg = DEFAULT_CONFIG;
  }

  // 运行时 model 覆盖: 优先从 AsyncLocalStorage (MCP 并发安全), 退到 env (CLI 用).
  // CLI 模式 council convene --model opus → 设 env
  // MCP 模式 council_convene({model:"opus"}) → withModelOverride(...) 设 ALS
  // 6 个 model 字段全换, 让议会所有阶段一致升级.
  const override =
    modelOverrideStore.getStore() ?? process.env.COUNCIL_MODEL_OVERRIDE;
  if (override) {
    const m = resolveModelAlias(override);
    cfg.models = {
      distill: m,
      summon: m,
      statement: m,
      cross_exam: m,
      synthesis: m,
      merge: m,
    };
  }
  return cfg;
}

export function writeConfig(cfg: CouncilConfig): void {
  writeFileSync(paths.config(), YAML.stringify(cfg), "utf-8");
}
