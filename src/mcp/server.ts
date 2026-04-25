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
  listSessions,
  getSession,
  listSkills,
  getSkill,
  getTranscript,
  type SessionFrontmatter,
} from "../core/skill-md.ts";
import { distillOne } from "../engine/distill.ts";
import { convene } from "../engine/convene.ts";
import { streamStatement } from "../prompts/P4-statement.ts";
import { shouldCapture } from "../prompts/P10-should-capture.ts";
import { bootstrapIdentity } from "../prompts/P11-bootstrap-identity.ts";
import { refineCommand } from "../commands/refine.ts";
import { evolveCommand } from "../commands/evolve.ts";
import { isInitialized, paths } from "../core/paths.ts";
import { writeMd } from "../core/frontmatter.ts";
import { readState } from "../engine/distill.ts";

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
    version: "0.1.1",
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

// ━━━ council_list_sessions ━━━
server.registerTool(
  "council_list_sessions",
  {
    description:
      "列出所有已捕获的 session (按时间倒序), 每条含 id / title / 是否已蒸馏 / 产出的 highlight 数. Web 端做 session 列表渲染时调它.",
    inputSchema: {},
  },
  async () => {
    requireInit();
    const sessions = listSessions();
    const state = readState();
    if (sessions.length === 0) {
      return { content: [{ type: "text" as const, text: "尚未捕获任何 session." }] };
    }
    const rows = sessions.map((s) => {
      const fm = s.frontmatter;
      const hl = state.sessions[fm.id]?.highlight_ids.length ?? 0;
      return `- **${fm.id}** · ${fm.title ?? "(无标题)"} · ${fm.source} · ${fm.distilled ? `${hl} highlights` : "未蒸馏"}`;
    });
    return {
      content: [
        {
          type: "text" as const,
          text: `共 ${sessions.length} 个 session:\n\n${rows.join("\n")}`,
        },
      ],
    };
  },
);

// ━━━ council_get_session ━━━
server.registerTool(
  "council_get_session",
  {
    description:
      "查看一个 session 的完整内容 + 它产出的 highlights + 这些 highlights 加入了哪些 self persona. 用于追溯某个观点的来源 ('这个 self persona 是怎么来的?').",
    inputSchema: {
      id: z.string().describe("session id, 形如 2026-04-25-xxx"),
    },
  },
  async ({ id }) => {
    requireInit();
    let session;
    try {
      session = getSession(id);
    } catch {
      return {
        content: [{ type: "text" as const, text: `找不到 session: ${id}` }],
      };
    }
    const state = readState();
    const skills = listSkills();
    const skillMap = new Map(skills.map((s) => [s.data.id, s]));
    const hlToPersona = new Map<string, string>();
    for (const [name, rec] of Object.entries(state.personas)) {
      for (const hid of rec.source_highlights) {
        hlToPersona.set(hid, `self:${name}`);
      }
    }

    const lines = [
      `# Session ${id}`,
      "",
      `- **title**: ${session.frontmatter.title ?? "(无)"}`,
      `- **captured**: ${session.frontmatter.captured_at}`,
      `- **source**: ${session.frontmatter.source}`,
      `- **distilled**: ${session.frontmatter.distilled ? "✓" : "✗"}`,
      "",
    ];
    const sessionRec = state.sessions[id];
    if (sessionRec && sessionRec.highlight_ids.length > 0) {
      lines.push(`## 产出 ${sessionRec.highlight_ids.length} 个 highlight`);
      lines.push("");
      for (const hid of sessionRec.highlight_ids) {
        const sk = skillMap.get(hid);
        if (!sk) continue;
        const persona = hlToPersona.get(hid);
        const pTag = persona ? ` → ${persona}` : " (未并入 persona)";
        lines.push(
          `- **${sk.data.title}** [${sk.data.type}, conf=${sk.data.confidence.toFixed(2)}]${pTag}`,
        );
      }
      lines.push("");
    }
    lines.push("## 对话原文");
    lines.push("");
    lines.push(session.body);

    return {
      content: [{ type: "text" as const, text: lines.join("\n") }],
    };
  },
);

