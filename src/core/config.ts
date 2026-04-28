import { readFileSync, writeFileSync } from "node:fs";
import YAML from "yaml";
import { paths } from "./paths.ts";

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

  // 运行时 model 覆盖: `council convene --model opus` 把 env 设上, prompt 文件
  // 内部各自 loadConfig() 时统一拿到覆盖后的 cfg. 6 个 model 字段全换, 让议会
  // 所有阶段一致升级.
  const override = process.env.COUNCIL_MODEL_OVERRIDE;
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
