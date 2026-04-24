import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

// MCP stdio transport 要求 stdout 只承载 JSON-RPC。
// 这个开关让 core/logger.ts 和 engine/render.ts 完全不写 stdout/stderr (也避免泄到调用方终端)。
// 必须在 import 其他模块前设置, 因为 logger 在 import 时读取环境变量。
process.env.COUNCIL_QUIET = "1";

import { loadDotEnv } from "../core/env.ts";
loadDotEnv();

import {
  listPersonas,
  getPersona,
  writeSession,
  type SessionFrontmatter,
} from "../core/skill-md.ts";
import { distillOne } from "../engine/distill.ts";
import { convene } from "../engine/convene.ts";
import { streamStatement } from "../prompts/P4-statement.ts";
import { isInitialized } from "../core/paths.ts";

function requireInit(): void {
  if (!isInitialized()) {
    throw new Error(
      "Council 尚未初始化。请在 shell 里运行 `council init`。",
    );
  }
}

function collectStream(gen: AsyncGenerator<string>): Promise<string> {
  return (async () => {
    let buf = "";
    for await (const chunk of gen) buf += chunk;
    return buf;
  })();
}

const server = new McpServer(
  {
    name: "council",
    version: "0.1.0",
  },
  {
    capabilities: { tools: {} },
  },
);

// ━━━ council_list_personas ━━━
server.registerTool(
  "council_list_personas",
  {
    description:
      "列出当前 Council 中可用的所有 persona (思考者), 调用者可据此决定是否 convene 或 ask_persona。",
    inputSchema: {},
  },
  async () => {
    requireInit();
    const personas = listPersonas();
    const rows = personas.map((p) => ({
      ref: p.ref,
      type: p.frontmatter.type,
      description: p.frontmatter.description,
      status: p.frontmatter.status ?? "active",
      confidence: p.frontmatter.confidence,
    }));
    return {
      content: [
        {
          type: "text" as const,
          text:
            `Council 共有 ${personas.length} 个 persona:\n\n` +
            rows
              .map(
                (r) =>
                  `- ${r.ref} [${r.type}] ${r.description}${r.confidence ? ` (conf=${r.confidence})` : ""}`,
              )
              .join("\n"),
        },
      ],
    };
  },
);

// ━━━ council_convene ━━━
server.registerTool(
  "council_convene",
  {
    description:
      "召开一次思考议会。根据问题自动召集 3-5 个 persona (或由调用者指定), 各自独立表态, 互相质疑, 最后综合给出建议。返回 transcript ID 和综合结论。",
    inputSchema: {
      question: z.string().describe("用户想被帮助决策的问题"),
      personas: z
        .array(z.string())
        .optional()
        .describe(
          "可选: 指定 persona refs (如 'mentors:naval'), 否则自动 summon",
        ),
    },
  },
  async ({ question, personas }) => {
    requireInit();
    const id = await convene(question, {
      with: personas?.join(","),
    });
    const { getTranscript } = await import("../core/skill-md.ts");
    const t = getTranscript(id);
    return {
      content: [
        {
          type: "text" as const,
          text: t.body,
        },
      ],
    };
  },
);

// ━━━ council_ask_persona ━━━
server.registerTool(
  "council_ask_persona",
  {
    description:
      "单独问某个 persona 一个问题, 不召集议会。用于调用者只想听一个特定视角时。",
    inputSchema: {
      persona: z
        .string()
        .describe('persona ref, 如 "mentors:naval" / "self:xxx"'),
      question: z.string(),
    },
  },
  async ({ persona: personaRef, question }) => {
    requireInit();
    const p = getPersona(personaRef);
    const text = await collectStream(streamStatement(question, p));
    return {
      content: [
        {
          type: "text" as const,
          text: `## ${p.ref} 的回答\n\n${text}`,
        },
      ],
    };
  },
);

// ━━━ council_capture_this ━━━
server.registerTool(
  "council_capture_this",
  {
    description:
      "把调用方 (通常是 Claude Desktop) 当前的对话捕获为 Council 的新 session, 并立即蒸馏出高光和潜在 persona。",
    inputSchema: {
      conversation: z
        .string()
        .describe(
          "完整对话文本, 建议 Claude.ai 导出格式或 Markdown, 区分 user / assistant 发言",
        ),
      title_hint: z.string().optional().describe("可选标题提示"),
    },
  },
  async ({ conversation, title_hint }) => {
    requireInit();
    const date = new Date().toISOString().slice(0, 10);
    const slug =
      (title_hint ?? "mcp-captured")
        .toLowerCase()
        .replace(/[^\w\u4e00-\u9fa5-]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 40) || "mcp-captured";
    const id = `${date}-${slug}`;

    const fm: SessionFrontmatter = {
      id,
      captured_at: new Date().toISOString(),
      source: "mcp",
      title: title_hint ?? "MCP Captured",
      distilled: false,
    };
    writeSession(fm, conversation);
    await distillOne(id);

    return {
      content: [
        {
          type: "text" as const,
          text: `已捕获并蒸馏 session ${id}。运行 \`council persona list\` 查看新增的 persona。`,
        },
      ],
    };
  },
);

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  process.stderr.write(`[council mcp] fatal: ${String(err)}\n`);
  process.exit(1);
});
