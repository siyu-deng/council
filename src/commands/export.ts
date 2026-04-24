import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { paths, ensureDir, repoRoot } from "../core/paths.ts";
import { log, c } from "../core/logger.ts";
import { isInitialized } from "../core/paths.ts";
import { NotInitializedError } from "../core/errors.ts";

export async function exportCommand(opts: { mcp?: boolean }): Promise<void> {
  if (!isInitialized()) throw new NotInitializedError();
  if (!opts.mcp) {
    log.error("目前只支持 --mcp");
    log.muted("  council export --mcp");
    return;
  }

  const dir = paths.mcpExport();
  ensureDir(dir);

  const serverPath = join(repoRoot(), "src", "mcp", "server.ts");
  const bunBin = process.env.BUN_INSTALL
    ? join(process.env.BUN_INSTALL, "bin", "bun")
    : "bun";

  // stub package.json for the export
  writeFileSync(
    join(dir, "package.json"),
    JSON.stringify(
      {
        name: "council-mcp",
        version: "0.1.0",
        private: true,
        description: "Council MCP server export",
      },
      null,
      2,
    ),
    "utf-8",
  );

  const config = {
    mcpServers: {
      council: {
        command: bunBin,
        args: [serverPath],
        env: {
          ANTHROPIC_API_KEY: "sk-ant-...",
          COUNCIL_HOME: paths.root(),
        },
      },
    },
  };

  writeFileSync(
    join(dir, "claude_desktop_config.snippet.json"),
    JSON.stringify(config, null, 2),
    "utf-8",
  );

  const readme = `# Council — Claude Desktop 集成

## 1. 复制配置片段

打开:
\`~/Library/Application Support/Claude/claude_desktop_config.json\`
(Windows: \`%APPDATA%\\Claude\\claude_desktop_config.json\`)

把下面这段合并进 \`mcpServers\` 下:

\`\`\`json
${JSON.stringify(config, null, 2)}
\`\`\`

**把 \`ANTHROPIC_API_KEY\` 换成你自己的**。\`COUNCIL_HOME\` 保持当前值即可。

## 2. 重启 Claude Desktop

退出并重新打开, Claude 会在左下角显示 MCP 已连接。

## 3. 在 Claude 里试用

问 Claude:
> 用 Council 帮我决定一下要不要接这个项目

Claude 会自动调用 \`council_convene\`, 返回议会辩论结果。

## Tools 清单

- \`council_convene\` — 召开议会
- \`council_ask_persona\` — 单独问一个 persona
- \`council_capture_this\` — 把当前对话捕获并蒸馏
- \`council_list_personas\` — 列出可用 persona
`;
  writeFileSync(join(dir, "README.md"), readme, "utf-8");

  log.success(`导出完毕: ${c.bold(dir)}`);
  log.section("Claude Desktop 配置 — 把下面粘贴进 claude_desktop_config.json:");
  log.plain("");
  log.plain(JSON.stringify(config, null, 2));
  log.plain("");
  log.muted(
    `详细说明: ${join(dir, "README.md")}`,
  );
}
