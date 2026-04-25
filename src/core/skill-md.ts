import { readdirSync, existsSync, writeFileSync, renameSync } from "node:fs";
import { join, basename } from "node:path";
import { readMd, writeMd } from "./frontmatter.ts";
import { paths, ensureDir } from "./paths.ts";
import { PersonaNotFoundError, SessionNotFoundError } from "./errors.ts";

export type PersonaType = "self" | "mentor" | "role";

export interface FeedbackEntry {
  at: string;
  rating: "helpful" | "generic" | "off-target";
  transcript: string;
  note?: string;
}

export interface PersonaFrontmatter {
  name: string;
  description: string;
  type: PersonaType;
  origin: "distilled" | "imported" | "handcrafted";
  source_sessions?: string[];
  confidence?: number;
  version?: number;
  created_at?: string;
  usage_count?: number;
  last_used?: string;
  score?: number;
  status?: "active" | "stale" | "archived";
  feedback_log?: FeedbackEntry[];
  /** 视觉元数据 — 网页圆桌渲染用。可选, 未填时引擎会给 fallback */
  avatar?: string; // emoji 或单字符 (展示在椅背)
  color?: string; // hex, 椅子/发言框的主色
}

export interface Persona {
  ref: string;
  filePath: string;
  frontmatter: PersonaFrontmatter;
  body: string;
}

export interface SessionFrontmatter {
  id: string;
  captured_at: string;
  source: "clipboard" | "file" | "stdin" | "mcp";
  title?: string;
  distilled: boolean;
}

export interface Session {
  filePath: string;
  frontmatter: SessionFrontmatter;
  body: string;
}

function personaDirForType(type: PersonaType): string {
  if (type === "self") return paths.personaSelf();
  if (type === "mentor") return paths.personaMentors();
  return paths.personaRoles();
}

export function personaRef(type: PersonaType, name: string): string {
  const bucket = type === "self" ? "self" : type === "mentor" ? "mentors" : "roles";
  return `${bucket}:${name}`;
}

export function parseRef(ref: string): { type: PersonaType; name: string } {
  const [bucketRaw, ...nameParts] = ref.split(":");
  const name = nameParts.join(":");
  const bucket = bucketRaw.trim();
  if (!name) throw new PersonaNotFoundError(ref);
  if (bucket === "self") return { type: "self", name };
  if (bucket === "mentors" || bucket === "mentor") return { type: "mentor", name };
  if (bucket === "roles" || bucket === "role") return { type: "role", name };
  throw new PersonaNotFoundError(ref);
}

function readPersonaFromPath(filePath: string, type: PersonaType): Persona {
  const { data, content } = readMd<PersonaFrontmatter>(filePath);
  return {
    ref: personaRef(type, data.name),
    filePath,
    frontmatter: data,
    body: content,
  };
}

export function listPersonas(
  opts: { includeStale?: boolean } = {},
): Persona[] {
  const result: Persona[] = [];
  const buckets: Array<{ dir: string; type: PersonaType }> = [
    { dir: paths.personaSelf(), type: "self" },
    { dir: paths.personaMentors(), type: "mentor" },
    { dir: paths.personaRoles(), type: "role" },
  ];
  for (const { dir, type } of buckets) {
    if (!existsSync(dir)) continue;
    for (const file of readdirSync(dir)) {
      if (!file.endsWith(".md")) continue;
      try {
        result.push(readPersonaFromPath(join(dir, file), type));
      } catch {
        // skip malformed
      }
    }
  }
  if (!opts.includeStale) {
    return result.filter((p) => (p.frontmatter.status ?? "active") !== "archived");
  }
  return result;
}

export function getPersona(ref: string): Persona {
  const { type, name } = parseRef(ref);
  const dir = personaDirForType(type);
  const filePath = join(dir, `${name}.md`);
  if (!existsSync(filePath)) {
    const draft = join(dir, `${name}-draft.md`);
    if (existsSync(draft)) return readPersonaFromPath(draft, type);
    throw new PersonaNotFoundError(ref);
  }
  return readPersonaFromPath(filePath, type);
}

export function writePersona(
  type: PersonaType,
  data: PersonaFrontmatter,
  body: string,
  opts: { draft?: boolean } = {},
): Persona {
  const dir = personaDirForType(type);
  ensureDir(dir);
  const filename = `${data.name}${opts.draft ? "-draft" : ""}.md`;
  const filePath = join(dir, filename);
  const toWrite: PersonaFrontmatter = {
    version: 1,
    usage_count: 0,
    status: "active",
    feedback_log: [],
    created_at: new Date().toISOString().slice(0, 10),
    ...data,
    type,
  };
  writeMd(filePath, toWrite, body);
  return { ref: personaRef(type, data.name), filePath, frontmatter: toWrite, body };
}

export function movePersonaTo(persona: Persona, targetDir: string): void {
  ensureDir(targetDir);
  const target = join(targetDir, basename(persona.filePath));
  renameSync(persona.filePath, target);
}

// —————————————————— sessions ——————————————————

