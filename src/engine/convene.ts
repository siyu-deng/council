import { log, c } from "../core/logger.ts";
import {
  listPersonas,
  writeTranscript,
  getPersona,
  type Persona,
  type TranscriptFrontmatter,
} from "../core/skill-md.ts";
import { summonPersonas } from "../prompts/P3-summon.ts";
import { streamStatement } from "../prompts/P4-statement.ts";
import { streamCrossExam } from "../prompts/P5-cross-exam.ts";
import { streamSynthesis, synthesizeJSON } from "../prompts/P6-synthesis.ts";
import { personaHeader, writeChunk } from "./render.ts";
import { loadConfig } from "../core/config.ts";
import {
  makeEmitter,
  newRunId,
  type PersonaMeta,
  type SynthesisJSON,
} from "./events.ts";
import { defaultAvatarFor, defaultColorFor } from "./persona-visual.ts";

export interface ConveneOpts {
  with?: string;
  stream?: boolean;
  /** 外部传入的 run_id — 网页发起议会时用, 保证 URL 可预测 */
  runId?: string;
  /** 是否用结构化 synthesis (JSON 输出). 默认 true — 网页决议卡需要 */
  structuredSynthesis?: boolean;
}

function personaMeta(p: Persona): PersonaMeta {
  return {
    ref: p.ref,
    type: p.frontmatter.type,
    description: p.frontmatter.description,
    avatar: (p.frontmatter as any).avatar ?? defaultAvatarFor(p),
    color: (p.frontmatter as any).color ?? defaultColorFor(p),
    confidence: p.frontmatter.confidence,
  };
}

