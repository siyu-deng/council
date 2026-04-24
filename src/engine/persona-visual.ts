/**
 * Persona 视觉元数据的 fallback 映射
 * ──────────────────────────────────
 * 新的 persona.md frontmatter 支持 `avatar` 和 `color` 字段。
 * 没有填的老文件, 这里按 type + name 给一个合理的 fallback, 保证网页圆桌永远有东西可显示。
 */

import type { Persona } from "../core/skill-md.ts";

// 已知 mentor 的人格 emoji 映射 (精选)
const MENTOR_AVATARS: Record<string, string> = {
  naval: "🧘",
  jobs: "💎",
  munger: "🧠",
  // 如果将来有更多可继续加
};

// 已知 role 的 emoji
const ROLE_AVATARS: Record<string, string> = {
  "devils-advocate": "🎭",
  "first-customer": "🛒",
  "future-self": "🔮",
  "inner-child": "🧒",
};

// 深色沙龙主色调色盘 (和前端圆桌 UI 配套, 蜡烛光系)
const SELF_COLORS = ["#F6C26B", "#E8A87C", "#C38D9E", "#85CDCA", "#E27D60"];
const MENTOR_COLORS: Record<string, string> = {
  naval: "#F6E27A", // 琥珀
  jobs: "#D8CFC4", // 钛白
  munger: "#B4A582", // 古铜
};
const ROLE_COLORS: Record<string, string> = {
  "devils-advocate": "#B7352D", // 猩红
  "first-customer": "#5A8F7B", // 深青
  "future-self": "#7C6BAD", // 薰衣草
  "inner-child": "#F5A7B8", // 樱粉
};
const DEFAULT_MENTOR = "#D8CFC4";
const DEFAULT_ROLE = "#B7352D";

// 给 self persona 名字一个稳定的颜色 hash
function hashIdx(s: string, n: number): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h % n;
}

export function defaultAvatarFor(p: Persona): string {
  const name = p.frontmatter.name ?? "";
  if (p.frontmatter.type === "mentor") {
    return MENTOR_AVATARS[name] ?? "🕯️";
  }
  if (p.frontmatter.type === "role") {
    return ROLE_AVATARS[name] ?? "🎭";
  }
  // self persona: 用名字首字母 (英文) 或 emoji fallback
  const first = name.replace(/[^a-zA-Z]/g, "").charAt(0).toUpperCase();
  return first || "●";
}

export function defaultColorFor(p: Persona): string {
  const name = p.frontmatter.name ?? "";
  if (p.frontmatter.type === "mentor") {
    return MENTOR_COLORS[name] ?? DEFAULT_MENTOR;
  }
  if (p.frontmatter.type === "role") {
    return ROLE_COLORS[name] ?? DEFAULT_ROLE;
  }
  return SELF_COLORS[hashIdx(name, SELF_COLORS.length)];
}
