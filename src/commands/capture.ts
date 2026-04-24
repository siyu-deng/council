import { readFileSync } from "node:fs";
import clipboardy from "clipboardy";
import { writeSession, type SessionFrontmatter } from "../core/skill-md.ts";
import { log, spinner, c } from "../core/logger.ts";
import { NotInitializedError } from "../core/errors.ts";
import { isInitialized } from "../core/paths.ts";
import { loadConfig } from "../core/config.ts";
import { callJSON, MODELS } from "../core/claude.ts";

interface CaptureOpts {
  file?: string;
  clipboard?: boolean;
  title?: string;
}

export async function captureCommand(opts: CaptureOpts): Promise<void> {
  if (!isInitialized()) throw new NotInitializedError();

  const body = await readSource(opts);
  if (!body.trim()) {
    log.error("读取到的内容为空");
    return;
  }

  const source = opts.file ? "file" : opts.clipboard ? "clipboard" : "stdin";

  const sp = spinner("生成标题...");
  let title = opts.title;
  if (!title) {
    try {
      title = await generateTitle(body);
      sp.succeed(`标题: ${title}`);
    } catch (err) {
      sp.fail(`自动标题失败, 使用时间戳`);
      title = `capture-${Date.now()}`;
    }
  } else {
    sp.succeed(`标题: ${title}`);
  }

  const date = new Date().toISOString().slice(0, 10);
  const slug = slugify(title);
  const id = `${date}-${slug}`;

  const fm: SessionFrontmatter = {
    id,
    captured_at: new Date().toISOString(),
    source: source as SessionFrontmatter["source"],
    title,
    distilled: false,
  };

  const session = writeSession(fm, body);
  log.success(`Captured: ${c.bold(id)}`);
  log.muted(`  → ${session.filePath}`);
  log.muted(`  → 下一步: ${c.bold(`council distill ${id}`)} 或 council distill --auto`);
}

async function readSource(opts: CaptureOpts): Promise<string> {
  if (opts.file) return readFileSync(opts.file, "utf-8");
  if (opts.clipboard) return clipboardy.readSync();
  // stdin
  if (process.stdin.isTTY) {
    log.info("从 stdin 读取 — 粘贴内容后按 Ctrl+D (macOS/Linux) / Ctrl+Z+Enter (Windows)");
  }
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf-8");
}

async function generateTitle(body: string): Promise<string> {
  const cfg = loadConfig();
  const result = await callJSON<{ title: string; slug: string }>(
    `以下是一段用户和 AI 的对话, 请提取一个 3-6 字的中文标题, 以及一个英文 kebab-case slug (3-5 个词)。\n\n对话:\n${body.slice(0, 4000)}`,
    {
      model: cfg.models.summon ?? MODELS.haiku,
      label: "title",
      temperature: 0.3,
      jsonSchema: {
        type: "object",
        properties: {
          title: { type: "string", description: "中文标题, 3-6 字" },
          slug: { type: "string", description: "kebab-case, 小写, 英文词" },
        },
        required: ["title", "slug"],
      },
    },
  );
  return result.title;
}

function slugify(s: string | undefined): string {
  if (!s) return "untitled";
  return (
    s
      .toLowerCase()
      .replace(/[^\w\u4e00-\u9fa5-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "untitled"
  );
}
