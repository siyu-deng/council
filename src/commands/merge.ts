import readline from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { log, spinner, c } from "../core/logger.ts";
import { isInitialized, paths, ensureDir } from "../core/paths.ts";
import { NotInitializedError } from "../core/errors.ts";
import {
  getPersona,
  writePersona,
  movePersonaTo,
  type PersonaFrontmatter,
} from "../core/skill-md.ts";
import { synthesizeMerge } from "../prompts/P8-synthesize-merge.ts";

export async function mergeCommand(aRef: string, bRef: string): Promise<void> {
  if (!isInitialized()) throw new NotInitializedError();

  const a = getPersona(aRef);
  const b = getPersona(bRef);

  if (a.frontmatter.type !== b.frontmatter.type) {
    log.error(`只能合并同类 persona (两者都是 ${a.frontmatter.type}?)`);
    return;
  }
  if (a.frontmatter.type === "role" || a.frontmatter.type === "mentor") {
    log.warn(
      `你在合并 ${a.frontmatter.type} 类 persona, 通常只建议合并 self。继续? (y/N)`,
    );
    const rl = readline.createInterface({ input: stdin, output: stdout });
    const ans = (await rl.question("  > ")).trim().toLowerCase();
    rl.close();
    if (ans !== "y") return;
  }

  const sp = spinner(`合并 ${aRef} + ${bRef}...`);
  const merged = await synthesizeMerge(a, b);
  sp.succeed(`生成合并预览: ${merged.name}`);

  log.section("=== 预览 ===");
  log.plain(c.gray(`name: ${merged.name}`));
  log.plain(c.gray(`description: ${merged.description}`));
  log.plain(c.gray(`confidence: ${merged.confidence}`));
  log.plain("");
  log.plain(merged.body);
  log.plain("");

  const rl = readline.createInterface({ input: stdin, output: stdout });
  const ans = (
    await rl.question(`采纳合并? 旧文件会移入 _merged/ (y/N) > `)
  )
    .trim()
    .toLowerCase();
  rl.close();

  if (ans !== "y") {
    log.muted("已取消");
    return;
  }

  const fm: PersonaFrontmatter = {
    name: merged.name,
    description: merged.description,
    type: a.frontmatter.type,
    origin: "distilled",
    source_sessions: Array.from(
      new Set([
        ...(a.frontmatter.source_sessions ?? []),
        ...(b.frontmatter.source_sessions ?? []),
      ]),
    ),
    confidence: merged.confidence,
    feedback_log: [
      ...(a.frontmatter.feedback_log ?? []),
      ...(b.frontmatter.feedback_log ?? []),
    ],
    usage_count:
      (a.frontmatter.usage_count ?? 0) + (b.frontmatter.usage_count ?? 0),
  };

  writePersona(a.frontmatter.type, fm, merged.body);

  ensureDir(paths.personaMerged());
  movePersonaTo(a, paths.personaMerged());
  movePersonaTo(b, paths.personaMerged());

  log.success(`合并完成: ${c.bold(`self:${merged.name}`)}`);
  log.muted(`  旧文件已归档到 ${paths.personaMerged()}`);
}
