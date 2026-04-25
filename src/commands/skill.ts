import { log, c } from "../core/logger.ts";
import { isInitialized } from "../core/paths.ts";
import { NotInitializedError } from "../core/errors.ts";
import { listSkills, getSkill } from "../core/skill-md.ts";
import { readState } from "../engine/distill.ts";

export async function skillListCommand(opts: { type?: string } = {}): Promise<void> {
  if (!isInitialized()) throw new NotInitializedError();
  const all = listSkills();
  const filtered = opts.type ? all.filter((s) => s.data.type === opts.type) : all;

  if (filtered.length === 0) {
    log.dim(opts.type ? `没有 type=${opts.type} 的 skill` : "尚无 skill");
    return;
  }

  // 反向索引: highlight_id → persona_ref
  const state = readState();
  const hlToPersona = new Map<string, string>();
  for (const [name, rec] of Object.entries(state.personas)) {
    for (const hid of rec.source_highlights) {
      hlToPersona.set(hid, `self:${name}`);
    }
  }

  // 按 type 分组展示
  const byType = new Map<string, typeof filtered>();
  for (const s of filtered) {
    const arr = byType.get(s.data.type) ?? [];
    arr.push(s);
    byType.set(s.data.type, arr);
  }

  log.heading(`共 ${filtered.length} 个 skill (highlight)${opts.type ? ` [type=${opts.type}]` : ""}`);
  for (const [type, items] of byType) {
    log.section(`${type} (${items.length})`);
    items.sort((a, b) => b.data.confidence - a.data.confidence);
    for (const s of items) {
      const persona = hlToPersona.get(s.data.id);
      const personaTag = persona ? c.gray(`→ ${persona}`) : "";
      log.plain(
        `  • ${c.bold(s.data.title)} ${c.gray(`(conf=${s.data.confidence.toFixed(2)}, src=${s.data.source_session})`)} ${personaTag}`,
      );
    }
  }
}

export async function skillShowCommand(idOrSlug: string): Promise<void> {
  if (!isInitialized()) throw new NotInitializedError();
  // 先按 id 查, 再按 slug 查 (容错)
  let skill = getSkill(idOrSlug);
  if (!skill) {
    const all = listSkills();
    skill = all.find((s) => s.data.slug === idOrSlug || s.data.title === idOrSlug) ?? null;
  }
  if (!skill) {
    log.error(`找不到 skill: ${idOrSlug}`);
    return;
  }

  const fm = skill.data;
  log.heading(fm.title);
  log.plain(`  type: ${fm.type}`);
  log.plain(`  confidence: ${fm.confidence}`);
  log.plain(`  source: ${fm.source_session}`);
  log.plain(`  id: ${fm.id}`);
  if (fm.slug) log.plain(`  slug: ${fm.slug}`);
  if (fm.promoted_to_persona) log.plain(`  promoted_to: ${fm.promoted_to_persona}`);
  log.plain("");
  log.plain(skill.body);
}
