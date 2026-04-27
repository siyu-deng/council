/**
 * Claude LLM 调用入口 (路由层)
 * ─────────────────────────────
 *
 * 历史: 这里直接装 Anthropic SDK + BYOK 调用. 现在改成路由层——
 * 三个公共函数 (callText / callJSON / streamText) 把请求转发给当前激活的
 * LLMBackend (AnthropicBackend / SamplingBackend / MockBackend).
 *
 * 默认 backend 选择 (在没显式 setBackend 的场景下):
 *   - COUNCIL_MOCK=1: MockBackend (单测/preflight)
 *   - 其他: AnthropicBackend (BYOK, 历来行为)
 *
 * MCP 模式下, src/mcp/server.ts 在启动时会显式 setBackend(SamplingBackend(...))
 * 如果探测到客户端支持 sampling 且没 ANTHROPIC_API_KEY.
 *
 * 11 个 prompt 文件 + commands 完全不需要改, 它们继续 import { callText, ... }
 * from "./claude.ts" 就好.
 */

import { getBackend } from "./llm-backend.ts";
import { AnthropicBackend } from "./llm-anthropic.ts";
import { MockBackend } from "./llm-mock.ts";
import type { CallOptions } from "./llm-backend.ts";

// re-export 给历来的调用方
export type { CallOptions };

const MOCK = !!process.env.COUNCIL_MOCK;

/**
 * 选 backend:
 *   1. COUNCIL_MOCK=1 → 永远 MockBackend (短路, 不进真实 backend 即使 MCP server 注册了)
 *   2. 显式 setBackend / setBackendResolver → 用那个
 *   3. 兜底 → AnthropicBackend (CLI/web 历来行为)
 */
function resolve() {
  if (MOCK) return MockBackend;
  return getBackend() ?? AnthropicBackend;
}

export async function callText(
  userPrompt: string,
  opts: CallOptions,
): Promise<string> {
  return resolve().text(userPrompt, opts);
}

export async function callJSON<T = unknown>(
  userPrompt: string,
  opts: CallOptions & { jsonSchema: Record<string, unknown>; toolName?: string },
): Promise<T> {
  return resolve().json<T>(userPrompt, opts);
}

export async function* streamText(
  userPrompt: string,
  opts: CallOptions,
): AsyncGenerator<string> {
  yield* resolve().streamText(userPrompt, opts);
}

export const MODELS = {
  haiku: "claude-haiku-4-5-20251001",
} as const;
