/**
 * council doctor — 体检命令
 *
 * 对当前 Council 安装做一次全面健康检查:
 *   1. ~/.council 目录是否就绪
 *   2. identity.md 是否手写过 (还是模板)
 *   3. Persona 库构成 (self / mentor / role 各几个)
 *   4. ANTHROPIC_API_KEY 是否配
 *   5. LLM 连通性 (跑一个 10-token 的最小 ping, 验证 Key 能用)
 *   6. 数据资产规模 (sessions / skills / transcripts)
 *   7. MCP 接入提示 (告诉用户 sampling 模式存在)
 *
 * 设计哲学: 一眼看清 "我能不能用 Council", 而不是堆参数. 红的修, 黄的看,
 * 绿的不管. 跟 docker doctor / brew doctor 一脉相承.
 */

import { log, c } from "../core/logger.ts";
import { paths, councilRoot, isInitialized } from "../core/paths.ts";
import {
  listPersonas,
  listSessions,
  listSkills,
  listTranscripts,
  readIdentity,
} from "../core/skill-md.ts";
import { callText, MODELS } from "../core/claude.ts";

type Status = "ok" | "warn" | "err";

interface Check {
  name: string;
  status: Status;
  detail: string;
  hint?: string;
}

const ICON: Record<Status, string> = {
  ok: c.green("✓"),
  warn: c.yellow("!"),
  err: c.red("✗"),
};

export async function doctorCommand(): Promise<void> {
  log.heading(`Council Doctor  ${c.gray(`(${councilRoot()})`)}`);
  log.plain("");

  const checks: Check[] = [];

  // ━ 1. ~/.council 初始化 ━
  if (isInitialized()) {
    checks.push({
      name: "~/.council 已初始化",
      status: "ok",
      detail: paths.root(),
    });
  } else {
    checks.push({
      name: "~/.council 未初始化",
      status: "err",
      detail: "Council 还没开张",
      hint: "council init",
    });
    // 没初始化, 后续检查跳过
    renderChecks(checks);
    return;
  }

  // ━ 2. identity.md ━
  const identity = readIdentity().trim();
  const placeholderCount = (identity.match(/<[^<>]{3,80}>/g) ?? []).length;
  const isTemplate = !identity || placeholderCount >= 3;
  if (!isTemplate) {
    checks.push({
      name: "identity.md 已手写",
      status: "ok",
      detail: `${identity.length} 字`,
    });
  } else {
    checks.push({
      name: "identity.md 还是模板",
      status: "warn",
      detail: `${placeholderCount} 个 <占位符> 待填`,
      hint: "手填 ~/.council/identity.md, 或在 MCP 里调 council_bootstrap_identity",
    });
  }

  // ━ 3. Persona 库 ━
  const personas = listPersonas();
  const counts = { self: 0, mentor: 0, role: 0 };
  for (const p of personas) counts[p.frontmatter.type]++;
  if (personas.length === 0) {
    checks.push({
      name: "Persona 库为空",
      status: "err",
      detail: "议会一个人都没有",
      hint: "council init --force (重置 + 装预置 mentor/role)",
    });
  } else {
    checks.push({
      name: "Persona 库",
      status: counts.self === 0 ? "warn" : "ok",
      detail: `${personas.length} 个 (self=${counts.self}, mentor=${counts.mentor}, role=${counts.role})`,
      hint:
        counts.self === 0
          ? "尚无 self persona — capture 一些对话再 distill 让议会真正属于你"
          : undefined,
    });
  }

  // ━ 4. ANTHROPIC_API_KEY ━
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (apiKey) {
    const masked = `${apiKey.slice(0, 12)}...${apiKey.slice(-4)}`;
    checks.push({
      name: "ANTHROPIC_API_KEY",
      status: "ok",
      detail: `已配 (${masked})`,
    });
  } else {
    checks.push({
      name: "ANTHROPIC_API_KEY",
      status: "warn",
      detail: "未配",
      hint:
        "CLI / council live 模式不可用. 在 Claude Code/Desktop/Cursor 里调用 council 时, " +
        "Council 会自动用 sampling 模式借宿主 LLM (无需 Key).",
    });
  }

  // ━ 5. LLM 连通 (跑一个 10-token 最小 ping, ~1-2 秒) ━
  if (apiKey) {
    try {
      const start = Date.now();
      const reply = await callText("Reply with just the word: ok", {
        model: MODELS.haiku,
        maxTokens: 10,
        temperature: 0,
        label: "doctor-ping",
      });
      const elapsed = Date.now() - start;
      const trimmed = reply.trim().toLowerCase();
      if (trimmed.includes("ok")) {
        checks.push({
          name: "LLM 连通",
          status: "ok",
          detail: `Anthropic API 可达 · ${elapsed}ms · model=${MODELS.haiku}`,
        });
      } else {
        checks.push({
          name: "LLM 响应异常",
          status: "warn",
          detail: `API 可达但回复非 'ok': "${reply.slice(0, 30)}..."`,
        });
      }
    } catch (err) {
      checks.push({
        name: "LLM 调用失败",
        status: "err",
        detail: err instanceof Error ? err.message : String(err),
        hint: "检查 API Key 是否有效, 或 https://status.anthropic.com",
      });
    }
  } else {
    checks.push({
      name: "LLM 连通 (跳过)",
      status: "warn",
      detail: "无 API Key, 跳过. MCP sampling 模式只能在真实客户端里测.",
    });
  }

  // ━ 6. 数据资产 ━
  const sessions = listSessions().length;
  const skills = listSkills().length;
  const transcripts = listTranscripts().length;
  checks.push({
    name: "数据资产",
    status: "ok",
    detail: `${sessions} sessions · ${skills} highlights · ${transcripts} transcripts`,
  });

  // ━ 输出 ━
  renderChecks(checks);

  // ━ 总结 + MCP 提示 ━
  const errs = checks.filter((c) => c.status === "err").length;
  const warns = checks.filter((c) => c.status === "warn").length;
  log.plain("");
  if (errs === 0 && warns === 0) {
    log.plain(`  ${c.green("全绿. 议会随时可开.")}`);
  } else if (errs === 0) {
    log.plain(`  ${c.yellow(`${warns} 个 warning`)}, 不影响主链路, 看上面 hint 自行决定.`);
  } else {
    log.plain(`  ${c.red(`${errs} 个错误`)}, 修完再用. ${warns} 个 warning.`);
  }

  // MCP 接入提示 (只在用户没配 Key 时强调一下)
  if (!apiKey) {
    log.plain("");
    log.muted("  💡 想零配置体验 Council? 在 Claude Code 里:");
    log.muted("     claude mcp add council -- npx -y @moyu-build/council@latest serve");
  }
}

function renderChecks(checks: Check[]): void {
  for (const ch of checks) {
    log.plain(`  ${ICON[ch.status]} ${c.bold(ch.name)}`);
    log.muted(`     ${ch.detail}`);
    if (ch.hint) {
      log.muted(`     → ${ch.hint}`);
    }
  }
}
