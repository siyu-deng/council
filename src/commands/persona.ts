import { readFileSync } from "node:fs";
import matter from "gray-matter";
import { log, c, spinner } from "../core/logger.ts";
import {
  listPersonas,
  writePersona,
  type PersonaFrontmatter,
  type PersonaType,
} from "../core/skill-md.ts";
import { NotInitializedError } from "../core/errors.ts";
import { isInitialized } from "../core/paths.ts";

type PersonaArgs =
  | { action: "list" }
  | { action: "add"; pathOrUrl: string };

export async function personaCommand(args: PersonaArgs): Promise<void> {
  if (!isInitialized()) throw new NotInitializedError();

  if (args.action === "list") {
    return doList();
  }

  if (args.action === "add") {
    return doAdd(args.pathOrUrl);
  }
}

function doList(): void {
  const personas = listPersonas();
  if (personas.length === 0) {
    log.muted("还没有任何 persona。运行 `council init`。");
    return;
  }
  log.heading(`${personas.length} personas`);
  const byType = new Map<string, typeof personas>();
  for (const p of personas) {
    const t = p.frontmatter.type;
    if (!byType.has(t)) byType.set(t, []);
    byType.get(t)!.push(p);
  }
  for (const [type, list] of byType) {
    log.section(`${type} (${list.length})`);
    for (const p of list) {
      const badge = c.gray(`[${p.frontmatter.status ?? "active"}]`);
      const conf = p.frontmatter.confidence
        ? c.gray(` conf=${p.frontmatter.confidence}`)
        : "";
      const score =
        p.frontmatter.score !== undefined
          ? c.gray(` score=${p.frontmatter.score.toFixed(2)}`)
          : "";
      log.plain(
        `  ${c.bold(p.ref)} ${badge}${conf}${score}\n    ${c.gray(p.frontmatter.description)}`,
      );
    }
  }
}

async function doAdd(pathOrUrl: string): Promise<void> {
  const sp = spinner(`导入 ${pathOrUrl}...`);
  let raw: string;
  try {
    if (pathOrUrl.startsWith("http://") || pathOrUrl.startsWith("https://")) {
      const res = await fetch(pathOrUrl);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      raw = await res.text();
    } else {
      raw = readFileSync(pathOrUrl, "utf-8");
    }
  } catch (err) {
    sp.fail(`读取失败: ${String(err)}`);
    return;
  }

  const parsed = matter(raw);
  const fm = parsed.data as Partial<PersonaFrontmatter>;

  if (!fm.name || !fm.description) {
    sp.fail("缺少必要 frontmatter (name/description)");
    return;
  }

  // Infer type: prefer frontmatter.type, default to "mentor" for imports
  let type: PersonaType = "mentor";
  if (fm.type === "self" || fm.type === "mentor" || fm.type === "role") {
    type = fm.type;
  }

  const full: PersonaFrontmatter = {
    name: fm.name,
    description: fm.description,
    type,
    origin: "imported",
    version: fm.version ?? 1,
    created_at: new Date().toISOString().slice(0, 10),
    confidence: fm.confidence,
    usage_count: 0,
    status: "active",
    feedback_log: [],
  };

  const persona = writePersona(type, full, parsed.content);
  sp.succeed(`已导入: ${c.bold(persona.ref)}`);
  log.muted(`  → ${persona.filePath}`);
}
