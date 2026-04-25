import { callJSON } from "../core/claude.ts";
import { loadConfig } from "../core/config.ts";
import { identityBlock } from "./shared.ts";
import type { Persona } from "../core/skill-md.ts";
import type { Highlight } from "./P1-identify-highlights.ts";

export type RefineAction = "reinforce" | "enrich" | "contradict";

export interface RefinedPersona {
  action: RefineAction;
  new_body: string;
  new_description: string;
  new_confidence: number;
  rationale: string;
  conflict_note?: string;
}

const SYSTEM = `你在 **refine** 一个已有的 self persona — 用一组新捕获的同类 highlights 去深化它, 而不是新建一个。

# 你的判定 (必须三选一)

- \`reinforce\`: 新 highlights 与已有 persona 的核心模式一致, 提供更多证据。动作: 微调 body (主要是补充触发场景或典型片段), 上调 confidence。
- \`enrich\`: 新 highlights 揭示了已有 persona **没覆盖的新维度** (新的触发场景 / 新的思考步骤 / 新的反对清单条目)。动作: 实质性扩写 body, 但保留原有锋利段落。
- \`contradict\`: 新 highlights 与已有 persona 的某个核心主张 **不可调和地冲突** (注意: 是真冲突, 不是补充)。动作: 在 \`conflict_note\` 里指出冲突点, new_body 给出**调和后**的版本 (允许标注 "在 X 情境下 Y; 在 Z 情境下相反"), 但用户最终决定要不要采纳。

判定从严: 大多数情况是 reinforce 或 enrich。只有真的发现自相矛盾才用 contradict。

# 硬性纪律 (与 P2 一致)

❌ 不许改成"关于用户"的第三人称, 必须 "我" 说话
❌ 典型片段必须包含**至少 1 条原 persona 的引用** + **至少 1 条新 highlight 的原话引用**, 不允许编造
❌ 不允许超过 800 字 (比 P2 的 700 字多一点空间装新维度)
❌ name 不可改 (refine 不是改名, 改名要走 merge)
❌ confidence 变化范围: reinforce +0~+0.1, enrich -0.05~+0.05, contradict -0.1~+0.05

# 结构 (与 P2 严格对齐)

\`\`\`
## 我是谁
<...>

## 什么时候我会发言
- ...

## 我的思考路径
1. ...

## 我反对什么
- ...

## 典型片段
> "原 persona 的引用"
> "新 highlight 的引用"
\`\`\`

# rationale 要求

1-2 句话, 必须具体说明:
- 新 highlights 给已有 persona 加了什么 / 撞掉了什么 (不能写"丰富了思考"这种空话)
- 为什么选择这个 action 而不是另外两个
`;

export async function refinePersona(
  existing: Persona,
  newHighlights: Highlight[],
): Promise<RefinedPersona> {
  const cfg = loadConfig();

  const newBlock = newHighlights
    .map(
      (h, i) =>
        `[新${i + 1}] type=${h.type} conf=${h.confidence}\n  title: ${h.title}\n  quote: ${h.user_quote}\n  why: ${h.why_non_trivial}\n  trigger: ${h.trigger}\n  belief: ${h.underlying_belief}`,
    )
    .join("\n\n");

  const prompt = `${identityBlock()}

=== 已有 persona: ${existing.ref} ===
description: ${existing.frontmatter.description}
confidence: ${existing.frontmatter.confidence ?? "n/a"}

${existing.body}

=== ${newHighlights.length} 个新 highlights (同类型) ===

${newBlock}

请判定 action 并给出 refined persona。`;

  const schema = {
    type: "object",
    properties: {
      action: {
        type: "string",
        enum: ["reinforce", "enrich", "contradict"],
      },
      new_body: {
        type: "string",
        description:
          "完整 Markdown 正文, 严格按 ## 我是谁 / 什么时候我会发言 / 我的思考路径 / 我反对什么 / 典型片段 五段",
      },
      new_description: {
        type: "string",
        description: "可保留原 description, 也可微调到更精准。15-30 字",
      },
      new_confidence: { type: "number", minimum: 0, maximum: 1 },
      rationale: {
        type: "string",
        description: "1-2 句, 具体说明加了什么 / 撞掉了什么, 为什么选这个 action",
      },
      conflict_note: {
        type: "string",
        description: "仅当 action=contradict 时填, 说明冲突的具体点",
      },
    },
    required: [
      "action",
      "new_body",
      "new_description",
      "new_confidence",
      "rationale",
    ],
  };

  return await callJSON<RefinedPersona>(prompt, {
    model: cfg.models.distill,
    system: SYSTEM,
    label: "refine-persona",
    temperature: 0.4,
    maxTokens: 2400,
    jsonSchema: schema,
    toolName: "refine_persona",
  });
}
