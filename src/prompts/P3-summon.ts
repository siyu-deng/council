import { callJSON } from "../core/claude.ts";
import { loadConfig } from "../core/config.ts";
import { identityBlock } from "./shared.ts";
import type { Persona } from "../core/skill-md.ts";

export interface SummonResult {
  selected: string[];
  rationale: string;
}

const SYSTEM = `你是 Council 的 persona 召集人。输入是用户问题 + 所有可用 persona 的简介。输出一组 3-5 个最相关的 persona refs。

# 强制规则

1. **多样性硬约束** (如果库中有): 必须至少 1 个 self + 1 个 mentor + 1 个 role。
2. **数量**: 3-5 个, 不多不少。
3. **相关性**: 根据 persona description 和问题内容匹配。
4. **每次议会必须包含 roles:devils-advocate** (如果可用) — 它是结构性反对者, 防止回音室。
5. **优先级**: description 与问题强相关 > 思考角度互补 > 最近使用过的。

输出 persona ref 格式: \`self:xxx\` / \`mentors:xxx\` / \`roles:xxx\` (从输入列表逐字复制)。`;

export async function summonPersonas(
  question: string,
  available: Persona[],
): Promise<SummonResult> {
  const cfg = loadConfig();

  const list = available
    .map(
      (p) =>
        `- \`${p.ref}\` [${p.frontmatter.type}] ${p.frontmatter.description}`,
    )
    .join("\n");

  const schema = {
    type: "object",
    properties: {
      selected: {
        type: "array",
        minItems: cfg.convene.min_personas,
        maxItems: cfg.convene.max_personas,
        items: { type: "string" },
      },
      rationale: {
        type: "string",
        description: "为什么选这几个, 为什么不选其他, 2-3 句",
      },
    },
    required: ["selected", "rationale"],
  };

  const prompt = `${identityBlock()}\n\n用户问题:\n${question}\n\n可用 personas:\n${list}`;

  return await callJSON<SummonResult>(prompt, {
    model: cfg.models.summon,
    system: SYSTEM,
    label: "summon",
    temperature: 0.3,
    maxTokens: 1024,
    jsonSchema: schema,
    toolName: "summon",
  });
}
