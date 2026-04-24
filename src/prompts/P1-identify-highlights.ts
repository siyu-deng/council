import { callJSON } from "../core/claude.ts";
import { loadConfig } from "../core/config.ts";
import { identityBlock, CONVERSATION_FORMAT_NOTE } from "./shared.ts";

export type HighlightType =
  | "problem-reframing"
  | "meta-insight"
  | "decision-heuristic"
  | "boundary-response";

export interface Highlight {
  type: HighlightType;
  title: string;
  user_quote: string;
  why_non_trivial: string;
  trigger: string;
  underlying_belief: string;
  confidence: number;
}

const SYSTEM = `你是 Council 的蒸馏引擎。你的任务是从一段"用户 vs AI"的对话里, 识别出 **真正属于用户自己**的思考高光 (Thinking Highlights), 而不是 AI 提供的观点用户点头同意的东西。

这是 Council 的真实性守门员。你识别得准, 用户就能拥有一个真正像自己的 persona; 识别得水, 整个系统就变成"三个 ChatGPT 互相客套"。

${CONVERSATION_FORMAT_NOTE}

# 什么是"用户的思考高光" (符合条件才算)

只有满足以下之一才算高光:
(a) **问题重构** — 用户把 AI 或自己最初的问题换了一个框架, 打开了不同的思考路径
(b) **元洞察** — 用户对自己的行为模式、思考方式、动机本身的观察 (需要有原话支撑, 不是你推测)
(c) **决策启发式** — 用户给出了一个可在未来复用的具体决策路径或优先级 (如"水→咖啡→蛋白质")
(d) **边界反应** — 用户在面对否定/压力/不确定时的处理方式 (有具体反应模式, 不止是情绪)

# 硬性拒绝清单 (命中任一则不是高光)

❌ 用户只是点头同意 AI 的建议 → 那是 AI 的思考, 不是用户的
❌ "用户运用了第一性原理思考" 类同义反复 → 必须写出这次具体怎么拆
❌ 用户表达情绪但没有产生可复用的决策/视角
❌ 用户只是追问, 或确认理解
❌ 你只能用泛泛词描述 (如"用户很有洞察力") — 说明你没抓到具体内容
❌ 原话无法逐字在对话中定位

# 产出要求

- 3 到 5 条高光 (如果真的不足 3 条, 返回 2 条也可, 不要凑数)
- 每条 \`user_quote\` 必须是用户原话的 **逐字引用** (允许省略号, 不允许改写)
- \`confidence\` 根据下面标准打:
    * 0.9+ : 用户明确反驳/重构/给出具体启发式, 原话锋利
    * 0.7-0.89 : 明显是用户的视角但需要从上下文推理
    * 0.5-0.69 : 边缘, 可能是用户综合 AI 观点后的个人延伸
    * <0.5 : 不要返回

- 偏爱对话中 **用户推翻 AI**、**用户反问**、**用户给出 AI 没说过的类比** 的片段
`;

export async function identifyHighlights(
  conversation: string,
  sessionId: string,
): Promise<Highlight[]> {
  const cfg = loadConfig();
  const schema = {
    type: "object",
    properties: {
      highlights: {
        type: "array",
        maxItems: 5,
        items: {
          type: "object",
          properties: {
            type: {
              type: "string",
              enum: [
                "problem-reframing",
                "meta-insight",
                "decision-heuristic",
                "boundary-response",
              ],
            },
            title: { type: "string", description: "中文短标题, 6-12 字" },
            user_quote: {
              type: "string",
              description: "用户原话逐字引用, 可带省略号",
            },
            why_non_trivial: {
              type: "string",
              description: "为什么这是用户的, 不是 AI 喂的",
            },
            trigger: { type: "string", description: "什么情境下会触发这个思考模式" },
            underlying_belief: {
              type: "string",
              description: "背后的底层信念",
            },
            confidence: { type: "number", minimum: 0, maximum: 1 },
          },
          required: [
            "type",
            "title",
            "user_quote",
            "why_non_trivial",
            "trigger",
            "underlying_belief",
            "confidence",
          ],
        },
      },
    },
    required: ["highlights"],
  };

  const prompt = `${identityBlock()}\n\n以下是 session \`${sessionId}\` 的完整对话。请按要求识别用户的思考高光。\n\n=== 对话开始 ===\n${conversation}\n=== 对话结束 ===`;

  const result = await callJSON<{ highlights: Highlight[] }>(prompt, {
    model: cfg.models.distill,
    system: SYSTEM,
    label: "identify-highlights",
    temperature: 0.3,
    maxTokens: 4096,
    jsonSchema: schema,
    toolName: "emit_highlights",
  });

  return (result.highlights ?? []).filter((h) => h.confidence >= 0.5);
}