// ━━━ council_list_skills ━━━
server.registerTool(
  "council_list_skills",
  {
    description:
      "列出所有 skill (highlight). 可按 type 过滤 (problem-reframing / decision-heuristic / boundary-response / meta-insight). 每条含 title / source / 是否已加入 persona.",
    inputSchema: {
      type: z
        .string()
        .optional()
        .describe(
          "可选: problem-reframing / decision-heuristic / boundary-response / meta-insight",
        ),
    },
  },
  async ({ type }) => {
    requireInit();
    const all = listSkills();
    const filtered = type ? all.filter((s) => s.data.type === type) : all;
    if (filtered.length === 0) {
      return {
        content: [
          {
            type: "text" as const,
            text: type ? `没有 type=${type} 的 skill` : "尚无 skill",
          },
        ],
      };
    }
    const state = readState();
    const hlToPersona = new Map<string, string>();
    for (const [name, rec] of Object.entries(state.personas)) {
      for (const hid of rec.source_highlights) {
        hlToPersona.set(hid, `self:${name}`);
      }
    }
    const byType = new Map<string, typeof filtered>();
    for (const s of filtered) {
      const arr = byType.get(s.data.type) ?? [];
      arr.push(s);
      byType.set(s.data.type, arr);
    }
    const lines: string[] = [`共 ${filtered.length} 个 skill${type ? ` [type=${type}]` : ""}:`];
    for (const [t, items] of byType) {
      items.sort((a, b) => b.data.confidence - a.data.confidence);
      lines.push("");
      lines.push(`## ${t} (${items.length})`);
      for (const s of items) {
        const persona = hlToPersona.get(s.data.id);
        const pTag = persona ? ` → ${persona}` : "";
        lines.push(
          `- **${s.data.title}** (conf=${s.data.confidence.toFixed(2)}, src=${s.data.source_session})${pTag}`,
        );
      }
    }
    return {
      content: [{ type: "text" as const, text: lines.join("\n") }],
    };
  },
);

