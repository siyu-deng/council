import readline from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { log, spinner, c } from "../core/logger.ts";
import { isInitialized } from "../core/paths.ts";
import { NotInitializedError } from "../core/errors.ts";
import {
  getPersona,
  listPersonas,
  writePersona,
  type Persona,
  type PersonaFrontmatter,
} from "../core/skill-md.ts";
import { refinePersona } from "../prompts/P9-refine-persona.ts";
import { readState, writeState, type StoredHighlight } from "../engine/distill.ts";
import type { HighlightType } from "../prompts/P1-identify-highlights.ts";

interface RefineOpts {
  yes?: boolean; // --yes 跳过交互, 自动采纳 reinforce/enrich (contradict 仍写 draft 不污染主文件)
}

export async function refineCommand(
  personaRef: string | undefined,
  opts: RefineOpts = {},
): Promise<void> {
  if (!isInitialized()) throw new NotInitializedError();

  const targets = await pickTargets(personaRef);
  if (targets.length === 0) {
    log.muted("没有可 refine 的 self persona");
    return;
  }

  let processed = 0;
  let applied = 0;
  let skipped = 0;
  let drafted = 0;

  for (const p of targets) {
    log.section(`refine ${p.ref}`);
    const result = await refineOne(p, opts);
    processed++;
    if (result === "applied") applied++;
    else if (result === "drafted") drafted++;
    else skipped++;
  }

  log.plain("");
  log.success(
    `refine 完毕: 处理 ${processed} 个, 采纳 ${applied}, 草稿 ${drafted}, 跳过 ${skipped}`,
  );
}

async function pickTargets(personaRef: string | undefined): Promise<Persona[]> {
  if (personaRef) {
    const p = getPersona(personaRef);
    if (p.frontmatter.type !== "self") {
      throw new Error(`refine 只支持 self persona (${p.ref} 是 ${p.frontmatter.type})`);
    }
    return [p];
  }
  // 不传 ref → 扫所有 active self persona
  return listPersonas().filter((p) => p.frontmatter.type === "self");
}

type RefineOutcome = "applied" | "drafted" | "skipped";

async function refineOne(persona: Persona, opts: RefineOpts): Promise<RefineOutcome> {
  const state = readState();
  const stored = state.personas[persona.frontmatter.name];
  if (!stored) {
    log.warn(
      `  ↷ 跳过: ${persona.ref} 不在 distilled.json (可能是 handcrafted, 不可 refine)`,
    );
    return "skipped";
  }

  const oldIds = new Set(stored.source_highlights);
  const oldHighlights = stored.source_highlights
    .map((id) => state.highlights[id])
    .filter((h): h is StoredHighlight => Boolean(h));

  if (oldHighlights.length === 0) {
    log.warn(`  ↷ 跳过: 找不到 ${persona.ref} 的源 highlights`);
    return "skipped";
  }

  // 推断该 persona 的主 type (P2 按 type 聚类, 应该全是同一种)
  const type = oldHighlights[0].data.type as HighlightType;

  // 找新 highlights: 同 type & 不在已有 source_highlights 内
  const candidates = Object.values(state.highlights).filter(
    (h) => h.data.type === type && !oldIds.has(h.id),
  );

  if (candidates.length === 0) {
    log.muted(`  ↷ 无新 highlights (type=${type}), 跳过`);
    return "skipped";
  }

  log.muted(`  发现 ${candidates.length} 个新 highlights (type=${type}):`);
  for (const cand of candidates) {
    log.muted(`    • ${cand.data.title} [${cand.session_id}] (${cand.data.confidence.toFixed(2)})`);
  }

  const sp = spinner(`  调用 P9 refine...`);
  let refined;
  try {
    refined = await refinePersona(
      persona,
      candidates.map((c) => c.data),
    );
  } catch (err) {
    sp.fail(`  refine 失败: ${String(err)}`);
    return "skipped";
  }
  sp.succeed(`  P9 判定: ${actionEmoji(refined.action)} ${c.bold(refined.action)}`);

  // —— 预览 ——
  log.plain("");
  log.plain(c.gray(`  rationale: ${refined.rationale}`));
  if (refined.conflict_note) {
    log.plain(c.gray(`  conflict_note: ${refined.conflict_note}`));
  }
  log.plain(
    c.gray(
      `  description: ${persona.frontmatter.description}  →  ${refined.new_description}`,
    ),
  );
  log.plain(
    c.gray(
      `  confidence:  ${(persona.frontmatter.confidence ?? 0).toFixed(2)}  →  ${refined.new_confidence.toFixed(2)}`,
    ),
  );
  log.plain("");
  log.plain(c.gray("=== new body ==="));
  log.plain(refined.new_body);
  log.plain(c.gray("================"));
  log.plain("");

  // —— 决策 ——
  const isContradict = refined.action === "contradict";
  const promptText = isContradict
    ? `  ⚠️ 检测到冲突, 默认写入 -draft.md 不覆盖原文件。继续? (y/N) > `
    : `  采纳并覆盖 ${persona.ref}? (y/N) > `;

  let ans = "y";
  if (!opts.yes || isContradict) {
    const rl = readline.createInterface({ input: stdin, output: stdout });
    ans = (await rl.question(promptText)).trim().toLowerCase();
    rl.close();
  }
  if (ans !== "y") {
    log.muted("  已取消");
    return "skipped";
  }

  // —— 写文件 ——
  const newSourceSessions = Array.from(
    new Set([
      ...(persona.frontmatter.source_sessions ?? []),
      ...candidates.map((c) => c.session_id),
    ]),
  );

  const fm: PersonaFrontmatter = {
    ...persona.frontmatter,
    description: refined.new_description,
    confidence: refined.new_confidence,
    version: (persona.frontmatter.version ?? 1) + 1,
    source_sessions: newSourceSessions,
  };

  if (isContradict) {
    writePersona("self", fm, refined.new_body, { draft: true });
    log.warn(`  📝 写入 ${persona.frontmatter.name}-draft.md (原文件未动)`);
    log.muted("  请手工 review, 决定要不要替换主文件");
    return "drafted";
  }

  writePersona("self", fm, refined.new_body);
  // 更新 state
  state.personas[persona.frontmatter.name] = {
    source_highlights: [...stored.source_highlights, ...candidates.map((c) => c.id)],
    forged_at: stored.forged_at,
    refined_at: new Date().toISOString(),
  };
  writeState(state);
  log.success(
    `  ✓ ${persona.ref} v${fm.version} (合并 ${candidates.length} 个新 highlight)`,
  );
  return "applied";
}

function actionEmoji(a: string): string {
  if (a === "reinforce") return "💪";
  if (a === "enrich") return "🌱";
  if (a === "contradict") return "⚡";
  return "•";
}
