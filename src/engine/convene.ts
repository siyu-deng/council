import { log, c } from "../core/logger.ts";
import { listPersonas, writeTranscript, getPersona, type Persona, type TranscriptFrontmatter } from "../core/skill-md.ts";
import { summonPersonas } from "../prompts/P3-summon.ts";
import { streamStatement } from "../prompts/P4-statement.ts";
import { streamCrossExam } from "../prompts/P5-cross-exam.ts";
import { streamSynthesis } from "../prompts/P6-synthesis.ts";
import { personaHeader, section, divider, synthesisBox, writeChunk } from "./render.ts";
import { loadConfig } from "../core/config.ts";

export interface ConveneOpts {
  with?: string;
  stream?: boolean;
}

export async function convene(
  question: string,
  opts: ConveneOpts,
): Promise<string> {
  const cfg = loadConfig();
  const allPersonas = listPersonas().filter(
    (p) => (p.frontmatter.status ?? "active") === "active",
  );

  if (allPersonas.length < cfg.convene.min_personas) {
    log.error(
      `可用 persona 数量 ${allPersonas.length} 少于最少要求 ${cfg.convene.min_personas}`,
    );
    log.muted("  先运行 `council init` 和 `council distill` 增加 persona");
    throw new Error("not enough personas");
  }

  // ——— 1. Summon ———
  let selected: Persona[];
  if (opts.with) {
    const refs = opts.with.split(",").map((s) => s.trim()).filter(Boolean);
    selected = refs.map((r) => getPersona(r));
  } else {
    log.section("召集议会...");
    const res = await summonPersonas(question, allPersonas);
    log.muted(`  rationale: ${res.rationale}`);
    selected = res.selected
      .map((ref) => {
        try {
          return getPersona(ref);
        } catch {
          return null;
        }
      })
      .filter((p): p is Persona => p !== null);

    // —— 多样性硬约束: ≥1 self + ≥1 mentor + ≥1 role (仅当库里确实存在该 type) ——
    if (cfg.convene.require_diversity) {
      const selectedSet = new Set(selected.map((p) => p.ref));
      const typesNeeded: Persona["frontmatter"]["type"][] = ["self", "mentor", "role"];
      for (const t of typesNeeded) {
        if (selected.some((p) => p.frontmatter.type === t)) continue;
        // devils-advocate 优先补 role, 其他按顺序挑第一个可用
        const preferred =
          t === "role"
            ? allPersonas.find(
                (p) =>
                  p.ref === "roles:devils-advocate" && !selectedSet.has(p.ref),
              )
            : undefined;
        const candidate =
          preferred ??
          allPersonas.find(
            (p) => p.frontmatter.type === t && !selectedSet.has(p.ref),
          );
        if (candidate) {
          selected.push(candidate);
          selectedSet.add(candidate.ref);
          log.muted(`  + 自动补位 ${candidate.ref} (多样性: 缺 ${t})`);
        }
      }
      // 超过 max_personas 时, 保留每个 type 至少 1 个, 从数量最多的 type 里砍末尾
      while (selected.length > cfg.convene.max_personas) {
        const counts = new Map<string, number>();
        for (const p of selected) {
          counts.set(p.frontmatter.type, (counts.get(p.frontmatter.type) ?? 0) + 1);
        }
        // 找一个数量 > 1 的 type, 从末尾砍一个
        const typeToShrink = [...counts.entries()]
          .filter(([, n]) => n > 1)
          .sort((a, b) => b[1] - a[1])[0]?.[0];
        if (!typeToShrink) break; // 每个 type 都只有 1 个, 停
        const lastIdx = selected
          .map((p, i) => (p.frontmatter.type === typeToShrink ? i : -1))
          .filter((i) => i !== -1)
          .pop()!;
        const dropped = selected.splice(lastIdx, 1)[0];
        log.muted(`  - 裁掉 ${dropped.ref} (超出 max_personas=${cfg.convene.max_personas})`);
      }
    }
  }

  if (selected.length === 0) {
    throw new Error("没有召集到任何 persona");
  }

  log.section(`议会成员 (${selected.length})`);
  for (const p of selected) log.plain(`  ${c.bold(p.ref)} — ${c.gray(p.frontmatter.description)}`);

  // ——— 2. Statements (并行 API, 完成后按 selected 顺序一次性渲染) ———
  log.heading("STATEMENTS — 独立表态 (并行)");

  async function drain(
    gen: AsyncGenerator<string>,
    onFail: (err: unknown) => string,
  ): Promise<string> {
    let buf = "";
    try {
      for await (const chunk of gen) buf += chunk;
    } catch (err) {
      return onFail(err);
    }
    return buf;
  }

  const statementPromises = selected.map((persona) =>
    drain(
      streamStatement(question, persona),
      (err) => `(表态失败: ${String(err)})`,
    ).then((text) => ({ ref: persona.ref, statement: text, persona })),
  );

  const statementResults: Array<{ ref: string; statement: string }> =
    await Promise.all(statementPromises).then((rs) => {
      for (const r of rs) {
        writeChunk(personaHeader(r.persona) + "\n");
        writeChunk(r.statement + "\n");
      }
      return rs.map((r) => ({ ref: r.ref, statement: r.statement }));
    });

  // ——— 3. Cross-Examination (并行, 每个 persona 都看其他人的完整 statement) ———
  log.heading("CROSS-EXAMINATION — 互相质疑 (并行)");

  const crossCandidates = selected.filter(
    (p) => statementResults.filter((s) => s.ref !== p.ref).length > 0,
  );
  const crossPromises = crossCandidates.map((persona) => {
    const others = statementResults.filter((s) => s.ref !== persona.ref);
    return drain(
      streamCrossExam(question, persona, others),
      (err) => `(质疑失败: ${String(err)})`,
    ).then((text) => ({ ref: persona.ref, critique: text, persona }));
  });

  const crossResults: Array<{ ref: string; critique: string }> =
    await Promise.all(crossPromises).then((rs) => {
      for (const r of rs) {
        writeChunk(personaHeader(r.persona) + "\n");
        writeChunk(r.critique + "\n");
      }
      return rs.map((r) => ({ ref: r.ref, critique: r.critique }));
    });

  // ——— 4. Synthesis ———
  log.heading("SYNTHESIS — 综合判断");

  let synthesisBuf = "";
  try {
    for await (const chunk of streamSynthesis(question, statementResults, crossResults)) {
      writeChunk(chunk);
      synthesisBuf += chunk;
    }
  } catch (err) {
    writeChunk(c.red(`\n[综合失败: ${String(err)}]`));
    synthesisBuf = "(失败)";
  }
  writeChunk("\n");

  // ——— 5. Write transcript ———
  const date = new Date().toISOString().slice(0, 10);
  const slug = slugifyQuestion(question);
  const id = `${date}-${slug}`;

  const body = renderTranscriptBody(
    question,
    selected,
    statementResults,
    crossResults,
    synthesisBuf,
  );

  const fm: TranscriptFrontmatter = {
    id,
    question,
    convened_at: new Date().toISOString(),
    personas: selected.map((p) => p.ref),
  };

  const filePath = writeTranscript(fm, body);
  log.success(`\n议会完毕。transcript: ${filePath}`);
  log.muted(`  反馈: council feedback ${id}`);
  return id;
}

function renderTranscriptBody(
  question: string,
  personas: Persona[],
  statements: { ref: string; statement: string }[],
  crossExams: { ref: string; critique: string }[],
  synthesis: string,
): string {
  const lines: string[] = [];
  lines.push(`# ${question}\n`);
  lines.push("## Statements\n");
  for (const s of statements) {
    lines.push(`### ${s.ref}\n\n${s.statement}\n`);
  }
  lines.push("## Cross-Examination\n");
  for (const c of crossExams) {
    lines.push(`### ${c.ref}\n\n${c.critique}\n`);
  }
  lines.push("## Synthesis\n");
  lines.push(synthesis + "\n");
  return lines.join("\n");
}

function slugifyQuestion(q: string): string {
  return (
    q
      .toLowerCase()
      .replace(/[^\w\u4e00-\u9fa5-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 30) || "question"
  );
}
