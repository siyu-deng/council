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

export function loadConfig(): CouncilConfig {
  try {
    const raw = readFileSync(paths.config(), "utf-8");
    const parsed = YAML.parse(raw) as Partial<CouncilConfig>;
    return {
      ...DEFAULT_CONFIG,
      ...parsed,
      models: { ...DEFAULT_CONFIG.models, ...(parsed.models ?? {}) },
      convene: { ...DEFAULT_CONFIG.convene, ...(parsed.convene ?? {}) },
    };
  } catch {
    return DEFAULT_CONFIG;
  }
}

export function writeConfig(cfg: CouncilConfig): void {
  writeFileSync(paths.config(), YAML.stringify(cfg), "utf-8");
}
