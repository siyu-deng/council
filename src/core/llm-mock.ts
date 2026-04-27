/**
 * MockBackend — COUNCIL_MOCK=1 时启用, 不调任何真实 API
 *
 * 用于 preflight 脚本和单测——给每种 prompt label 返回 fake 但合规的结构,
 * 让上下游解析逻辑能跑通.
 */

import type { LLMBackend, CallOptions } from "./llm-backend.ts";

function mockText(label: string, prompt: string): string {
  const head = prompt.slice(0, 80).replace(/\n/g, " ");
  return `[MOCK:${label}] ${head}...

这是打桩输出, 设置 COUNCIL_MOCK=0 调真实 API。`;
}

function mockJSON<T>(label: string, prompt: string): T {
  if (label === "title") {
    return { title: "测试对话", slug: "test-conversation" } as unknown as T;
  }
  if (label === "identify-highlights") {
    return {
      highlights: [
        {
          type: "problem-reframing",
          title: "把收集框架这个动作本身拎出来审视",
          user_quote:
            "你已经在读纳瓦尔、在用第一性原理, 还要读乔布斯/马斯克——本质上是在收集框架",
          why_non_trivial: "用户主动识别了自己行为的模式, AI 并未预先暗示",
          trigger: "当面对'我下一步该学什么'类问题时",
          underlying_belief: "框架的边际收益递减, 瓶颈不在新框架",
          confidence: 0.88,
        },
        {
          type: "meta-insight",
          title: "注意力是真正的稀缺资源",
          user_quote: "注意力比时间稀缺, 优化注意力分配比堆时间更重要",
          why_non_trivial: "用户给出了和 AI 不同的资源边界观点",
          trigger: "讨论学习/工作取舍时",
          underlying_belief: "稀缺资源决定系统瓶颈",
          confidence: 0.85,
        },
      ],
    } as unknown as T;
  }
  if (label === "forge-persona") {
    const typeMatch = prompt.match(/type=([a-z-]+)/);
    const t = typeMatch?.[1] ?? "problem-reframing";
    const personaByType: Record<string, { name: string; description: string }> =
      {
        "problem-reframing": {
          name: "reframe-before-collect",
          description: "在继续收集新框架前, 先审视收集行为本身的边际收益",
        },
        "meta-insight": {
          name: "scarce-attention-first",
          description: "把注意力当成最稀缺的资源, 而不是时间",
        },
        "decision-heuristic": {
          name: "compress-to-rule",
          description: "把复杂决策压成一句可复用的启发式",
        },
        "boundary-response": {
          name: "find-the-gap",
          description: "面对压力时, 在缝隙里找差异化路径",
        },
      };
    const choice = personaByType[t] ?? personaByType["problem-reframing"];
    return {
      name: choice.name,
      description: choice.description,
      body: `## 我是谁
[MOCK persona for type=${t}] 我在"又想学点新东西"时会跳出来。

## 什么时候我会发言
- 触发场景 (mock)

## 我的思考路径
1. 停下追问 (mock)

## 我反对什么
- 反模式 (mock)

## 典型片段
> "[MOCK] 本质上是在收集框架"`,
      confidence: 0.82,
      source_quotes: ["[MOCK] 本质上是在收集框架"],
    } as unknown as T;
  }
  if (label === "refine-persona") {
    return {
      action: "enrich",
      new_body: `## 我是谁
[MOCK refined persona] 在原有思考模式上, 吸收了新的维度。

## 什么时候我会发言
- 原触发场景 + 新场景 (mock)

## 我的思考路径
1. 原步骤 (mock)
2. + 新维度 (mock)

## 我反对什么
- 原反对 (mock)
- + 新反对 (mock)

## 典型片段
> "[MOCK] 原引用"
> "[MOCK] 新 highlight 引用"`,
      new_description: "[MOCK refined] 更精准的描述",
      new_confidence: 0.88,
      rationale: "[MOCK] 新 highlight 提供了未覆盖的维度, 选 enrich",
    } as unknown as T;
  }
  if (label === "summon") {
    return {
      selected: [
        "self:reframe-before-collect",
        "mentors:naval",
        "roles:devils-advocate",
      ],
      rationale: "[MOCK] 混合 self + mentor + role 保证视角多样",
    } as unknown as T;
  }
  if (label === "merge-check") {
    return {
      mergeable: true,
      confidence: 0.8,
      reason: "[MOCK] 两个 persona 触发场景高度重叠",
      proposed_name: "merged-mock",
    } as unknown as T;
  }
  if (label === "merge-synth") {
    return {
      name: "merged-mock",
      description: "[MOCK] 合并后的 persona",
      body: "## 我是谁\n[MOCK 合并产物]",
      confidence: 0.8,
      source_quotes: ["mock quote"],
    } as unknown as T;
  }
  return { mock: true, label, head: prompt.slice(0, 40) } as unknown as T;
}

export const MockBackend: LLMBackend = {
  name: "mock",
  supportsStreaming: true,

  async text(prompt: string, opts: CallOptions): Promise<string> {
    return mockText(opts.label ?? "text", prompt);
  },

  async json<T>(
    prompt: string,
    opts: CallOptions & {
      jsonSchema: Record<string, unknown>;
      toolName?: string;
    },
  ): Promise<T> {
    return mockJSON<T>(opts.label ?? "json", prompt);
  },

  async *streamText(
    prompt: string,
    opts: CallOptions,
  ): AsyncGenerator<string> {
    const full = mockText(opts.label ?? "stream", prompt);
    for (const ch of full) {
      yield ch;
      await new Promise((r) => setTimeout(r, 8));
    }
  },
};