export function listSessions(): Session[] {
  const dir = paths.sessions();
  if (!existsSync(dir)) return [];
  const results: Session[] = [];
  for (const file of readdirSync(dir)) {
    if (!file.endsWith(".md")) continue;
    try {
      const { data, content } = readMd<SessionFrontmatter>(join(dir, file));
      results.push({
        filePath: join(dir, file),
        frontmatter: data,
        body: content,
      });
    } catch {
      // skip
    }
  }
  return results.sort((a, b) =>
    a.frontmatter.captured_at < b.frontmatter.captured_at ? 1 : -1,
  );
}

export function getSession(id: string): Session {
  const filePath = join(paths.sessions(), `${id}.md`);
  if (!existsSync(filePath)) throw new SessionNotFoundError(id);
  const { data, content } = readMd<SessionFrontmatter>(filePath);
  return { filePath, frontmatter: data, body: content };
}

export function writeSession(data: SessionFrontmatter, body: string): Session {
  ensureDir(paths.sessions());
  const filePath = join(paths.sessions(), `${data.id}.md`);
  writeMd(filePath, data, body);
  return { filePath, frontmatter: data, body };
}

export function markSessionDistilled(id: string): void {
  const session = getSession(id);
  writeMd(
    session.filePath,
    { ...session.frontmatter, distilled: true },
    session.body,
  );
}

// —————————————————— skills (raw highlights) ——————————————————

export interface SkillFrontmatter {
  id: string;
  source_session: string;
  type: string;
  title: string;
  confidence: number;
  created_at: string;
  promoted_to_persona?: string;
  /** 文件名 slug (从 title 派生, 与 id 解耦, 便于人眼浏览) */
  slug?: string;
}

/**
 * 把 highlight 的 title 转成文件名 slug.
 * 中文保留, 拉丁字母小写, 其它符号 → "-".
 */
export function slugifyTitle(title: string): string {
  return title
    .trim()
    .toLowerCase()
    .replace(/[^\w一-龥]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

/**
 * 找一个 skills/ 下不冲突的文件名。
 * 优先 `<slug>.md`, 撞名则 `<slug>-2.md`, `<slug>-3.md`...
 */
function uniqueSkillFilename(slug: string): string {
  ensureDir(paths.skills());
  const dir = paths.skills();
  let candidate = `${slug}.md`;
  let i = 2;
  while (existsSync(join(dir, candidate))) {
    candidate = `${slug}-${i}.md`;
    i++;
  }
  return candidate;
}

export function writeSkill(data: SkillFrontmatter, body: string): string {
  ensureDir(paths.skills());
  // 优先用 title slug 命名 (人类可读); 退化用 id (旧行为)
  let slug = data.slug;
  if (!slug && data.title) slug = slugifyTitle(data.title);
  const filename = slug ? uniqueSkillFilename(slug) : `${data.id}.md`;
  const filePath = join(paths.skills(), filename);
  // 把最终 slug 写回 frontmatter, 方便后续追踪
  const finalSlug = slug ?? data.id;
  writeMd(filePath, { ...data, slug: finalSlug }, body);
  return filePath;
}

export function listSkills(): Array<{ data: SkillFrontmatter; body: string; filePath: string }> {
  const dir = paths.skills();
  if (!existsSync(dir)) return [];
  const out: Array<{ data: SkillFrontmatter; body: string; filePath: string }> = [];
  for (const f of readdirSync(dir)) {
    if (!f.endsWith(".md")) continue;
    try {
      const { data, content } = readMd<SkillFrontmatter>(join(dir, f));
      out.push({ data, body: content, filePath: join(dir, f) });
    } catch {
      // skip
    }
  }
  return out;
}

export function getSkill(id: string): { data: SkillFrontmatter; body: string; filePath: string } | null {
  for (const s of listSkills()) {
    if (s.data.id === id) return s;
  }
  return null;
}

// —————————————————— transcripts ——————————————————

export interface TranscriptFrontmatter {
  id: string;
  question: string;
  convened_at: string;
  personas: string[];
}

export function writeTranscript(data: TranscriptFrontmatter, body: string): string {
  ensureDir(paths.transcripts());
  const filePath = join(paths.transcripts(), `${data.id}.md`);
  writeMd(filePath, data, body);
  return filePath;
}

export function getTranscript(id: string): {
  data: TranscriptFrontmatter;
  body: string;
  filePath: string;
} {
  const filePath = join(paths.transcripts(), `${id}.md`);
  if (!existsSync(filePath)) throw new Error(`找不到 transcript: ${id}`);
  const { data, content } = readMd<TranscriptFrontmatter>(filePath);
  return { data, body: content, filePath };
}

export function listTranscripts(): Array<{
  data: TranscriptFrontmatter;
  body: string;
  filePath: string;
}> {
  const dir = paths.transcripts();
  if (!existsSync(dir)) return [];
  const out: Array<{
    data: TranscriptFrontmatter;
    body: string;
    filePath: string;
  }> = [];
  for (const f of readdirSync(dir)) {
    if (!f.endsWith(".md")) continue;
    try {
      const { data, content } = readMd<TranscriptFrontmatter>(join(dir, f));
      out.push({ data, body: content, filePath: join(dir, f) });
    } catch {
      // skip
    }
  }
  return out.sort((a, b) => (a.data.convened_at < b.data.convened_at ? 1 : -1));
}

// —————————————————— identity ——————————————————

export function readIdentity(): string {
  if (!existsSync(paths.identity())) return "";
  return readMd(paths.identity()).content;
}
