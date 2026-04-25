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
  readIdentity,
  type SessionFrontmatter,
} from "../core/skill-md.ts";
import { distillOne } from "../engine/distill.ts";
import { convene } from "../engine/convene.ts";
import { streamStatement } from "../prompts/P4-statement.ts";
import { shouldCapture } from "../prompts/P10-should-capture.ts";
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
    capabilities: { tools: {}, prompts: {} },
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

// ━━━ council_who_am_i ━━━
server.registerTool(
  "council_who_am_i",
  {
    description:
      "返回用户的身份档案 (identity.md) + 当前所有 active 的 self persona (含一条典型片段) + 可用的 mentor / role 名录。LLM 在对话开始或拿不准用户立场时调用一次, 整段对话即可基于用户真实身份推理。",
    inputSchema: {},
  },
  async () => {
    requireInit();
    const identity = readIdentity().trim();
    const personas = listPersonas();
    const self = personas.filter((p) => p.frontmatter.type === "self");
    const mentors = personas.filter((p) => p.frontmatter.type === "mentor");
    const roles = personas.filter((p) => p.frontmatter.type === "role");

    const lines: string[] = [];
    lines.push("# 关于用户");
    lines.push("");
    lines.push(identity || "(用户尚未填写 identity.md)");
    lines.push("");

    if (self.length > 0) {
      lines.push("## 用户思考人格 (self personas)");
      for (const p of self) {
        const quote = extractFirstQuote(p.body);
        const conf = p.frontmatter.confidence
          ? ` (conf=${p.frontmatter.confidence.toFixed(2)})`
          : "";
        lines.push(`- **${p.ref}**${conf}: ${p.frontmatter.description}`);
        if (quote) lines.push(`  典型片段: ${quote}`);
      }
      lines.push("");
    } else {
      lines.push("## 用户思考人格");
      lines.push("(尚未蒸馏出 self persona — 可调 council_capture_this 摄入对话再触发蒸馏)");
      lines.push("");
    }

    if (mentors.length > 0) {
      lines.push("## 可用 mentor 视角");
      for (const p of mentors) {
        lines.push(`- ${p.ref}: ${p.frontmatter.description}`);
      }
      lines.push("");
    }

    if (roles.length > 0) {
      lines.push("## 可用 role 视角");
      for (const p of roles) {
        lines.push(`- ${p.ref}: ${p.frontmatter.description}`);
      }
      lines.push("");
    }

    lines.push("## 召唤方式");
    lines.push("- 单独问某个 persona: `council_ask_persona({ persona, question })`");
    lines.push("- 多视角议会: `council_convene({ question, [personas] })`");
    lines.push("- 当前对话值不值得 capture: `council_should_capture({ conversation })`");
    lines.push("- 摄入对话: `council_capture_this({ conversation, force? })`");

    return {
      content: [{ type: "text" as const, text: lines.join("\n") }],
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

// ━━━ council_should_capture ━━━
server.registerTool(
  "council_should_capture",
  {
    description:
      "在调用 council_capture_this 之前, 判断这段对话是否值得 capture。返回 worth_capturing / score / signals / reason。LLM 应该在对话末尾或 user 主动要求 capture 时先调用此工具, 避免污染 Council 数据。",
    inputSchema: {
      conversation: z
        .string()
        .describe(
          "完整对话文本, Markdown / Claude.ai 导出 / user-assistant 分段都行",
        ),
    },
  },
  async ({ conversation }) => {
    requireInit();
    const r = await shouldCapture(conversation);
    const verdict = r.worth_capturing ? "✓ 值得 capture" : "✗ 不值得 capture";
    const lines = [
      `## 判定: ${verdict} (score=${r.score.toFixed(2)})`,
      "",
      `**原因**: ${r.reason}`,
    ];
    if (r.signals.length > 0) {
      lines.push(`**Signals**: ${r.signals.join(", ")}`);
    }
    if (r.hint) lines.push(`**提示**: ${r.hint}`);
    lines.push("");
    if (r.worth_capturing) {
      lines.push("→ 可以调 `council_capture_this({ conversation })` 摄入。");
    } else {
      lines.push(
        "→ 不建议 capture。如果用户明确要求, 可强制调 `council_capture_this({ conversation, force: true })`。",
      );
    }
    return {
      content: [{ type: "text" as const, text: lines.join("\n") }],
    };
  },
);

// ━━━ council_capture_this ━━━
server.registerTool(
  "council_capture_this",
  {
    description:
      "把当前对话捕获为 Council 的新 session, 并立即蒸馏出高光和潜在 persona。**默认会先调 should_capture 守门**, 不值得则跳过 (返回 reason)。如需绕过守门, 传 force=true (用户已明确要求时)。",
    inputSchema: {
      conversation: z
        .string()
        .describe(
          "完整对话文本, 建议 Claude.ai 导出格式或 Markdown, 区分 user / assistant 发言",
        ),
      title_hint: z.string().optional().describe("可选标题提示"),
      force: z
        .boolean()
        .optional()
        .describe(
          "跳过 should_capture 守门, 强制 capture。仅在用户明确要求时使用。",
        ),
    },
  },
  async ({ conversation, title_hint, force }) => {
    requireInit();

    // ━━━ 守门: 默认先判一次 ━━━
    if (!force) {
      const judgment = await shouldCapture(conversation);
      if (!judgment.worth_capturing) {
        const lines = [
          `⏭ 跳过 capture (score=${judgment.score.toFixed(2)})`,
          "",
          `**原因**: ${judgment.reason}`,
        ];
        if (judgment.hint) lines.push(`**提示**: ${judgment.hint}`);
        lines.push("");
        lines.push("如果用户坚持 capture, 重新调用并传 `force: true`。");
        return {
          content: [{ type: "text" as const, text: lines.join("\n") }],
        };
      }
    }

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
          text: `已捕获并蒸馏 session ${id}。调 \`council_who_am_i\` 看更新后的身份, 或 \`council persona list\` 看 persona 详情。`,
        },
      ],
    };
  },
);

