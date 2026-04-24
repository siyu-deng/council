import { readFileSync, writeFileSync } from "node:fs";
import matter from "gray-matter";

export interface FrontmatterFile<T> {
  data: T;
  content: string;
}

export function readMd<T = Record<string, unknown>>(
  path: string,
): FrontmatterFile<T> {
  const raw = readFileSync(path, "utf-8");
  const parsed = matter(raw);
  return { data: parsed.data as T, content: parsed.content };
}

export function writeMd<T = Record<string, unknown>>(
  path: string,
  data: T,
  content: string,
): void {
  const serialized = matter.stringify(content, data as Record<string, unknown>);
  writeFileSync(path, serialized, "utf-8");
}