export async function convene(
  question: string,
  opts: ConveneOpts,
): Promise<string> {
  const cfg = loadConfig();
  const runId = opts.runId ?? newRunId("convene", slugifyQuestion(question));
  const E = makeEmitter(runId, "convene");
  E.runStarted({ question });

  const allPersonas = listPersonas().filter(
    (p) => (p.frontmatter.status ?? "active") === "active",
  );

  if (allPersonas.length < cfg.convene.min_personas) {
    const msg = `可用 persona 数量 ${allPersonas.length} 少于最少要求 ${cfg.convene.min_personas}`;
    log.error(msg);
    log.muted("  先运行 `council init` 和 `council distill` 增加 persona");
    E.runFailed(msg);
    throw new Error("not enough personas");
  }

  // ——— 1. Summon ———
  E.phaseStarted("summon");
  let selected: Persona[];
  let summonRationale: string | null = null;
  const diversityLog: string[] = [];
  if (opts.with) {
    const refs = opts.with.split(",").map((s) => s.trim()).filter(Boolean);
    selected = refs.map((r) => getPersona(r));
    summonRationale = `user-specified via --with: ${refs.join(", ")}`;
    E.summonDone(selected.map(personaMeta), "user-specified via --with");
  } else {
    log.section("召集议会...");
    const res = await summonPersonas(question, allPersonas);
    summonRationale = res.rationale;
    log.muted(`  rationale: ${res.rationale}`);
    E.log("muted", `rationale: ${res.rationale}`);
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
      const typesNeeded: Persona["frontmatter"]["type"][] = [
        "self",
        "mentor",
        "role",
      ];
      for (const t of typesNeeded) {
        if (selected.some((p) => p.frontmatter.type === t)) continue;
        const preferred =
          t === "role"
            ? allPersonas.find(
                (p) =>
                  p.ref === "roles:devils-advocate" &&
                  !selectedSet.has(p.ref),
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
          const line = `+ 自动补位 ${candidate.ref} (多样性: 缺 ${t})`;
          diversityLog.push(line);
          log.muted(`  ${line}`);
          E.log("muted", line);
        }
      }
      // 超过 max_personas 时, 保留每个 type 至少 1 个, 从数量最多的 type 里砍末尾
      while (selected.length > cfg.convene.max_personas) {
        const counts = new Map<string, number>();
        for (const p of selected) {
          counts.set(
            p.frontmatter.type,
            (counts.get(p.frontmatter.type) ?? 0) + 1,
          );
        }
        const typeToShrink = [...counts.entries()]
          .filter(([, n]) => n > 1)
          .sort((a, b) => b[1] - a[1])[0]?.[0];
        if (!typeToShrink) break;
        const lastIdx = selected
          .map((p, i) => (p.frontmatter.type === typeToShrink ? i : -1))
          .filter((i) => i !== -1)
          .pop()!;
        const dropped = selected.splice(lastIdx, 1)[0];
        const line = `- 裁掉 ${dropped.ref} (超出 max_personas=${cfg.convene.max_personas})`;
        diversityLog.push(line);
        log.muted(`  ${line}`);
        E.log("muted", line);
      }
    }
    E.summonDone(selected.map(personaMeta), res.rationale);
  }

  if (selected.length === 0) {
    E.runFailed("没有召集到任何 persona");
    throw new Error("没有召集到任何 persona");
  }

  log.section(`议会成员 (${selected.length})`);
  for (const p of selected)
    log.plain(`  ${c.bold(p.ref)} — ${c.gray(p.frontmatter.description)}`);
  E.phaseDone("summon");

  // ——— 2. Statements (并行 API, 完成后按 selected 顺序一次性渲染) ———
  log.heading("STATEMENTS — 独立表态 (并行)");
  E.phaseStarted("statement", { parallel: selected.length });

  async function drainWithEvents(
    gen: AsyncGenerator<string>,
    phase: string,
    personaRef: string,
    onFail: (err: unknown) => string,
  ): Promise<string> {
    let buf = "";
    try {
      for await (const chunk of gen) {
        buf += chunk;
        E.chunk(phase, chunk, personaRef);
      }
    } catch (err) {
      const failText = onFail(err);
      E.chunk(phase, failText, personaRef);
      return failText;
    }
    return buf;
  }

  const statementPromises = selected.map((persona) =>
    drainWithEvents(
      streamStatement(question, persona),
      "statement",
      persona.ref,
      (err) => `(表态失败: ${String(err)})`,
    ).then((text) => {
      E.itemDone("statement", persona.ref, { ref: persona.ref, text });
      return { ref: persona.ref, statement: text, persona };
    }),
  );

  const statementResults: Array<{ ref: string; statement: string }> =
    await Promise.all(statementPromises).then((rs) => {
      for (const r of rs) {
        writeChunk(personaHeader(r.persona) + "\n");
        writeChunk(r.statement + "\n");
      }
      return rs.map((r) => ({ ref: r.ref, statement: r.statement }));
    });
  E.phaseDone("statement");

  // ——— 3. Cross-Examination (并行) ———
  log.heading("CROSS-EXAMINATION — 互相质疑 (并行)");
  E.phaseStarted("cross", { parallel: selected.length });

  const crossCandidates = selected.filter(
    (p) => statementResults.filter((s) => s.ref !== p.ref).length > 0,
  );
  const crossPromises = crossCandidates.map((persona) => {
    const others = statementResults.filter((s) => s.ref !== persona.ref);
    return drainWithEvents(
      streamCrossExam(question, persona, others),
      "cross",
      persona.ref,
      (err) => `(质疑失败: ${String(err)})`,
    ).then((text) => {
      E.itemDone("cross", persona.ref, { ref: persona.ref, text });
      return { ref: persona.ref, critique: text, persona };
    });
  });

  const crossResults: Array<{ ref: string; critique: string }> =
    await Promise.all(crossPromises).then((rs) => {
      for (const r of rs) {
        writeChunk(personaHeader(r.persona) + "\n");
        writeChunk(r.critique + "\n");
      }
      return rs.map((r) => ({ ref: r.ref, critique: r.critique }));
    });
  E.phaseDone("cross");

  // ——— 4. Synthesis ———
  log.heading("SYNTHESIS — 综合判断");
  E.phaseStarted("synthesis");

  let synthesisBuf = "";
  let synthesisJson: SynthesisJSON | null = null;
  const useStructured = opts.structuredSynthesis !== false;
  if (useStructured) {
    try {
      synthesisJson = await synthesizeJSON(
        question,
        statementResults,
        crossResults,
      );
      synthesisBuf = renderSynthesisMarkdown(synthesisJson);
      // 为了 CLI 流式观感, 我们把完整 synthesis 一次性写到 chunk stream
      writeChunk(synthesisBuf + "\n");
      E.chunk("synthesis", synthesisBuf);
      E.result("synthesis", synthesisJson);
    } catch (err) {
      const msg = `(结构化综合失败: ${String(err)}), 回退到流式 Markdown`;
      log.warn(msg);
      E.log("warn", msg);
      synthesisBuf = await fallbackStreamingSynthesis(
        question,
        statementResults,
        crossResults,
        (phase, text, persona) => E.chunk(phase, text, persona),
      );
    }
  } else {
    synthesisBuf = await fallbackStreamingSynthesis(
      question,
      statementResults,
      crossResults,
      (phase, text, persona) => E.chunk(phase, text, persona),
    );
  }
  E.phaseDone("synthesis");

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
    summonRationale,
    diversityLog,
  );

  const fm: TranscriptFrontmatter = {
    id,
    question,
    convened_at: new Date().toISOString(),
    personas: selected.map((p) => p.ref),
    run_id: runId, // 关联事件流, 让网页能"原样重放"
  };

  const filePath = writeTranscript(fm, body);
  log.success(`\n议会完毕。transcript: ${filePath}`);
  log.muted(`  反馈: council feedback ${id}`);
  E.runDone({ transcriptPath: filePath, transcriptId: id });
  return id;
}