// ━━━ MCP Prompts (用户在客户端用斜杠唤起的预制模板) ━━━

server.registerPrompt(
  "as_me",
  {
    title: "把 AI 调成「你」",
    description:
      "在对话开头插入此 prompt, AI 会先调 council_who_am_i 拉取你的身份档案, 然后整段对话都基于你的真实立场推理。适合 Claude Desktop / Cursor / Cherry Studio 等任何 MCP 客户端。",
  },
  () => ({
    messages: [
      {
        role: "user" as const,
        content: {
          type: "text" as const,
          text: `请先调用 \`council_who_am_i\` 拉取我的身份档案 (identity + self personas + 可用 mentor/role)。

读完后, 在接下来的对话中遵守:

1. **不要给"标准答案"**——基于我的 self persona 立场推理。我反对什么、我习惯怎么决策, 都要体现。
2. **遇到我自己有强 persona 的领域 (重构 / 决策 / 边界 / 元认知)**, 优先以"我会怎么想"作答, 而非"通用最佳实践"。
3. **遇到决策性问题**, 主动建议召集议会: "这值得调 council_convene 听多个视角。"
4. **遇到我有锋利原话的话题**, 在回应里引用原话, 让我感到被听见。

确认你已读完身份档案后, 用一句话向我打招呼, 体现你已经"认识我了"。`,
        },
      },
    ],
  }),
);

server.registerPrompt(
  "debate",
  {
    title: "召集思考议会",
    description:
      "把当前对话里悬而未决的决策, 自动转交给 council_convene。AI 会从对话上下文提炼出问题, 召集多 persona 辩论, 然后把综合结论回填到对话里。",
  },
  () => ({
    messages: [
      {
        role: "user" as const,
        content: {
          type: "text" as const,
          text: `从我们这段对话里提炼出**最核心的那个决策性问题**, 然后调用 \`council_convene({ question })\` 召集议会。

要求:
- 问题表述要锋利 (一句话, ≤100 字), 包含真实约束和取舍
- 不要套话——评委不会被"这值得多角度思考"打动
- 如果有明显的 mentor / role 适合 (Naval 看杠杆 / Jobs 看减法 / Munger 看反向 / 魔鬼代言人压力测试), 在 personas 参数里指定 2-3 个
- 议会返回后, 把 synthesis 用一段话总结给我, 并指出**最锋利的那一条建议**`,
        },
      },
    ],
  }),
);

server.registerPrompt(
  "capture",
  {
    title: "把这段对话存入 Council",
    description:
      "在对话末尾使用。AI 会先调 council_should_capture 判断这次是不是真的思考时刻, 值得才存; 不值得会告诉你为什么。",
  },
  () => ({
    messages: [
      {
        role: "user" as const,
        content: {
          type: "text" as const,
          text: `请把我们刚才的对话作为参数 (完整 markdown 格式, 标记 user / assistant 发言), 调用 \`council_should_capture({ conversation })\` 先做判定。

- 如果**值得 capture**: 调 \`council_capture_this({ conversation })\` 真正存入。完成后告诉我 capture 出了哪些新 highlight, 是否触发了已有 persona 的 refine 建议。
- 如果**不值得 capture**: 把判定 reason 转述给我, 让我学习什么样的对话才算"思考时刻"。**不要绕过守门强制 capture**, 除非我明确说"我坚持要存"。`,
        },
      },
    ],
  }),
);

// ━━━ 辅助函数 ━━━

function extractFirstQuote(body: string): string | null {
  // 从 persona body 的 "## 典型片段" 段落里抓第一条 > 引用
  const m = body.match(/##\s*典型片段[\s\S]*?(^>\s*"[^"\n]+")/m);
  if (m && m[1]) {
    const q = m[1].replace(/^>\s*/, "").replace(/^"|"$/g, "");
    return q.length > 120 ? q.slice(0, 120) + "..." : q;
  }
  return null;
}

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  process.stderr.write(`[council mcp] fatal: ${String(err)}\n`);
  process.exit(1);
});
