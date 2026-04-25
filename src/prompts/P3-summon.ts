import { callJSON } from "../core/claude.ts";
import { loadConfig } from "../core/config.ts";
import { identityBlock } from "./shared.ts";
import type { Persona } from "../core/skill-md.ts";

export interface SummonResult {
  selected: string[];
  rationale: string;
}

const SYSTEM = `你是 Council 的 persona 召集人。输入是用户问题 + 所有可用 persona 的简介 (含历史评分 score / 使用次数 used). 输出一组 3-5 个最相关的 persona refs。

# 强制规则

1. **多样性硬约束** (如果库中有): 必须至少 1 个 self + 1 个 mentor + 1 个 role。
2. **数量**: 3-5 个, 不多不少。
3. **相关性**: 根据 persona description 和问题内容匹配。
4. **每次议会必须包含 roles:devils-advocate** (如果可用) — 它是结构性反对者, 防止回音室。
5. **历史反馈影响选择** (这是 Council 复利的核心):
   - score 高 (≥0.6) 的 persona 在相关性接近时优先选; 它们历史上"帮上了忙"
   - score 低 (<0.3) 且 used>=3 的 persona, 除非问题强相关, 否则换别的; 用户已多次评 generic / off-target
   - score 缺失 (从未被反馈过) 的视为中性
6. **优先级综合**: description 与问题强相关 > score 高的有效 persona > 思考角度互补 > 没用过的尝鲜.

# rationale 字段

必须在 rationale 里**显式提到**:
- 哪些 persona 因为高 score 入选 (如有)
- 哪些因为 score 低被排除 (如有)
- 哪些是因为 description 强相关无视 score 入选 (如有)

输出 persona ref 格式: \`self:xxx\` / \`mentors:xxx\` / \`roles:xxx\` (从输入列表逐字复制)。`;

export async function summonPersonas(
  question: string,
  available: Persona[],
): Promise<SummonResult> {
  const cfg = loadConfig();

  const list = available
    .map((p) => {
      const score = p.frontmatter.score;
      const usage = p.frontmatter.usage_count ?? 0;
      let meta = "";
      if (usage > 0 && score !== undefined) {
        meta = ` [score=${score.toFixed(2)}, used=${usage}]`;
      } else if (usage > 0) {
        meta = ` [used=${usage}, 无反馈]`;
      } else {
        meta = ` [新, 未召唤过]`;
      }
      return `- \`${p.ref}\` [${p.frontmatter.type}]${meta} ${p.frontmatter.description}`;
    })
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