/** 结构化 synthesis 失败时的回退: 原来的流式 Markdown 输出 */
async function fallbackStreamingSynthesis(
  question: string,
  statements: { ref: string; statement: string }[],
  crossExams: { ref: string; critique: string }[],
  onChunk: (phase: string, text: string, persona?: string) => void,
): Promise<string> {
  let buf = "";
  try {
    for await (const chunk of streamSynthesis(
      question,
      statements,
      crossExams,
    )) {
      writeChunk(chunk);
      onChunk("synthesis", chunk);
      buf += chunk;
    }
  } catch (err) {
    const msg = `\n[综合失败: ${String(err)}]`;
    writeChunk(c.red(msg));
    onChunk("synthesis", msg);
    buf = "(失败)";
  }
  writeChunk("\n");
  return buf;
}

function renderSynthesisMarkdown(s: SynthesisJSON): string {
  const lines: string[] = [];
  lines.push("## 共识");
  for (const c of s.consensus) lines.push(`- ${c}`);
  lines.push("");
  lines.push("## 仍存分歧");
  for (const d of s.disputes) {
    lines.push(`**${d.a} ⇆ ${d.b}**: ${d.point}`);
  }
  lines.push("");
  lines.push("## 如果今天必须决定");
  lines.push(s.decision);
  if (s.meta_insight) {
    lines.push("");
    lines.push("## 本次议会暴露出的新思考模式");
    lines.push(s.meta_insight);
  }
  return lines.join("\n");
}

function renderTranscriptBody(
  question: string,
  personas: Persona[],
  statements: { ref: string; statement: string }[],
  crossExams: { ref: string; critique: string }[],
  synthesis: string,
  summonRationale: string | null,
  diversityLog: string[],
): string {
  const lines: string[] = [];
  lines.push(`# ${question}\n`);

  lines.push("## 召集理由\n");
  if (summonRationale) {
    lines.push(`${summonRationale}\n`);
  } else {
    lines.push(`(无 — 召集人未提供 rationale)\n`);
  }
  lines.push("**最终参会:**\n");
  for (const p of personas) {
    lines.push(`- \`${p.ref}\` [${p.frontmatter.type}] — ${p.frontmatter.description}`);
  }
  lines.push("");
  if (diversityLog.length > 0) {
    lines.push("**多样性约束调整:**\n");
    for (const l of diversityLog) lines.push(`- ${l}`);
    lines.push("");
  }

  lines.push("## Statements\n");
  for (const s of statements) {
    lines.push(`### ${s.ref}\n\n${s.statement}\n`);
  }
  lines.push("## Cross-Examination\n");
  for (const ce of crossExams) {
    lines.push(`### ${ce.ref}\n\n${ce.critique}\n`);
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
