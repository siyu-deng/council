import { readdirSync, existsSync, statSync } from "node:fs";
import { log, c } from "../core/logger.ts";
import { paths, isInitialized, councilRoot } from "../core/paths.ts";
import { NotInitializedError } from "../core/errors.ts";
import { listPersonas, listSessions, listTranscripts } from "../core/skill-md.ts";
import { readState } from "../engine/distill.ts";

export async function statusCommand(): Promise<void> {
  if (!isInitialized()) throw new NotInitializedError();

  const sessions = listSessions();
  const transcripts = listTranscripts();
  const personas = listPersonas();
  const state = readState();
  const skillCount = countMd(paths.skills());
  const mergedCount = countMd(paths.personaMerged());

  const byType = new Map<string, number>();
  for (const p of personas) {
    const t = p.frontmatter.type;
    byType.set(t, (byType.get(t) ?? 0) + 1);
  }

  // refined personas: source_highlights 数 > forge 时, 即 refined_at 存在
  const refined = Object.values(state.personas).filter((r) => r.refined_at).length;

  // —— 输出 ——
  log.heading(`Council 状态  ${c.gray(`(${councilRoot()})`)}`);
  log.plain("");

  log.section("📥 摄入");
  bar("session 已捕获", sessions.length);
  bar("highlight 已蒸馏", skillCount);
  if (sessions.length > 0) {
    const last = sessions[0];
    log.muted(`  最近: ${last.frontmatter.title ?? last.frontmatter.id}`);
  }

  log.section("👥 议会成员");
  bar("self  (你的人格)", byType.get("self") ?? 0);
  bar("mentor (导师)",   byType.get("mentor") ?? 0);
  bar("role  (角色)",    byType.get("role") ?? 0);
  if (refined > 0) {
    log.muted(`  其中 ${c.bold(String(refined))} 个 self persona 已 refine 过 (链路 C 复利证据)`);
  }
  if (mergedCount > 0) {
    log.muted(`  归档 _merged/: ${mergedCount} 个 (重复合并历史)`);
  }

  log.section("🏛️ 议会");
  bar("transcript", transcripts.length);
  if (transcripts.length > 0) {
    const last = transcripts[0];
    log.muted(`  最近问题: ${truncate(last.data.question, 50)}`);
    log.muted(`  参与: ${last.data.personas.join(", ")}`);
  }

  log.plain("");
  if (sessions.length === 0) {
    log.muted("→ 下一步: council capture --file <你的对话.md>");
  } else if (skillCount === 0 || (byType.get("self") ?? 0) === 0) {
    log.muted("→ 下一步: council distill --auto");
  } else if (transcripts.length === 0) {
    log.muted("→ 下一步: council convene \"<你的问题>\"");
  } else {
    log.muted("→ 试试: council refine  /  council convene \"<新问题>\"  /  council export --mcp");
  }
}

function countMd(dir: string): number {
  if (!existsSync(dir)) return 0;
  try {
    return readdirSync(dir).filter((f) => f.endsWith(".md")).length;
  } catch {
    return 0;
  }
}

function bar(label: string, n: number): void {
  const blocks = "█".repeat(Math.min(n, 20));
  const num = c.bold(String(n).padStart(3));
  log.plain(`  ${num}  ${c.gray(blocks.padEnd(20))}  ${label}`);
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 1) + "…";
}
