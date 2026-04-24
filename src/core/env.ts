import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { repoRoot } from "./paths.ts";

/**
 * Minimal .env loader: loads KEY=VALUE lines from project root .env
 * if that key isn't already in process.env. Quotes are stripped.
 */
export function loadDotEnv(): void {
  const path = join(repoRoot(), ".env");
  if (!existsSync(path)) return;
  try {
    const raw = readFileSync(path, "utf-8");
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq <= 0) continue;
      const key = trimmed.slice(0, eq).trim();
      let value = trimmed.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (!process.env[key]) process.env[key] = value;
    }
  } catch {
    // ignore
  }
}
