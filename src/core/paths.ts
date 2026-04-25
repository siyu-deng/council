import { homedir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { existsSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

export function councilRoot(): string {
  return process.env.COUNCIL_HOME ?? join(homedir(), ".council");
}

export const paths = {
  root: () => councilRoot(),
  identity: () => join(councilRoot(), "identity.md"),
  config: () => join(councilRoot(), "config.yml"),

  personas: () => join(councilRoot(), "personas"),
  personaSelf: () => join(councilRoot(), "personas", "self"),
  personaMentors: () => join(councilRoot(), "personas", "mentors"),
  personaRoles: () => join(councilRoot(), "personas", "roles"),
  personaStale: () => join(councilRoot(), "personas", "_stale"),
  personaMerged: () => join(councilRoot(), "personas", "_merged"),

  sessions: () => join(councilRoot(), "sessions"),
  skills: () => join(councilRoot(), "skills"),
  transcripts: () => join(councilRoot(), "transcripts"),
  exports: () => join(councilRoot(), "exports"),
  state: () => join(councilRoot(), ".state"),
  live: () => join(councilRoot(), "live"),

  distilledIndex: () => join(councilRoot(), ".state", "distilled.json"),
  summonCache: () => join(councilRoot(), ".state", "summon-cache.json"),

  mcpExport: () => join(councilRoot(), "exports", "mcp-server"),
};

export function repoRoot(): string {
  // Bun 提供 import.meta.dir, Node 没有——用 import.meta.url 兼容写法。
  // 打包后 (dist/) 这个文件位置在 dist/, 所以 .. / .. 仍指向包根。
  const here = dirname(fileURLToPath(import.meta.url));
  return resolve(here, "..", "..");
}

export const seedPaths = {
  root: () => join(repoRoot(), "seeds"),
  identityTemplate: () => join(repoRoot(), "seeds", "identity.template.md"),
  configTemplate: () => join(repoRoot(), "seeds", "config.template.yml"),
  personas: () => join(repoRoot(), "seeds", "personas"),
  personaMentors: () => join(repoRoot(), "seeds", "personas", "mentors"),
  personaRoles: () => join(repoRoot(), "seeds", "personas", "roles"),
};

export function ensureDir(dir: string): void {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

export function ensureCouncilDirs(): void {
  for (const dir of [
    paths.root(),
    paths.personaSelf(),
    paths.personaMentors(),
    paths.personaRoles(),
    paths.sessions(),
    paths.skills(),
    paths.transcripts(),
    paths.exports(),
    paths.state(),
    paths.live(),
  ]) {
    ensureDir(dir);
  }
}

export function isInitialized(): boolean {
  return existsSync(paths.identity()) && existsSync(paths.config());
}
