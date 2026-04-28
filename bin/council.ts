#!/usr/bin/env node
import { loadDotEnv } from "../src/core/env.ts";
loadDotEnv();

import { Command } from "commander";
import { log } from "../src/core/logger.ts";
import { CouncilError } from "../src/core/errors.ts";

import { initCommand } from "../src/commands/init.ts";
import { captureCommand } from "../src/commands/capture.ts";
import { distillCommand } from "../src/commands/distill.ts";
import { personaCommand } from "../src/commands/persona.ts";
import { conveneCommand } from "../src/commands/convene.ts";
import { feedbackCommand } from "../src/commands/feedback.ts";
import { evolveCommand } from "../src/commands/evolve.ts";
import { mergeCommand } from "../src/commands/merge.ts";
import { refineCommand } from "../src/commands/refine.ts";
import { sessionListCommand, sessionShowCommand } from "../src/commands/session.ts";
import { skillListCommand, skillShowCommand } from "../src/commands/skill.ts";
import { statusCommand } from "../src/commands/status.ts";
import { doctorCommand } from "../src/commands/doctor.ts";
import { exportCommand } from "../src/commands/export.ts";
import { serveCommand } from "../src/commands/serve.ts";

const program = new Command();

program
  .name("council")
  .description("你的思考议会。捕获对话, 蒸馏思维, 召集多 persona 辩论。")
  .version("0.4.1");

// ━━━ init ━━━
program
  .command("init")
  .description("初始化 ~/.council/ 目录")
  .option("-f, --force", "覆盖已有初始化")
  .action(async (opts) => {
    await initCommand(opts);
  });

// ━━━ status ━━━
program
  .command("status")
  .description("一眼看清: 已 capture 多少 session / 蒸出多少 persona / 跑过多少议会")
  .action(async () => {
    await statusCommand();
  });

// ━━━ doctor ━━━
program
  .command("doctor")
  .description("体检: 检查 ~/.council 完整性 + ANTHROPIC_API_KEY + LLM 连通性")
  .action(async () => {
    await doctorCommand();
  });

// ━━━ capture ━━━
program
  .command("capture")
  .description("捕获一段对话 (stdin / --file / --clipboard)")
  .option("-f, --file <path>", "从文件读取")
  .option("-c, --clipboard", "从剪贴板读取")
  .option("-t, --title <title>", "指定标题 (否则 LLM 生成)")
  .action(async (opts) => {
    await captureCommand(opts);
  });

// ━━━ distill ━━━
program
  .command("distill [sessionId]")
  .description("把 session 蒸馏为 thinking skills + personas")
  .option("-a, --auto", "自动处理所有未蒸馏的 session")
  .action(async (sessionId, opts) => {
    await distillCommand(sessionId, opts);
  });

// ━━━ persona ━━━
const persona = program.command("persona").description("persona 管理");
persona
  .command("list")
  .description("列出所有 persona")
  .action(async () => {
    await personaCommand({ action: "list" });
  });
persona
  .command("add <pathOrUrl>")
  .description("导入一个 SKILL.md 作为 mentor persona")
  .action(async (pathOrUrl) => {
    await personaCommand({ action: "add", pathOrUrl });
  });

// ━━━ convene ━━━
program
  .command("convene <question...>")
  .description('召开议会。示例: council convene "我要不要离职"')
  .option(
    "-w, --with <personas>",
    '逗号分隔, 如 "mentors:naval,self:first-principles"',
  )
  .option(
    "--watch",
    "打开网页圆桌直播 (启动本地 live server + 浏览器自动打开)",
  )
  .option("--no-structured", "关闭结构化 synthesis, 走流式 Markdown 回退")
  .option("--no-stream", "关闭流式输出 (debug)")
  .action(async (questionWords, opts) => {
    const question = (questionWords as string[]).join(" ");
    await conveneCommand(question, opts);
  });

// ━━━ live (standalone live server, 不发起议会) ━━━
program
  .command("live")
  .description("仅启动 Council Live Server (端口 3737), 不发起议会")
  .option("-p, --port <n>", "端口 (默认 3737)", (v) => parseInt(v, 10))
  .action(async (opts) => {
    // v0.3 起 live server 跑在纯 Node (node:http + ws), 任何 Node 环境直接跑
    const { startLiveServer } = await import("../src/server/live.ts");
    startLiveServer({ port: opts.port });
    log.muted("  按 Ctrl+C 结束");
    // keep alive
    process.stdin.resume();
  });

// ━━━ feedback / evolve / merge ━━━
program
  .command("feedback <transcriptId>")
  .description("对某次议会的每个 persona 打分 (helpful/generic/off-target)")
  .action(async (id) => {
    await feedbackCommand(id);
  });

program
  .command("evolve")
  .description("扫全库, 标记 stale persona, 建议 merge")
  .action(async () => {
    await evolveCommand();
  });

program
  .command("merge <a> <b>")
  .description("融合两个 persona 为一个")
  .action(async (a, b) => {
    await mergeCommand(a, b);
  });

program
  .command("refine [personaRef]")
  .description("用新 highlights 深化已有 self persona (不传 ref 则扫所有 self)")
  .option("-y, --yes", "自动采纳 reinforce/enrich (contradict 仍写 draft 不污染主文件)")
  .action(async (personaRef, opts) => {
    await refineCommand(personaRef, opts);
  });

// ━━━ session ━━━
const session = program.command("session").description("session 管理 (摄入的对话)");
session
  .command("list")
  .description("列出所有 session")
  .action(async () => {
    await sessionListCommand();
  });
session
  .command("show <id>")
  .description("查看某个 session 详情 (含产出的 highlights + 加入的 personas)")
  .action(async (id) => {
    await sessionShowCommand(id);
  });

// ━━━ skill ━━━
const skill = program.command("skill").description("skill 管理 (蒸馏出的 highlights)");
skill
  .command("list")
  .description("列出所有 skill, 按 type 分组")
  .option("-t, --type <type>", "只列某个 type (problem-reframing/decision-heuristic/...)")
  .action(async (opts) => {
    await skillListCommand(opts);
  });
skill
  .command("show <idOrSlug>")
  .description("查看某个 skill 详情 (id / slug / title 都行)")
  .action(async (id) => {
    await skillShowCommand(id);
  });

// ━━━ export / serve ━━━
program
  .command("export")
  .description("导出为 MCP Server / Claude Skills / Cursor Rules")
  .option("--mcp", "导出为 MCP Server")
  .action(async (opts) => {
    await exportCommand(opts);
  });

program
  .command("serve")
  .description("启动 MCP Server (stdio transport)")
  .action(async () => {
    await serveCommand();
  });

program.parseAsync(process.argv).catch((err: unknown) => {
  if (err instanceof CouncilError) {
    log.error(err.message);
    if (err.hint) log.muted(`  → ${err.hint}`);
    process.exit(1);
  }
  log.error(err instanceof Error ? err.message : String(err));
  if (process.env.COUNCIL_DEBUG) console.error(err);
  process.exit(1);
});
