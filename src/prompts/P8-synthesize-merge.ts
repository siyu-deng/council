import { callJSON } from "../core/claude.ts";
import { loadConfig } from "../core/config.ts";
import { identityBlock } from "./shared.ts";
import type { Persona } from "../core/skill-md.ts";

export interface MergedPersona {
  name: string;
  description: string;
  body: string;
  confidence: number;
}

const SYSTEM = `你在把两个本质重叠的 persona 融合为一个。规则:

1. 保留两者最具体、最有"锋利感"的段落, 删掉重复
2. "典型片段" 段落必须从两个源中各取至少一条原话, 不许造新引用
3. 新的 \`name\` 应反映融合后的本质主题, kebab-case 3-4 词
4. 新的 \`description\` 要比原来两个都更精准, 一句话 15-30 字
5. 结构严格按 Council 的 SKILL.md 格式: 我是谁 / 什么时候我会发言 / 我的思考路径 / 我反对什么 / 典型片段`;

export async function synthesizeMerge(
  a: Persona,
  b: Persona,
): Promise<MergedPersona> {
  const cfg = loadConfig();
  const prompt = `${identityBlock()}\n\n=== A: ${a.ref} ===\n${a.body}\n\n=== B: ${b.ref} ===\n${b.body}`;
  return await callJSON<MergedPersona>(prompt, {
    model: cfg.models.merge,
    system: SYSTEM,
    label: "merge-synth",
    temperature: 0.4,
    maxTokens: 2048,
    jsonSchema: {
      type: "object",
      properties: {
        name: { type: "string" },
        description: { type: "string" },
        body: { type: "string" },
        confidence: { type: "number", minimum: 0, maximum: 1 },
      },
      required: ["name", "description", "body", "confidence"],
    },
    toolName: "synthesize_merge",
  });
}
