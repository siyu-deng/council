import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { paths, ensureDir } from "../core/paths.ts";
import { log, spinner, c } from "../core/logger.ts";
import {
  getSession,
  listSessions,
  markSessionDistilled,
  writeSkill,
  writePersona,
  type Session,
  type SkillFrontmatter,
  type PersonaFrontmatter,
} from "../core/skill-md.ts";
import {
  identifyHighlights,
  type Highlight,
  type HighlightType,
} from "../prompts/P1-identify-highlights.ts";
import { forgePersona } from "../prompts/P2-forge-persona.ts";
import { makeEmitter, newRunId } from "./events.ts";

export interface StoredHighlight {
  id: string;
  session_id: string;
  data: Highlight;
}

export interface DistilledState {
  highlights: Record<string, StoredHighlight>;
  sessions: Record<
    string,
    { highlight_ids: string[]; distilled_at: string }
  >;
  personas: Record<
    string,
    { source_highlights: string[]; forged_at: string; refined_at?: string }
  >;
}

export function readState(): DistilledState {
  ensureDir(paths.state());
  if (!existsSync(paths.distilledIndex()))
    return { highlights: {}, sessions: {}, personas: {} };
  try {
    const raw = JSON.parse(readFileSync(paths.distilledIndex(), "utf-8"));
    return {
      highlights: raw.highlights ?? {},
      sessions: raw.sessions ?? {},
      personas: raw.personas ?? {},
    };
  } catch {
    return { highlights: {}, sessions: {}, personas: {} };
  }
}

export function writeState(state: DistilledState): void {
  ensureDir(paths.state());
  writeFileSync(paths.distilledIndex(), JSON.stringify(state, null, 2), "utf-8");
}

function persistHighlight(
  state: DistilledState,
  sessionId: string,
  h: Highlight,
  index: number,
): StoredHighlight {
  const id = `${sessionId}-h${index + 1}`;
  const fm: SkillFrontmatter = {
    id,
    source_session: sessionId,
    type: h.type,
    title: h.title,
    confidence: h.confidence,
    created_at: new Date().toISOString().slice(0, 10),
  };
  const body = `# ${h.title}

## 用户原话
> ${h.user_quote}

## 为什么是用户自己的 (非 AI 灌输)
${h.why_non_trivial}

## 触发条件
${h.trigger}

## 底层信念
${h.underlying_belief}
`;
  writeSkill(fm, body);
  const stored: StoredHighlight = { id, session_id: sessionId, data: h };
  state.highlights[id] = stored;
  return stored;
}

export async function distillSession(
  session: Session,
): Promise<StoredHighlight[]> {
  const state = readState();
  if (state.sessions[session.frontmatter.id]) {
    log.muted(`  ↷ 跳过 ${session.frontmatter.id} (已蒸馏)`);
    return state.sessions[session.frontmatter.id].highlight_ids
      .map((id) => state.highlights[id])
      .filter(Boolean);
  }

  const sp = spinner(`识别高光 ${session.frontmatter.id}...`);
  let highlights: Highlight[] = [];
  try {
    highlights = await identifyHighlights(session.body, session.frontmatter.id);
  } catch (err) {
    sp.fail(`识别失败: ${String(err)}`);
    return [];
  }
  sp.succeed(`${session.frontmatter.id}: ${highlights.length} 个高光`);

  const stored = highlights.map((h, i) => persistHighlight(state, session.frontmatter.id, h, i));
  for (const s of stored) {
    log.muted(
      `    • [${s.data.type}] ${c.bold(s.data.title)} (${s.data.confidence.toFixed(2)})`,
    );
  }

  state.sessions[session.frontmatter.id] = {
    highlight_ids: stored.map((s) => s.id),
    distilled_at: new Date().toISOString(),
  };
  writeState(state);
  markSessionDistilled(session.frontmatter.id);
  return stored;
}

