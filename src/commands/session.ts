import { log, c } from "../core/logger.ts";
import { isInitialized } from "../core/paths.ts";
import { NotInitializedError, SessionNotFoundError } from "../core/errors.ts";
import {
  listSessions,
  getSession,
  listSkills,
  listPersonas,
} from "../core/skill-md.ts";
import { readState } from "../engine/distill.ts";

export async function sessionListCommand(): Promise<void> {
  if (!isInitialized()) throw new NotInitializedError();
  const sessions = listSessions();
  const state = readState();

  if (sessions.length === 0) {
    log.muted("尚未捕获任何 session");
    return;
  }

  log.heading(`已捕获 ${sessions.length} 个 session`);
  for (const s of sessions) {
    const fm = s.frontmatter;
    const hlCount = state.sessions[fm.id]?.highlight_ids.length ?? 0;
    const stat = fm.distilled ? c.gray(`${hlCount} highlights`) : c.dim("未蒸馏");
    log.plain(`  ${c.bold(fm.id)}`);
    log.muted(`    ${fm.title ?? "(无标题)"} · ${fm.source} · ${stat}`);
  }
}

export async function sessionShowCommand(id: string): Promise<void> {
  if (!isInitialized()) throw new NotInitializedError();
  let session;
  try {
    session = getSession(id);
  } catch {
    throw new SessionNotFoundError(id);
  }
  const state = readState();
  const fm = session.frontmatter;

  log.heading(fm.id);
  log.plain(`  title: ${fm.title ?? "(无)"}`);
  log.plain(`  captured: ${fm.captured_at}`);
  log.plain(`  source:   ${fm.source}`);
  log.plain(`  distilled: ${fm.distilled ? "✓" : "✗"}`);
  log.plain("");

  // 列出由该 session 产出的 highlights, 以及它们被并入哪个 persona
  const sessionRec = state.sessions[fm.id];
  if (sessionRec && sessionRec.highlight_ids.length > 0) {
    const skills = listSkills();
    const skillMap = new Map(skills.map((s) => [s.data.id, s]));
    const personas = listPersonas();
    // 反向索引: highlight_id → persona_ref
    const hlToPersona = new Map<string, string>();
    for (const [name, rec] of Object.entries(state.personas)) {
      for (const hid of rec.source_highlights) {
        hlToPersona.set(hid, `self:${name}`);
      }
    }

    log.section(`产出 ${sessionRec.highlight_ids.length} 个 highlight:`);
    for (const hid of sessionRec.highlight_ids) {
      const sk = skillMap.get(hid);
      if (!sk) {
        log.muted(`  ${hid} (找不到文件)`);
        continue;
      }
      const persona = hlToPersona.get(hid);
      const personaTag = persona ? c.gray(`→ ${persona}`) : c.dim("(未并入 persona)");
      log.plain(
        `  • ${c.bold(sk.data.title)} [${sk.data.type}] ${c.gray(`conf=${sk.data.confidence.toFixed(2)}`)} ${personaTag}`,
      );
    }
  }
  log.plain("");
  log.muted("──── 对话原文 (前 800 字) ────");
  log.plain(session.body.slice(0, 800) + (session.body.length > 800 ? "…" : ""));
}
