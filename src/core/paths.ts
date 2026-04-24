import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { existsSync, mkdirSync } from "node:fs";

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
  return resolve(import.meta.dir, "..", "..");
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