export async function forgePersonasFromAll(): Promise<string[]> {
  const state = readState();
  const all = Object.values(state.highlights);
  const byType = new Map<HighlightType, StoredHighlight[]>();
  for (const h of all) {
    if (!byType.has(h.data.type)) byType.set(h.data.type, []);
    byType.get(h.data.type)!.push(h);
  }

  const created: string[] = [];

  for (const [type, cluster] of byType) {
    if (cluster.length === 0) continue;
    const sourceIds = cluster.map((h) => h.id).sort();

    // —— 检测此 type 是否已有 self persona —— 推断方式: 看 persona 的 source_highlights[0] 的 type ——
    const existingForType = Object.entries(state.personas).find(([, v]) => {
      if (!v.source_highlights || v.source_highlights.length === 0) return false;
      const firstHl = state.highlights[v.source_highlights[0]];
      return firstHl?.data.type === type;
    });

    if (existingForType) {
      const [name, record] = existingForType;
      const existingIds = new Set(record.source_highlights);
      const newIds = sourceIds.filter((id) => !existingIds.has(id));
      if (newIds.length === 0) {
        log.muted(`  ↷ ${type}: 已有 persona (self:${name}), 无新 highlights`);
      } else {
        log.warn(
          `  ⚠️  ${type}: 已有 persona ${c.bold(`self:${name}`)}, 检测到 ${newIds.length} 个新 highlights`,
        );
        log.muted(`     跑 ${c.bold(`council refine self:${name}`)} 深化它, 而非 forge 重复`);
      }
      continue;
    }

    const sp = spinner(`蒸馏 persona [${type}] (${cluster.length} highlights)...`);
    try {
      const forged = await forgePersona(
        cluster.map((c) => c.data),
        Array.from(new Set(cluster.map((c) => c.session_id))),
      );

      const fm: PersonaFrontmatter = {
        name: forged.name,
        description: forged.description,
        type: "self",
        origin: "distilled",
        source_sessions: Array.from(new Set(cluster.map((c) => c.session_id))),
        confidence: forged.confidence,
      };

      const persona = writePersona("self", fm, forged.body, {
        draft: cluster.length < 2 || forged.confidence < 0.7,
      });

      state.personas[forged.name] = {
        source_highlights: sourceIds,
        forged_at: new Date().toISOString(),
      };
      sp.succeed(`persona: ${c.bold(persona.ref)} (${forged.confidence.toFixed(2)})`);
      created.push(persona.ref);
    } catch (err) {
      sp.fail(`蒸馏失败 [${type}]: ${String(err)}`);
    }
  }

  writeState(state);
  return created;
}

export async function distillAll(runId?: string): Promise<void> {
  const rid = runId ?? newRunId("distill");
  const E = makeEmitter(rid, "distill");
  E.runStarted();
  try {
    const sessions = listSessions().filter((s) => !s.frontmatter.distilled);
    if (sessions.length === 0) {
      log.muted("没有待蒸馏的 session");
      E.log("muted", "没有待蒸馏的 session");
    }
    for (const s of sessions) {
      E.phaseStarted("identify", { sessionId: s.frontmatter.id });
      const stored = await distillSession(s);
      for (const h of stored) {
        E.result("highlight", h);
      }
      E.phaseDone("identify", { sessionId: s.frontmatter.id, count: stored.length });
    }
    E.phaseStarted("forge");
    const created = await forgePersonasFromAll();
    for (const ref of created) E.result("persona", { ref });
    E.phaseDone("forge", { count: created.length });
    E.runDone({ personasCreated: created });
  } catch (err) {
    E.runFailed(String(err));
    throw err;
  }
}

export async function distillOne(
  sessionId: string,
  runId?: string,
): Promise<void> {
  const rid = runId ?? newRunId("distill", sessionId);
  const E = makeEmitter(rid, "distill");
  E.runStarted({ sessionId });
  try {
    const session = getSession(sessionId);
    E.phaseStarted("identify", { sessionId });
    const stored = await distillSession(session);
    for (const h of stored) E.result("highlight", h);
    E.phaseDone("identify", { sessionId, count: stored.length });

    E.phaseStarted("forge");
    const created = await forgePersonasFromAll();
    for (const ref of created) E.result("persona", { ref });
    E.phaseDone("forge", { count: created.length });
    E.runDone({ personasCreated: created });
  } catch (err) {
    E.runFailed(String(err));
    throw err;
  }
}

