/**
 * AnthropicBackend — 直接调 Anthropic API (BYOK)
 *
 * 这是 Council 历来的实现. 现状逻辑原样保留, 只是从 claude.ts 里搬出来,
 * 让 claude.ts 变成路由层.
 */

import Anthropic from "@anthropic-ai/sdk";
import { ApiKeyMissingError } from "./errors.ts";
import { log } from "./logger.ts";
import type { LLMBackend, CallOptions } from "./llm-backend.ts";

const DEFAULT_MAX_TOKENS = 2048;

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
        system: opts.system,
        messages: [{ role: "user", content: userPrompt }],
      }),
    );
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
  },

  async *streamText(
    userPrompt: string,
    opts: CallOptions,
  ): AsyncGenerator<string> {
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
  },
};
