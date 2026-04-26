import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { paths, ensureDir } from "../core/paths.ts";
import { log, c } from "../core/logger.ts";
import { isInitialized } from "../core/paths.ts";
import { NotInitializedError } from "../core/errors.ts";

const NPM_PKG = "@moyu-build/council";
const TOOL_LIST = [
  ["council_who_am_i", "拉取用户身份档案 + 全部 active persona (会话开场调一次)"],
  ["council_bootstrap_identity", "基于已蒸馏 self persona 反向回推 identity 草稿"],
  ["council_list_personas", "列出可用 persona (轻量)"],
  ["council_list_sessions", "列出已捕获的 session"],
  ["council_get_session", "查看 session 详情 + 关联 highlights + 加入的 persona"],
  ["council_list_skills", "列出蒸馏出的高光 (按 type 过滤)"],
  ["council_get_skill", "查看单个 highlight 的完整内容"],
  ["council_convene", "召开议会 (multi-persona statement → cross-exam → synthesis)"],
  ["council_ask_persona", "单独问某个 persona 一个问题"],
  ["council_should_capture", "判断对话是否值得 capture (反 AI 灌输守门员)"],
  ["council_capture_this", "把当前对话捕获并立即蒸馏 (默认走 should_capture 守门)"],
  ["council_refine", "用新 highlights 深化已有 self persona (链路 C 反哺)"],
  ["council_evolve", "扫全库, 标记 stale persona, 建议 merge"],
] as const;
const PROMPT_LIST = [
  ["as_me", "把 AI 调成「你」 — 客户端斜杠菜单可见"],
  ["debate", "把当前对话提炼成决策问题, 自动召集议会"],
  ["capture", "末尾用. 先调 should_capture 判定, 值得才存"],
] as const;

export async function exportCommand(opts: { mcp?: boolean }): Promise<void> {
  if (!isInitialized()) throw new NotInitializedError();
  if (!opts.mcp) {
    log.error("目前只支持 --mcp");
    log.muted("  council export --mcp");
    return;
  }

  const dir = paths.mcpExport();
  ensureDir(dir);

  // ━━━ npx 模式 (推荐, 任何 Node 20+ 用户开箱即用) ━━━
  const npxConfig = {
    mcpServers: {
      council: {
        command: "npx",
        args: ["-y", `${NPM_PKG}@latest`, "serve"],
        env: {
          ANTHROPIC_API_KEY: "sk-ant-...",
        },
      },
    },
  };

  writeFileSync(
    join(dir, "claude_desktop_config.snippet.json"),
    JSON.stringify(npxConfig, null, 2),
    "utf-8",
  );

  // ━━━ README — 给收到这份 export 的人看 ━━━
  const toolsTable = TOOL_LIST.map(([n, d]) => `| \`${n}\` | ${d} |`).join("\n");
  const promptsTable = PROMPT_LIST.map(([n, d]) => `| \`/${n}\` | ${d} |`).join("\n");

  const readme = `# Council — MCP 客户端集成 (npx 模式)

> Council 已发布到 npm: [\`${NPM_PKG}\`](https://www.npmjs.com/package/${NPM_PKG})
> 这份导出是给任何 MCP 客户端 (Claude Desktop / Cursor / Cherry Studio / VSCode) 接入用的最小配置.

---

## 1. 复制配置片段

把下面这段合并进你客户端的 MCP 配置:

| 客户端 | 配置文件路径 |
|---|---|
| Claude Desktop (macOS) | \`~/Library/Application Support/Claude/claude_desktop_config.json\` |
| Claude Desktop (Windows) | \`%APPDATA%\\Claude\\claude_desktop_config.json\` |
| Cursor | \`~/.cursor/mcp.json\` |
| Cherry Studio | 设置 → MCP 服务器 → 添加 (粘贴 JSON) |

\`\`\`json
${JSON.stringify(npxConfig, null, 2)}
\`\`\`

**把 \`ANTHROPIC_API_KEY\` 换成你自己的** ([去 console.anthropic.com 拿](https://console.anthropic.com/settings/keys)).

## 2. 重启客户端

退出并重新打开. 首次启动会触发 \`npx\` 拉取 ${NPM_PKG}, 之后命中 npm 缓存秒启动.

## 3. 在客户端里试用

**最快入门** — 任意对话开头输入:

\`\`\`
/as_me
\`\`\`

(Claude Desktop / Cursor 会列出 council 提供的斜杠 prompts, 选 \`as_me\`)

或者直接说:

> "用 council 帮我决定要不要接这个项目"

客户端会自动调 \`council_convene\`, 返回议会辩论结果.

---

## Tools 清单 (${TOOL_LIST.length} 个)

| Tool | 用途 |
|---|---|
${toolsTable}

## Prompts 清单 (${PROMPT_LIST.length} 个, 客户端斜杠菜单可见)

| Prompt | 用途 |
|---|---|
${promptsTable}

---

## 数据落在哪里

\`~/.council/\` (本地 markdown, 跨客户端共享同一份身份档案).
没有云依赖, 没有数据库, 你 \`git init\` 都行.

## 没装 Council 也能用?

可以. \`npx\` 会自动从 npm 拉, 不需要预先 \`npm install -g\`.
但如果想离线 / 加速, 可以一次性装好:

\`\`\`bash
npm install -g ${NPM_PKG}
\`\`\`

然后把上面 \`command: "npx", args: ["-y", "${NPM_PKG}@latest", "serve"]\` 简化为
\`command: "council", args: ["serve"]\`.

---

## 想从源码贡献 / 跑 web 圆桌可视化?

见 [GitHub repo](https://github.com/siyu-deng/council) 和 [\`CONTRIBUTING.md\`](https://github.com/siyu-deng/council/blob/main/CONTRIBUTING.md).
`;
  writeFileSync(join(dir, "README.md"), readme, "utf-8");

  // ━━━ 终端打印 ━━━
  log.success(`导出完毕: ${c.bold(dir)}`);
  log.section("MCP 客户端配置 — 复制下面粘进 claude_desktop_config.json / .cursor/mcp.json:");
  log.plain("");
  log.plain(JSON.stringify(npxConfig, null, 2));
  log.plain("");
  log.muted(`详细说明: ${join(dir, "README.md")}`);
  log.muted(`包含 ${TOOL_LIST.length} 个 tools + ${PROMPT_LIST.length} 个 prompts.`);
}
