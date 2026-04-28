/**
 * AnthropicBackend — 直接调 Anthropic API (BYOK)
 *
 * 这是 Council 历来的实现. 现状逻辑原样保留, 只是从 claude.ts 里搬出来,
 * 让 claude.ts 变成路由层.
 */

import Anthropic from "@anthropic-ai/sdk";
import { ApiKeyMissingError } from "./errors.ts";
import { log } from "./logger.ts";
import { recordUsage } from "./usage-log.ts";
import type { LLMBackend, CallOptions } from "./llm-backend.ts";

const DEFAULT_MAX_TOKENS = 2048;

/**
 * 把 system prompt 包成 cache_control block.
 * 收益: 同一 persona 在 statement + cross-exam 中被复用; 同一 identity 块跨多次议会 5 分钟内复用.
 * 当 system 字符串不存在或太短 (低于 model 最小阈值: Haiku 2048 tokens, Sonnet/Opus 1024 tokens),
 * Anthropic 会**静默不 cache**——透传 cache_control 不会出错, 只是没收益.
 */
function buildSystemBlocks(
  system?: string,
): Anthropic.Messages.TextBlockParam[] | undefined {
  if (!system) return undefined;
  return [
    {
      type: "text" as const,
      text: system,
      cache_control: { type: "ephemeral" as const },
    },
  ];
}

let _client: Anthropic | null = null;
function client(): Anthropic {
  if (_client) return _client;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new ApiKeyMissingError();
  _client = new Anthropic({ apiKey });
  return _client;
}

async function withRetry<T>(fn: () => Promise<T>, retries = 3): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const backoff = 500 * Math.pow(2, i);
      log.debug(
        `Claude API 错误 (attempt ${i + 1}), ${backoff}ms 后重试: ${String(err)}`,
      );
      await new Promise((r) => setTimeout(r, backoff));
    }
  }
  throw lastErr;
}

export const AnthropicBackend: LLMBackend = {
  name: "anthropic-api",
  supportsStreaming: true,

  async text(userPrompt: string, opts: CallOptions): Promise<string> {
    const msg = await withRetry(() =>
      client().messages.create({
        model: opts.model,
        max_tokens: opts.maxTokens ?? DEFAULT_MAX_TOKENS,
        temperature: opts.temperature ?? 0.4,
        system: buildSystemBlocks(opts.system),
        messages: [{ role: "user", content: userPrompt }],
      }),
    );
    recordUsage({
      model: opts.model,
      label: opts.label,
      usage: msg.usage,
    });
    const block = msg.content.find((b) => b.type === "text");
    return block && block.type === "text" ? block.text : "";
  },

  async json<T = unknown>(
    userPrompt: string,
    opts: CallOptions & {
      jsonSchema: Record<string, unknown>;
      toolName?: string;
    },
  ): Promise<T> {
    const toolName = opts.toolName ?? "emit";
    const msg = await withRetry(() =>
      client().messages.create({
        model: opts.model,
        max_tokens: opts.maxTokens ?? DEFAULT_MAX_TOKENS,
        temperature: opts.temperature ?? 0.3,
        system: buildSystemBlocks(opts.system),
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
    recordUsage({
      model: opts.model,
      label: opts.label,
      usage: msg.usage,
    });
    const tool = msg.content.find((b) => b.type === "tool_use");
    if (!tool || tool.type !== "tool_use")
      throw new Error("Claude 未按 tool 返回 JSON");
    return tool.input as T;
  },

  async *streamText(
    userPrompt: string,
    opts: CallOptions,
  ): AsyncGenerator<string> {
    const stream = await client().messages.stream({
      model: opts.model,
      max_tokens: opts.maxTokens ?? DEFAULT_MAX_TOKENS,
      temperature: opts.temperature ?? 0.5,
      system: buildSystemBlocks(opts.system),
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
    // 流结束后 finalMessage() 包含 token 统计. await 它拿真实 usage.
    try {
      const final = await stream.finalMessage();
      recordUsage({
        model: opts.model,
        label: opts.label,
        usage: final.usage,
      });
    } catch {
      /* 流式调用偶尔拿不到 finalMessage, 不影响主流程 */
    }
  },
};
