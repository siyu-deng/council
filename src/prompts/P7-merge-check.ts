import { callJSON } from "../core/claude.ts";
import { loadConfig } from "../core/config.ts";
import type { Persona } from "../core/skill-md.ts";

export interface MergeCheck {
  overlap: number;
  rationale: string;
  suggested_name: string;
}

const SYSTEM = `你在评估两个 persona 是否本质重叠, 应否合并成一个。

判断标准:
- 看它们的 "什么时候我会发言" 是否大面积重合
- 看 "我的思考路径" 是否同构
- 看 "典型片段" 是否讲同一类故事

overlap 0-1:
- 0.85+ : 本质是同一个 persona 的两次蒸馏, 应合并
- 0.6-0.85 : 有交集但仍有独立视角, 边缘
- <0.6 : 保留为两个

suggested_name: 如果 overlap >= 0.7, 给合并后的 kebab-case name; 否则返回空串。`;

export async function mergeCheck(a: Persona, b: Persona): Promise<MergeCheck> {
  const cfg = loadConfig();
  const prompt = `两个 persona:\n\n=== A: ${a.ref} ===\n${a.body}\n\n=== B: ${b.ref} ===\n${b.body}`;
  return await callJSON<MergeCheck>(prompt, {
    model: cfg.models.merge,
    system: SYSTEM,
    label: "merge-check",
    temperature: 0.2,
    maxTokens: 512,
    jsonSchema: {
      type: "object",
      properties: {
        overlap: { type: "number", minimum: 0, maximum: 1 },
        rationale: { type: "string" },
        suggested_name: { type: "string" },
      },
      required: ["overlap", "rationale", "suggested_name"],
    },
    toolName: "merge_check",
  });
}
