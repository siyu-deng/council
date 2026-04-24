import { callJSON } from "../core/claude.ts";
import { loadConfig } from "../core/config.ts";
import { identityBlock } from "./shared.ts";
import type { Highlight } from "./P1-identify-highlights.ts";

export interface ForgedPersona {
  name: string;
  description: string;
  body: string;
  confidence: number;
  source_quotes: string[];
}

const SYSTEM = `你是 Council 的 persona 构建器。输入是用户的一组同主题的思考高光 (highlights), 输出是一个第一人称的 persona SKILL.md 内容。

# 你要生成什么

一个 persona 文件, 不是"关于用户"的描述, 而是 **用户这种思考模式自己发声**。用 "我" 说话。

# 风格要求 (和种子 mentor personas 对齐)

Markdown 正文必须包含以下段落, 顺序不变:

## 我是谁
<第一人称, 5-8 行, 描述这个思考模式的自我认知>

## 什么时候我会发言
- <触发场景 1>
- <触发场景 2>
- ...

## 我的思考路径
1. <具体步骤, 不要泛泛>
2. ...

## 我反对什么
- <反模式>
- ...

## 典型片段
> "<原话引用 1>"
> "<原话引用 2>"

# 硬性纪律

❌ 不许写 "这个 persona..." / "用户的..." — 只能用 "我"
❌ 不许引用用户没说过的话 — 典型片段必须是 highlights 里的原话
❌ 不许写"多维思考"、"综合分析"等万能修辞 — 必须具体
❌ 不许超过 700 字

# 附加字段

- name: kebab-case, 3-4 个英文词, 抓核心 (如 \`reframe-before-collect\`, \`sugar-to-protein\`)
- description: 一句话, 15-30 字, 说明这个 persona 何时最有用
- confidence: 根据 highlights 的 confidence 均值 + cluster 大小 (≥3 个 +0.1, 只有 1 个 -0.2)
- source_quotes: 从 highlights 中选 2-3 个最能代表此 persona 的原话 (完整句, 可截短)
`;

export async function forgePersona(
  highlights: Highlight[],
  sessionIds: string[],
): Promise<ForgedPersona> {
  const cfg = loadConfig();
  const schema = {
    type: "object",
    properties: {
      name: {
        type: "string",
        description: "kebab-case, 3-4 个英文词",
      },
      description: { type: "string", description: "一句话描述, 15-30 字" },
      body: {
        type: "string",
        description:
          "完整 Markdown 正文, 包含 ## 我是谁 / 什么时候我会发言 / 我的思考路径 / 我反对什么 / 典型片段 五段",
      },
      confidence: { type: "number", minimum: 0, maximum: 1 },
      source_quotes: {
        type: "array",
        minItems: 1,
        maxItems: 3,
        items: { type: "string" },
      },
    },
    required: ["name", "description", "body", "confidence", "source_quotes"],
  };

  const highlightBlock = highlights
    .map(
      (h, i) =>
        `[${i + 1}] type=${h.type} conf=${h.confidence}\n  title: ${h.title}\n  quote: ${h.user_quote}\n  why: ${h.why_non_trivial}\n  trigger: ${h.trigger}\n  belief: ${h.underlying_belief}`,
    )
    .join("\n\n");

  const prompt = `${identityBlock()}\n\n以下是 ${highlights.length} 个来自 session(${sessionIds.join(", ")}) 的同类 highlights, 请蒸馏为一个 persona:\n\n${highlightBlock}`;

  return await callJSON<ForgedPersona>(prompt, {
    model: cfg.models.distill,
    system: SYSTEM,
    label: "forge-persona",
    temperature: 0.4,
    maxTokens: 2048,
    jsonSchema: schema,
    toolName: "forge_persona",
  });
}
