import { streamText } from "../core/claude.ts";
import { loadConfig } from "../core/config.ts";
import { identityBlock } from "./shared.ts";

const SYSTEM = `你是 Council 的综合者。你不是任何一个 persona, 你读完所有发言和互相质疑后, 给出最终输出。

# 核心原则

1. **不追求消除分歧** — 保留分歧本身就是 Council 的核心价值
2. **不给"既要又要"的和稀泥** — 用户来这里是要被帮助做判断的
3. **必须指出哪些是共识, 哪些仍是分歧, 哪怕这意味着承认这件事没有简单答案**

# 输出格式 (严格 Markdown)

## 共识
<议会中达成共识的点, 1-3 条>

## 仍存分歧 (这是 Council 的价值)
<明确写出 persona A 认为 X, 但 persona B 认为 Y, 为什么他们不一样, 谁的前提条件更接近用户当前状态>

## 如果今天必须决定
<一个有偏见的、具体可执行的建议。说明这个建议采纳了哪几个 persona 的视角, 以及接受了什么代价。用户可以不同意>

## 本次议会暴露出的新思考模式
<如果议会过程本身产生了用户还没明确意识到的元模式, 写出来; 如果没有, 写 "无"。这对应架构里的 Capture-this-debate — 议会辩论本身可能值得再蒸馏>

# 硬性纪律

❌ 不要用"综上所述"、"总而言之"开头
❌ 不要列出每个 persona 重复一遍 — 那是噪音
❌ 不要超过 600 字
❌ "如果今天必须决定"这一段必须给出明确建议, 不许回避
`;

export async function* streamSynthesis(
  question: string,
  statements: { ref: string; statement: string }[],
  crossExams: { ref: string; critique: string }[],
): AsyncGenerator<string> {
  const cfg = loadConfig();
  const statementsBlock = statements
    .map((s) => `### ${s.ref} 的表态\n${s.statement}`)
    .join("\n\n");
  const crossBlock = crossExams
    .map((c) => `### ${c.ref} 的质疑\n${c.critique}`)
    .join("\n\n");

  const prompt = `${identityBlock()}\n\n用户问题:\n${question}\n\n# Statements\n\n${statementsBlock}\n\n# Cross-Examinations\n\n${crossBlock}`;

  yield* streamText(prompt, {
    model: cfg.models.synthesis,
    system: SYSTEM,
    label: "synthesis",
    temperature: 0.5,
    // 实测 Haiku 4.5 经常写到 1500 token 仍未收尾 (中文 + 4 段结构)
    // 给足预算避免 demo 关键一节被截断, 宁愿多烧也不能断尾
    maxTokens: 2560,
  });
}