// ━━━ council_get_skill ━━━
server.registerTool(
  "council_get_skill",
  {
    description:
      "查看单个 skill (highlight) 的完整内容 (含原话引用、底层信念、why_non_trivial 等). 接受 id 或 slug.",
    inputSchema: {
      id_or_slug: z
        .string()
        .describe("skill 的 id (如 2026-04-25-xxx-h1) 或 slug (从 title 派生)"),
    },
  },
  async ({ id_or_slug }) => {
    requireInit();
    let s = getSkill(id_or_slug);
    if (!s) {
      const all = listSkills();
      s = all.find((x) => x.data.slug === id_or_slug) ?? null;
    }
    if (!s) {
      return {
        content: [{ type: "text" as const, text: `找不到 skill: ${id_or_slug}` }],
      };
    }
    const fm = s.data;
    const lines = [
      `# ${fm.title}`,
      "",
      `- **type**: ${fm.type}`,
      `- **confidence**: ${fm.confidence}`,
      `- **source**: ${fm.source_session}`,
      `- **id**: ${fm.id}`,
      `- **slug**: ${fm.slug ?? "(无)"}`,
    ];
    if (fm.promoted_to_persona) {
      lines.push(`- **promoted_to**: ${fm.promoted_to_persona}`);
    }
    lines.push("");
    lines.push(s.body);
    return {
      content: [{ type: "text" as const, text: lines.join("\n") }],
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

    // —— 检测 identity.md 是否仍是 seed 模板 (含 3+ 个 <...> 占位符即视为未填) ——
    const placeholderCount = (identity.match(/<[^<>]{3,80}>/g) ?? []).length;
    const isTemplate = !identity || placeholderCount >= 3;

    if (isTemplate) {
      lines.push("> _用户尚未填写 identity.md。以下是 Council 从已蒸馏 persona 现场归纳的身份摘要 (粗略)._");
      lines.push("");
      if (self.length > 0) {
        const top = [...self]
          .sort(
            (a, b) =>
              (b.frontmatter.confidence ?? 0) -
              (a.frontmatter.confidence ?? 0),
          )
          .slice(0, 3);
        lines.push(
          `这是一个**${top
            .map((p) => p.frontmatter.description.split(/[，,。;；]/)[0])
            .filter(Boolean)
            .join("；")}**类型的思考者。`,
        );
      } else {
        lines.push("(尚无 self persona, 也尚无 identity. Council 还不认识你.)");
      }
      lines.push("");
      lines.push(
        "💡 调 `council_bootstrap_identity` 可基于已有 persona + highlights 生成一份 identity.md 草稿。",
      );
      lines.push("");
    } else {
      lines.push(identity);
      lines.push("");
    }

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

// ━━━ council_bootstrap_identity ━━━
server.registerTool(
  "council_bootstrap_identity",
  {
    description:
      "基于现有的 self personas + 高光原话, 自动**反向回推**出一份 identity.md 草稿。适合用户尚未填写或想刷新身份档案的场景。默认不会覆盖已存在的真实身份, 需 force=true 才覆盖.",
    inputSchema: {
      force: z
        .boolean()
        .optional()
        .describe(
          "true 时覆盖已有 identity.md (含已填写过的). 默认 false: 仅在 identity.md 还是模板时写入.",
        ),
    },
  },
  async ({ force }) => {
    requireInit();
    const personas = listPersonas();
    const self = personas.filter((p) => p.frontmatter.type === "self");
    if (self.length === 0) {
      return {
        content: [
          {
            type: "text" as const,
            text: "无法 bootstrap: 还没有 self persona。请先 capture 一些对话并 distill, 再回头试。",
          },
        ],
      };
    }

    // 抓代表性 highlights (按 confidence 排, 每个 type 最多 3 条)
    const state = readState();
    const byType = new Map<string, Array<{ type: string; title: string; quote: string; confidence: number }>>();
    for (const h of Object.values(state.highlights)) {
      const arr = byType.get(h.data.type) ?? [];
      arr.push({
        type: h.data.type,
        title: h.data.title,
        quote: h.data.user_quote,
        confidence: h.data.confidence,
      });
      byType.set(h.data.type, arr);
    }
    const excerpts: Array<{ type: string; title: string; quote: string }> = [];
    for (const arr of byType.values()) {
      arr.sort((a, b) => b.confidence - a.confidence);
      excerpts.push(...arr.slice(0, 3));
    }

    // 检查现有 identity 是否模板
    const current = readIdentity().trim();
    const placeholderCount = (current.match(/<[^<>]{3,80}>/g) ?? []).length;
    const isTemplate = !current || placeholderCount >= 3;

    if (!isTemplate && !force) {
      return {
        content: [
          {
            type: "text" as const,
            text:
              "identity.md 已经是用户填好的真实内容, 默认不覆盖。如要重新生成草稿覆盖, 调用时传 `force: true`。",
          },
        ],
      };
    }

    // 调 LLM
    const result = await bootstrapIdentity(self, excerpts);

    // 写盘 (作为 draft - 如果没有 owner / created_at frontmatter, 加默认)
    const today = new Date().toISOString().slice(0, 10);
    const draftFrontmatter = { owner: "(自动生成, 待你确认)", created_at: today };
    writeMd(paths.identity(), draftFrontmatter, result.identity_md);

    return {
      content: [
        {
          type: "text" as const,
          text:
            `✓ 已写入 ~/.council/identity.md (基于 ${self.length} 个 self persona + ${excerpts.length} 条 highlight)。\n\n` +
            `**生成依据**: ${result.rationale}\n\n` +
            `---\n\n${result.identity_md}\n\n---\n\n` +
            `如有不准, 直接编辑文件; 或调 council_bootstrap_identity({ force: true }) 重生成。下次 council_who_am_i 会拉这份新身份。`,
        },
      ],
    };
  },
);

// ━━━ council_refine ━━━
server.registerTool(
  "council_refine",
  {
    description:
      "用累积的新 highlights 深化已有 self persona。不传 persona_ref 会扫所有 self persona 一次性 refine。LLM 模式下完全非交互: 自动采纳 reinforce/enrich (覆盖原文件 + 升 version), contradict 自动写为 -draft.md (不污染主文件). 返回每个 persona 的判定细节.",
    inputSchema: {
      persona_ref: z
        .string()
        .optional()
        .describe(
          "可选: 指定要 refine 的 persona ref (如 self:reframe-before-execute). 不传则全扫.",
        ),
    },
  },
  async ({ persona_ref }) => {
    requireInit();
    const result = await refineCommand(persona_ref, {
      yes: true,
      silent: true,
    });
    const lines: string[] = [];
    lines.push(
      `# Refine 完毕\n\n处理 ${result.processed} 个 persona: 采纳 ${result.applied}, 写 draft ${result.drafted}, 跳过 ${result.skipped}.`,
    );
    for (const d of result.details) {
      lines.push("");
      lines.push(`## ${d.persona} → ${d.outcome.toUpperCase()}`);
      if (d.action) lines.push(`- action: ${d.action}`);
      if (d.rationale) lines.push(`- rationale: ${d.rationale}`);
      if (d.skip_reason) lines.push(`- skip_reason: ${d.skip_reason}`);
      if (d.new_highlights !== undefined)
        lines.push(`- 吸收 ${d.new_highlights} 个新 highlight`);
      if (d.old_description && d.new_description) {
        lines.push(`- description: "${d.old_description}" → "${d.new_description}"`);
      }
      if (d.old_confidence !== undefined && d.new_confidence !== undefined) {
        lines.push(
          `- confidence: ${d.old_confidence.toFixed(2)} → ${d.new_confidence.toFixed(2)}`,
        );
      }
      if (d.conflict_note) lines.push(`- conflict: ${d.conflict_note}`);
    }
    return { content: [{ type: "text" as const, text: lines.join("\n") }] };
  },
);

// ━━━ council_evolve ━━━
server.registerTool(
  "council_evolve",
  {
    description:
      "扫描 persona 健康状况: (1) 把 score < 0.3 且收到 ≥3 次反馈的 persona 归档为 stale. (2) 检测高重叠的 self persona 提示合并. 返回总数 / 归档数 / 合并建议.",
    inputSchema: {},
  },
  async () => {
    requireInit();
    const result = await evolveCommand();
    const lines: string[] = [];
    lines.push(`# 进化扫描完毕`);
    lines.push("");
    lines.push(`- 总 persona: ${result.total_personas}`);
    lines.push(`- 归档为 stale: ${result.staled.length}`);
    lines.push(`- 合并建议: ${result.merge_suggestions.length}`);
    if (result.staled.length > 0) {
      lines.push("");
      lines.push("## Stale (已归档)");
      for (const s of result.staled) {
        lines.push(
          `- ${s.ref} (score=${s.score.toFixed(2)}, ${s.feedback_count} 反馈)`,
        );
      }
    }
    if (result.merge_suggestions.length > 0) {
      lines.push("");
      lines.push("## 合并建议");
      for (const m of result.merge_suggestions) {
        lines.push(
          `- ${m.a} + ${m.b} (overlap=${m.overlap.toFixed(2)}, ${m.reason})`,
        );
      }
      lines.push("");
      lines.push("→ 通过 CLI 合并: `council merge <a> <b>`");
    } else {
      lines.push("");
      lines.push("→ 没有明显重叠, 库很健康.");
    }
    return { content: [{ type: "text" as const, text: lines.join("\n") }] };
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
