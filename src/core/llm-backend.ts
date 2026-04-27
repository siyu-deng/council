/**
 * LLM Backend Abstraction
 * ───────────────────────
 *
 * Council 历来直接调 Anthropic SDK (BYOK). 但用户在 MCP 客户端
 * (Claude Desktop / Cursor / Claude Code) 里希望"借宿主 LLM, 不配 Key"——
 * 这要求 Council MCP server 走 MCP Sampling (`sampling/createMessage`).
 *
 * 抽象目标: 让 11 个 prompt 文件 + commands 完全不感知 backend 切换。
 * 三个公共入口 (callText / callJSON / streamText) 在 src/core/claude.ts 里
 * 通过 getBackend() 把请求路由到当前激活的 backend.
 *
 * 路由规则 (在 setBackend 设定):
 *   - CLI / web 上下文: AnthropicBackend (BYOK 必需)
 *   - MCP 上下文 + 客户端支持 sampling + 没 API Key: SamplingBackend
 *   - MCP 上下文 + 有 API Key: 仍优先 AnthropicBackend (更快, 流式, 不弹窗)
 *   - COUNCIL_MOCK=1: MockBackend (单测/预检)
 */

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

export interface LLMBackend {
  /** 给日志/状态用——'anthropic-api' / 'mcp-sampling' / 'mock' */
  readonly name: "anthropic-api" | "mcp-sampling" | "mock";
  /** 是否支持真正的流式输出 (sampling 不支持, 会假流式) */
  readonly supportsStreaming: boolean;

  text(userPrompt: string, opts: CallOptions): Promise<string>;
  json<T>(
    userPrompt: string,
    opts: CallOptions & { jsonSchema: Record<string, unknown>; toolName?: string },
  ): Promise<T>;
  streamText(userPrompt: string, opts: CallOptions): AsyncGenerator<string>;
}

let _backend: LLMBackend | null = null;
let _resolver: (() => LLMBackend) | null = null;

/** 立刻设置 backend (CLI/web 用). 之后所有 LLM 调用走它. */
export function setBackend(b: LLMBackend): void {
  _backend = b;
}

/**
 * 注册延迟 resolver (MCP server 用). 第一次 getBackend() 触发, 结果缓存.
 *
 * 为什么需要 lazy: MCP server 要在初始化 (initialize 握手) 完成后才能读
 * client capabilities (判断是否支持 sampling). 但 server.connect() resolve 时,
 * capabilities 在 SDK 内部还没就绪——必须等到第一次工具调用时再决定 backend.
 */
export function setBackendResolver(fn: () => LLMBackend): void {
  _resolver = fn;
}

export function getBackend(): LLMBackend | null {
  if (_backend) return _backend;
  if (_resolver) {
    _backend = _resolver(); // resolve 后缓存, 不重复算
    return _backend;
  }
  return null;
}

/** 用于在错误信息里给用户提示 */
export function describeBackend(): string {
  return _backend ? _backend.name : "anthropic-api (default)";
}
