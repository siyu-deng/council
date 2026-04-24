import { spawn } from "node:child_process";
import { join } from "node:path";
import { repoRoot } from "../core/paths.ts";
import { log } from "../core/logger.ts";
import { isInitialized } from "../core/paths.ts";
import { NotInitializedError } from "../core/errors.ts";

export async function serveCommand(): Promise<void> {
  if (!isInitialized()) throw new NotInitializedError();
  log.info("启动 Council MCP Server (stdio)...");
  log.muted("  退出: Ctrl+C");

  const serverPath = join(repoRoot(), "src", "mcp", "server.ts");
  const child = spawn("bun", [serverPath], {
    stdio: "inherit",
    env: process.env,
  });

  child.on("exit", (code) => {
    process.exit(code ?? 0);
  });
}
