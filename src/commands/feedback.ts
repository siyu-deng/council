import readline from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { log, c } from "../core/logger.ts";
import { isInitialized } from "../core/paths.ts";
import { NotInitializedError } from "../core/errors.ts";
import { getTranscript, getPersona, type FeedbackEntry } from "../core/skill-md.ts";
import { writeMd } from "../core/frontmatter.ts";

type Rating = "helpful" | "generic" | "off-target";

export async function feedbackCommand(transcriptId: string): Promise<void> {
  if (!isInitialized()) throw new NotInitializedError();

  const t = getTranscript(transcriptId);
  log.heading(`反馈: ${transcriptId}`);
  log.muted(`  问题: ${t.data.question}`);
  log.muted(`  参与: ${t.data.personas.join(", ")}`);
  log.plain("");
  log.muted("对每个 persona 本次的贡献打分: [h]elpful / [g]eneric / [o]ff-target / [s]kip");
  log.plain("");

  const rl = readline.createInterface({ input: stdin, output: stdout });

  for (const ref of t.data.personas) {
    const p = getPersona(ref);
    const ans = (await rl.question(`  ${c.bold(ref)} > `)).trim().toLowerCase();
    const rating = parseRating(ans);
    if (!rating) {
      log.muted("    ↷ 跳过");
      continue;
    }

    const entry: FeedbackEntry = {
      at: new Date().toISOString(),
      rating,
      transcript: transcriptId,
    };
    const fm = { ...p.frontmatter };
    fm.feedback_log = [...(fm.feedback_log ?? []), entry];
    fm.usage_count = (fm.usage_count ?? 0) + 1;
    fm.last_used = new Date().toISOString().slice(0, 10);
    fm.score = computeScore(fm.feedback_log);
    writeMd(p.filePath, fm, p.body);
    log.muted(`    ✓ ${rating}, 新分数 ${fm.score.toFixed(2)}`);
  }

  rl.close();
  log.plain("");
  log.success("反馈记录完毕。跑 `council evolve` 看是否有 persona 该被归档或合并。");
}

function parseRating(ans: string): Rating | null {
  if (!ans) return null;
  const ch = ans[0];
  if (ch === "h" || ans === "helpful") return "helpful";
  if (ch === "g" || ans === "generic") return "generic";
  if (ch === "o" || ans === "off-target") return "off-target";
  return null;
}

function computeScore(log: FeedbackEntry[]): number {
  const total = log.length;
  if (total === 0) return 0;
  let helpful = 0,
    generic = 0,
    off = 0;
  for (const f of log) {
    if (f.rating === "helpful") helpful++;
    else if (f.rating === "generic") generic++;
    else off++;
  }
  return Math.max(-1, Math.min(1, (helpful - off - 0.5 * generic) / total));
}
