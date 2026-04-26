import { isInitialized } from "../core/paths.ts";
import { NotInitializedError } from "../core/errors.ts";

/**
 * 启动 MCP server (stdio transport).
 *
 * 关键: stdio transport 把 stdout 当 JSON-RPC 通道, 任何额外打印都会污染流.
 * 因此这里:
 *   (a) 在 import server.ts 之前设 COUNCIL_QUIET=1 — 阻止 logger 写 stdout/stderr
 *   (b) 不打印任何启动提示 (旧版的 log.info 会污染 JSON-RPC 流)
 *   (c) 不再 spawn 子进程跑源码 — 直接在本进程 import server.ts 启动
 *       (旧版 spawn("bun", [src/mcp/server.ts]) 在 npm 包安装上不可行,
 *        因为 dist 是单文件 bundle, 没有源码可以指向)
 */
export async function serveCommand(): Promise<void> {
  if (!isInitialized()) throw new NotInitializedError();
  process.env.COUNCIL_QUIET = "1";
  // 动态 import 确保 COUNCIL_QUIET 在 logger 模块初始化前生效
  const { startMcpServer } = await import("../mcp/server.ts");
  await startMcpServer();
}
