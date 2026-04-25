import Anthropic from "@anthropic-ai/sdk";
import { ApiKeyMissingError } from "./errors.ts";
import { log } from "./logger.ts";

const MOCK = !!process.env.COUNCIL_MOCK;

let _client: Anthropic | null = null;
function client(): Anthropic {
  if (_client) return _client;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new ApiKeyMissingError();
  _client = new Anthropic({ apiKey });
  return _client;
}

export interface CallOptions {
  model: string;
  system?: string;
  maxTokens?: number;
  temperature?: number;
  /** Request JSON output via a fake tool; the tool's input is returned. */
  jsonSchema?: Record<string, unknown>;
  /** Label for logs/mocks. */
  label?: string;
}

const DEFAULT_MAX_TOKENS = 2048;

export async function callText(
  userPrompt: string,
  opts: CallOptions,
): Promise<string> {
  if (MOCK) return mockText(opts.label ?? "text", userPrompt);
  const msg = await withRetry(() =>
    client().messages.create({
      model: opts.model,
      max_tokens: opts.maxTokens ?? DEFAULT_MAX_TOKENS,
      temperature: opts.temperature ?? 0.4,
      system: opts.system,
      messages: [{ role: "user", content: userPrompt }],
    }),
  );
  const block = msg.content.find((b) => b.type === "text");
  return block && block.type === "text" ? block.text : "";
}

export async function callJSON<T = unknown>(
  userPrompt: string,
  opts: CallOptions & { jsonSchema: Record<string, unknown>; toolName?: string },
): Promise<T> {
  const toolName = opts.toolName ?? "emit";
  if (MOCK) return mockJSON<T>(opts.label ?? "json", userPrompt);
  const msg = await withRetry(() =>
    client().messages.create({
      model: opts.model,
      max_tokens: opts.maxTokens ?? DEFAULT_MAX_TOKENS,
      temperature: opts.temperature ?? 0.3,
      system: opts.system,
      tools: [
        {
          name: toolName,
          description:
            "按要求的 JSON schema 返回结构化结果, 不要返回普通文本。",
          input_schema: opts.jsonSchema as Anthropic.Tool.InputSchema,
        },
      ],
      tool_choice: { type: "tool", name: toolName },
      messages: [{ role: "user", content: userPrompt }],
    }),
  );
  const tool = msg.content.find((b) => b.type === "tool_use");
  if (!tool || tool.type !== "tool_use")
    throw new Error("Claude 未按 tool 返回 JSON");
  return tool.input as T;
}

export async function* streamText(
  userPrompt: string,
  opts: CallOptions,
): AsyncGenerator<string> {
  if (MOCK) {
    const full = mockText(opts.label ?? "stream", userPrompt);
    for (const ch of full) {
      yield ch;
      await new Promise((r) => setTimeout(r, 8));
    }
    return;
  }
  const stream = await client().messages.stream({
    model: opts.model,
    max_tokens: opts.maxTokens ?? DEFAULT_MAX_TOKENS,
    temperature: opts.temperature ?? 0.5,
    system: opts.system,
    messages: [{ role: "user", content: userPrompt }],
  });
  for await (const event of stream) {
    if (
      event.type === "content_block_delta" &&
      event.delta.type === "text_delta"
    ) {
      yield event.delta.text;
    }
  }
}

async function withRetry<T>(fn: () => Promise<T>, retries = 3): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const backoff = 500 * Math.pow(2, i);
      log.debug(`Claude API 错误 (attempt ${i + 1}), ${backoff}ms 后重试: ${String(err)}`);
      await new Promise((r) => setTimeout(r, backoff));
    }
  }
  throw lastErr;
}

// —————————————————— mock mode ——————————————————

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
    // P1 的 schema 要求 {highlights: [...]} 包装; 字段名必须匹配 Highlight interface
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
    // mock: 根据 prompt 里的 type= 字段返回不同的 persona, 避免同名覆盖
    const typeMatch = prompt.match(/type=([a-z-]+)/);
    const t = typeMatch?.[1] ?? "problem-reframing";
    const personaByType: Record<string, { name: string; description: string }> = {
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

export const MODELS = {
  haiku: "claude-haiku-4-5-20251001",
} as const;
