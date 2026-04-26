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
  // 源码模式: 此文件在 src/core/paths.ts → 上溯 2 级到 repo 根
  // 打包模式: 此文件被 inline 进 dist/council.mjs → 上溯 1 级到 repo 根
  // 所以不能用固定层数, 改成"向上找 package.json"。
  let here = dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 5; i++) {
    if (existsSync(join(here, "package.json"))) return here;
    const parent = dirname(here);
    if (parent === here) break; // hit root
    here = parent;
  }
  // 找不到 package.json (极端情况) 退到用户家目录的 ~/.council 不至于完全报错
  return process.cwd();
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
