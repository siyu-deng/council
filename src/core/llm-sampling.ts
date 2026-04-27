/**
 * SamplingBackend — 通过 MCP `sampling/createMessage` 借宿主客户端的 LLM
 *
 * 工作机制:
 *   Council MCP server ──[sampling/createMessage]──▶ 客户端 (Claude Desktop / Code / Cursor)
 *                       ◀──[response]──────────────  客户端用用户已付订阅跑 Claude
 *
 * 用户在 MCP 客户端调用 council_convene 等工具时, Council 内部不调 Anthropic API,
 * 而是反向请求宿主客户端帮它生成内容. 用户**完全不需要配 API Key**.
 *
 * 硬约束 (诚实记录):
 *   1. 不流式 — sampling 是一次性 request/response, 流式接口走"假流式" (整段 yield).
 *   2. 用户 approve — 客户端可能弹窗让用户同意每次 sampling, 一些客户端有
 *      "Approve always for this server" 选项可以一次性免除.
 *   3. 客户端兼容性 — Claude Desktop / Claude Code 完整支持, Cursor 部分支持,
 *      其他第三方客户端大概率不支持. mcp/server.ts 启动时探测 capability, 不支持
 *      就 fallback 到 AnthropicBackend (BYOK).
 *
 * Tools 模式 (callJSON):
 *   SDK 1.x 的 sampling 协议**支持 tools 字段**, 可以原样转发 fake tool 让 LLM 输出
 *   结构化 JSON. 但**不是所有客户端都实现了** sampling-with-tools. 如果客户端
 *   返回 stop_reason='tool_use' 但没 tool_use 块, 我们 fallback 到 prompt-based
 *   JSON (在 system prompt 里塞 schema, 让 LLM 输出 raw JSON, 然后解析).
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { LLMBackend, CallOptions } from "./llm-backend.ts";
import { log } from "./logger.ts";

const DEFAULT_MAX_TOKENS = 2048;

/**
 * 把 Council 的 model 字符串 (如 "claude-haiku-4-5-20251001") 转成
 * sampling protocol 的 model hint. 协议层只支持 hint 风格 ('claude-haiku' 等),
 * 客户端会在自己的可用模型里挑最接近的.
 */
function modelToHint(model: string): string {
  if (model.includes("haiku")) return "claude-haiku";
  if (model.includes("sonnet")) return "claude-sonnet";
  if (model.includes("opus")) return "claude-opus";
  return model; // 直接传, 让客户端尝试
}

/**
 * 从 sampling 响应里抽取文本内容. 协议规定 content 是单个 SamplingMessageContent 对象
 * (SDK 1.x 的 createMessage 不带 tools 时返回 CreateMessageResult).
 */
function extractText(
  content: unknown,
): string {
  if (
    content &&
    typeof content === "object" &&
    "type" in content &&
    content.type === "text" &&
    "text" in content &&
    typeof content.text === "string"
  ) {
    return content.text;
  }
  return "";
}

/** 从可能含 markdown 代码块的字符串里剥出 JSON */
function stripMarkdownJson(s: string): string {
  return s
    .trim()
    .replace(/^```(?:json)?\s*\n?/i, "")
    .replace(/\n?```$/i, "")
    .trim();
}

export class SamplingBackend implements LLMBackend {
  readonly name = "mcp-sampling" as const;
  readonly supportsStreaming = false;

  constructor(private mcpServer: McpServer) {}

  async text(userPrompt: string, opts: CallOptions): Promise<string> {
    try {
      const result = await this.mcpServer.server.createMessage({
        messages: [
          {
            role: "user",
            content: { type: "text", text: userPrompt },
          },
        ],
        maxTokens: opts.maxTokens ?? DEFAULT_MAX_TOKENS,
        temperature: opts.temperature ?? 0.4,
        systemPrompt: opts.system,
        modelPreferences: {
          hints: [{ name: modelToHint(opts.model) }],
        },
      });
      return extractText(result.content);
    } catch (err) {
      log.debug(`Sampling text 调用失败: ${String(err)}`);
      throw new Error(
        `MCP Sampling 调用失败 (${opts.label ?? "text"}): ${String(err)}`,
      );
    }
  }

  async json<T = unknown>(
    userPrompt: string,
    opts: CallOptions & {
      jsonSchema: Record<string, unknown>;
      toolName?: string;
    },
  ): Promise<T> {
    // 策略: 不依赖客户端是否支持 sampling-with-tools (各家实现不一).
    // 直接用 prompt-engineering 让 LLM 输出 raw JSON, 这样最大兼容性.
    const schemaStr = JSON.stringify(opts.jsonSchema, null, 2);
    const enrichedSystem = [
      opts.system ?? "",
      "",
      "你必须只输出符合下面 JSON schema 的 JSON 对象, 不要包裹 markdown 代码块, 不要任何解释文字。",
      "JSON Schema:",
      schemaStr,
    ]
      .filter(Boolean)
      .join("\n");

    const result = await this.mcpServer.server.createMessage({
      messages: [
        {
          role: "user",
          content: { type: "text", text: userPrompt },
        },
      ],
      maxTokens: opts.maxTokens ?? DEFAULT_MAX_TOKENS,
      temperature: opts.temperature ?? 0.3,
      systemPrompt: enrichedSystem,
      modelPreferences: {
        hints: [{ name: modelToHint(opts.model) }],
      },
    });

    const raw = extractText(result.content);
    const cleaned = stripMarkdownJson(raw);
    try {
      return JSON.parse(cleaned) as T;
    } catch (err) {
      log.debug(`Sampling JSON parse 失败, 原始返回: ${raw.slice(0, 200)}`);
      throw new Error(
        `MCP Sampling 返回了非 JSON 内容 (${opts.label ?? "json"}). ` +
          `这通常因为宿主客户端的 sampling 实现不严格遵循 systemPrompt. ` +
          `建议: 配 ANTHROPIC_API_KEY 走 BYOK 模式. 错误: ${String(err)}`,
      );
    }
  }

  /**
   * 假流式: sampling 没有原生 streaming, 整段拿到后一次性 yield 一个 chunk.
   * 这意味着用户在 Claude Code/Cursor 里看不到逐字生成, 而是看到 "..." 然后整段出现.
   * 这是 sampling 协议的硬约束, 不是 Council 的 bug.
   */
  async *streamText(
    userPrompt: string,
    opts: CallOptions,
  ): AsyncGenerator<string> {
    const full = await this.text(userPrompt, opts);
    yield full;
  }
}
