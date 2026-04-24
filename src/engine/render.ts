import kleur from "kleur";
import boxen from "boxen";
import type { Persona } from "../core/skill-md.ts";

const PALETTE = [
  "cyan",
  "magenta",
  "yellow",
  "green",
  "blue",
  "red",
] as const;

type ColorName = (typeof PALETTE)[number];

const assigned = new Map<string, ColorName>();

export function colorFor(ref: string): (s: string) => string {
  if (!assigned.has(ref)) {
    assigned.set(ref, PALETTE[assigned.size % PALETTE.length]);
  }
  const name = assigned.get(ref)!;
  return (s: string) => (kleur[name] as (s: string) => string)(s);
}

export function icon(persona: Persona): string {
  const map = { self: "◉", mentor: "✦", role: "◇" };
  return map[persona.frontmatter.type] ?? "•";
}

export function personaHeader(persona: Persona): string {
  const color = colorFor(persona.ref);
  return color(kleur.bold(`\n${icon(persona)} ${persona.ref}`));
}

export function section(title: string): string {
  return "\n" + kleur.bold().underline(title) + "\n";
}

export function divider(): string {
  return kleur.gray("─".repeat(60));
}

export function synthesisBox(content: string): string {
  return boxen(content, {
    padding: 1,
    margin: 1,
    borderStyle: "round",
    borderColor: "green",
    title: "SYNTHESIS",
    titleAlignment: "center",
  });
}

/**
 * Write raw chunk for streaming UI.
 * - 默认写 stderr — 和 logger 保持一致, 避免污染 MCP stdio 协议 (stdout = JSON-RPC only)
 * - COUNCIL_QUIET=1 时完全静默, MCP server 调 convene() 时用
 * - CLI 终端同时展示 stderr 和 stdout, 用户感知无差异
 */
export function writeChunk(chunk: string): void {
  if (process.env.COUNCIL_QUIET) return;
  process.stderr.write(chunk);
}
