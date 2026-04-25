import { log, c } from "../core/logger.ts";
import { isInitialized, paths, ensureDir } from "../core/paths.ts";
import { NotInitializedError } from "../core/errors.ts";
import { listPersonas, movePersonaTo, type Persona } from "../core/skill-md.ts";
import { writeMd } from "../core/frontmatter.ts";

const STALE_THRESHOLD = 0.3;
const MIN_FEEDBACK_FOR_STALE = 3;

export interface EvolveResult {
  total_personas: number;
  staled: Array<{ ref: string; score: number; feedback_count: number }>;
  merge_suggestions: Array<{ a: string; b: string; overlap: number; reason: string }>;
}

export async function evolveCommand(): Promise<EvolveResult> {
  if (!isInitialized()) throw new NotInitializedError();

  log.heading("扫描 persona 健康状况...");

  const personas = listPersonas();
  const staled: EvolveResult["staled"] = [];

  // ——— 1. Stale detection ———
  for (const p of personas) {
    if (p.frontmatter.type !== "self") continue;
    const fb = p.frontmatter.feedback_log ?? [];
    const score = p.frontmatter.score ?? 0;
    if (
      fb.length >= MIN_FEEDBACK_FOR_STALE &&
      score < STALE_THRESHOLD &&
      p.frontmatter.status !== "stale"
    ) {
      ensureDir(paths.personaStale());
      movePersonaTo(p, paths.personaStale());
      const fm = { ...p.frontmatter, status: "stale" as const };
      writeMd(
        `${paths.personaStale()}/${p.frontmatter.name}.md`,
        fm,
        p.body,
      );
      staled.push({ ref: p.ref, score, feedback_count: fb.length });
      log.warn(
        `  stale: ${c.bold(p.ref)} (score=${score.toFixed(2)}, ${fb.length} 反馈)`,
      );
    }
  }

  if (staled.length === 0) log.muted(`  所有 persona 健康, 无 stale`);

  // ——— 2. Merge suggestions (cheap: overlap by source_sessions) ———
  log.section("检测潜在合并...");
  const self = personas.filter((p) => p.frontmatter.type === "self");
  const suggestions: Array<{ a: Persona; b: Persona; overlap: number; reason: string }> = [];

  for (let i = 0; i < self.length; i++) {
    for (let j = i + 1; j < self.length; j++) {
      const a = self[i];
      const b = self[j];
      const ov = simpleOverlap(a, b);
      if (ov.score >= 0.5) {
        suggestions.push({ a, b, overlap: ov.score, reason: ov.reason });
      }
    }
  }

  if (suggestions.length === 0) {
    log.muted("  没有明显重叠");
  } else {
    for (const s of suggestions) {
      log.plain(
        `  ${c.yellow("⚠")} 可能合并: ${c.bold(s.a.ref)} + ${c.bold(s.b.ref)}`,
      );
      log.muted(`    overlap=${s.overlap.toFixed(2)}, reason: ${s.reason}`);
      log.muted(`    运行: council merge ${s.a.ref} ${s.b.ref}`);
    }
  }

  log.section("健康报告");
  log.plain(`  总 persona: ${personas.length}`);
  log.plain(`  归档为 stale: ${staled.length}`);
  log.plain(`  建议合并: ${suggestions.length}`);
  return {
    total_personas: personas.length,
    staled,
    merge_suggestions: suggestions.map((s) => ({
      a: s.a.ref,
      b: s.b.ref,
      overlap: s.overlap,
      reason: s.reason,
    })),
  };
}

function simpleOverlap(
  a: Persona,
  b: Persona,
): { score: number; reason: string } {
  const aSrc = new Set(a.frontmatter.source_sessions ?? []);
  const bSrc = new Set(b.frontmatter.source_sessions ?? []);
  const sharedSrc = [...aSrc].filter((x) => bSrc.has(x));
  const srcOverlap =
    aSrc.size + bSrc.size === 0
      ? 0
      : (2 * sharedSrc.length) / (aSrc.size + bSrc.size);

  // name/description word overlap as secondary signal
  const aWords = new Set(
    (a.frontmatter.name + " " + a.frontmatter.description)
      .toLowerCase()
      .split(/\s+|[,.，。、-]/)
      .filter(Boolean),
  );
  const bWords = new Set(
    (b.frontmatter.name + " " + b.frontmatter.description)
      .toLowerCase()
      .split(/\s+|[,.，。、-]/)
      .filter(Boolean),
  );
  const sharedWords = [...aWords].filter((x) => bWords.has(x) && x.length > 1);
  const wordOverlap =
    aWords.size + bWords.size === 0
      ? 0
      : (2 * sharedWords.length) / (aWords.size + bWords.size);

  // 仅当源重叠 AND 描述关键词也重叠才算真的相似
  // (同 session 蒸馏出的不同 highlight type 通常源全重叠但描述不一样)
  const score = srcOverlap > 0 && wordOverlap > 0.15 ? (srcOverlap + wordOverlap) / 2 : 0;
  const reasons: string[] = [];
  if (sharedSrc.length > 0)
    reasons.push(`共享 ${sharedSrc.length} 个 source session`);
  if (sharedWords.length > 2)
    reasons.push(`描述有 ${sharedWords.length} 个共同关键词`);
  return {
    score,
    reason: reasons.join("; ") || "弱相似",
  };
}
