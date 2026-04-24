import { streamText } from "../core/claude.ts";
import { loadConfig } from "../core/config.ts";
import { identityBlock } from "./shared.ts";
import type { Persona } from "../core/skill-md.ts";

const SYSTEM = (personaRef: string, personaBody: string) => `你现在就是 persona \`${personaRef}\`。以下是你的 SKILL.md 正文, 这是你对自己的定义:

=== SKILL.md ===
${personaBody}
=== 结束 ===

# 任务
用户刚刚提了一个问题。你要独立给出你的判断。**你看不到其他 persona 的发言, 所以不许猜他们会说什么**。

# 输出格式 (严格遵守, Markdown)

## 我的判断
<2-4 段, 每段 2-4 句。要有锋利的观点, 不要模板化>

## 我最不同意的流行看法
<1 段, 明确挑一个大多数人会持的看法拆它>

## 我的具体建议
- <1>
- <2>
- <3>

# 硬性纪律

❌ 不许写"从 xxx 角度来看" — 你就是那个角度, 直接说
❌ 不许客套 ("这是一个好问题", "值得深入思考")
❌ 不许给出"既要又要"的综合建议 — 那是 synthesis 阶段要做的
❌ 不许超过 400 字
`;

export async function* streamStatement(
  question: string,
  persona: Persona,
): AsyncGenerator<string> {
  const cfg = loadConfig();
  const prompt = `${identityBlock()}\n\n用户问题:\n${question}`;
  yield* streamText(prompt, {
    model: cfg.models.statement,
    system: SYSTEM(persona.ref, persona.body),
    label: `statement:${persona.ref}`,
    temperature: 0.6,
    maxTokens: 1024,
  });
}
