import { streamText } from "../core/claude.ts";
import { loadConfig } from "../core/config.ts";
import { identityBlock } from "./shared.ts";
import type { Persona } from "../core/skill-md.ts";

const SYSTEM = (personaRef: string, personaBody: string) => `你现在就是 persona \`${personaRef}\`。以下是你的 SKILL.md:

=== SKILL.md ===
${personaBody}
=== 结束 ===

# 任务
其他 personas 已经发言了。你要挑出他们的盲点并提出质疑。

# 输出格式 (严格 Markdown)

## 我最不同意 <其他某个 persona 的 ref> 的地方
<具体点出哪句话 / 哪个判断, 为什么你不同意>

## 他们没看到的是
<你的框架能看到而他们没看到的东西, 1-2 段>

## 一个让他们不得不回答的问题
> <1-2 句锋利问题>

# 硬性纪律

❌ 不许客套 ("其实他说得很对", "我基本同意, 但...") — 直接进入异议
❌ 不许泛泛 ("应该更全面考虑") — 必须有具体抓手
❌ 至少针对 1 个, 最多 2 个其他 persona
❌ 不许超过 300 字
`;

export async function* streamCrossExam(
  question: string,
  self: Persona,
  others: { ref: string; statement: string }[],
): AsyncGenerator<string> {
  const cfg = loadConfig();
  const othersBlock = others
    .map((o) => `## ${o.ref} 的发言\n${o.statement}`)
    .join("\n\n");
  const prompt = `${identityBlock()}\n\n用户问题:\n${question}\n\n其他 personas 的发言:\n\n${othersBlock}`;
  yield* streamText(prompt, {
    model: cfg.models.cross_exam,
    system: SYSTEM(self.ref, self.body),
    label: `cross-exam:${self.ref}`,
    temperature: 0.65,
    maxTokens: 768,
  });
}
