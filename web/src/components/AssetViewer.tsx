// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 资产查看器 — 弹窗显示 transcript / session / skill / persona 的 markdown body
// 由 Cmd+K 触发, 也支持卡片菜单 / URL hash 触发
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { api } from "@/lib/api";

export type AssetKind = "transcript" | "session" | "skill" | "persona";

export interface ViewerTarget {
  kind: AssetKind;
  id: string; // transcript/session id, skill slug or id, persona ref
  /** 可选: 跳转后用户会想做的操作 — 例如对 transcript 提供"重新召集" */
  question?: string;
}

interface Props {
  target: ViewerTarget | null;
  onClose: () => void;
  /** 关闭后用户希望把 query 塞进输入框 (例如重新召集 transcript 的问题) */
  onPrefill?: (q: string) => void;
  /** "重温": 静态重放某次议会的事件流 (零 LLM 成本) */
  onReplay?: (runId: string, fallbackQuestion?: string) => void;
}

interface Loaded {
  title: string;
  meta: string;
  body: string;
  /** 用于"改一改再问"按钮 */
  question?: string;
  /** 用于"重温"按钮 — 静态重放 JSONL 事件流 */
  run_id?: string;
}

export function AssetViewer({ target, onClose, onPrefill, onReplay }: Props) {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ESC 关闭
  useEffect(() => {
    if (!target) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [target, onClose]);

  // 切换 target 时拉数据
  useEffect(() => {
    if (!target) {
      setLoaded(null);
      setError(null);
      return;
    }
    let cancel = false;
    setLoading(true);
    setError(null);
    setLoaded(null);
    (async () => {
      try {
        if (target.kind === "transcript") {
          const t = await api.transcript(target.id);
          if (cancel) return;
          setLoaded({
            title: t.question,
            meta: `议会 · ${t.personas.join(" · ")} · ${fmt(t.convened_at)}`,
            body: t.body,
            question: t.question,
            run_id: t.run_id,
          });
        } else if (target.kind === "session") {
          const s = await api.session(target.id);
          if (cancel) return;
          setLoaded({
            title: s.title || s.id,
            meta: `对话 · ${s.distilled ? `已蒸馏 (${s.highlights.length} 高光)` : "未蒸馏"} · ${fmt(s.captured_at)}`,
            body: s.body,
          });
        } else if (target.kind === "skill") {
          const sk = await api.skill(target.id);
          if (cancel) return;
          setLoaded({
            title: sk.title,
            meta: `高光 · ${sk.type} · conf ${sk.confidence.toFixed(2)}${sk.promoted_to_persona ? ` · 已并入 ${sk.promoted_to_persona}` : ""}`,
            body: sk.body,
          });
        } else if (target.kind === "persona") {
          const p = await api.persona(target.id);
          if (cancel) return;
          setLoaded({
            title: p.ref,
            meta: `${p.type === "self" ? "你的人格" : p.type === "mentor" ? "导师" : "戏剧角色"}${p.confidence ? ` · conf ${p.confidence.toFixed(2)}` : ""}${p.version ? ` · v${p.version}` : ""}${p.description ? ` — ${p.description}` : ""}`,
            body: p.body,
          });
        }
        if (!cancel) setLoading(false);
      } catch (err) {
        if (cancel) return;
        setError(String(err));
        setLoading(false);
      }
    })();
    return () => {
      cancel = true;
    };
  }, [target]);

  return (
    <AnimatePresence>
      {target && (
        <motion.div
          key="viewer-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          onClick={onClose}
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/55 px-4 py-12 backdrop-blur-sm"
        >
          <motion.div
            initial={{ opacity: 0, y: 12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.98 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
            onClick={(e) => e.stopPropagation()}
            className="flex h-full w-full max-w-3xl flex-col overflow-hidden rounded-xl border border-amber-dim/40 bg-ink-deep/95 shadow-[0_24px_48px_rgba(0,0,0,0.6),0_0_0_1px_rgba(232,181,99,0.1)]"
          >
            {/* —— Header —— */}
            <div className="flex shrink-0 items-start justify-between gap-3 border-b border-amber-dim/15 px-5 py-3.5">
              <div className="min-w-0 flex-1">
                <div className="mb-1 text-[10px] tracking-[0.18em] text-amber-glow/60">
                  {kindLabel(target.kind)}
                </div>
                <h2
                  className="font-serif text-lg italic leading-snug text-parchment/90"
                  style={{
                    display: "-webkit-box",
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: "vertical",
                    overflow: "hidden",
                  }}
                >
                  {loaded?.title ?? "加载中…"}
                </h2>
                {loaded?.meta && (
                  <div className="mt-1.5 text-[11px] tracking-wide text-parchment/45">
                    {loaded.meta}
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="关闭"
                className="shrink-0 rounded-md p-1 text-parchment/40 transition-colors hover:bg-amber-dim/[0.08] hover:text-amber-glow"
              >
                <svg viewBox="0 0 24 24" width="20" height="20" fill="none">
                  <path
                    d="M 6 6 L 18 18 M 18 6 L 6 18"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                  />
                </svg>
              </button>
            </div>

            {/* —— Body —— */}
            <div className="min-h-0 flex-1 overflow-y-auto scroll-thin px-6 py-5">
              {loading && (
                <div className="flex h-full items-center justify-center text-[13px] text-parchment/40">
                  加载中…
                </div>
              )}
              {error && (
                <div className="flex h-full items-center justify-center text-[13px] text-orange-300/70">
                  加载失败: {error}
                </div>
              )}
              {!loading && !error && loaded && (
                <MarkdownView body={loaded.body} />
              )}
            </div>

            {/* —— Footer actions —— */}
            <div className="flex shrink-0 items-center justify-between gap-3 border-t border-amber-dim/15 bg-ink/30 px-5 py-3">
              <div className="text-[10px] tracking-wider text-parchment/35">
                <kbd className="mr-1 rounded border border-amber-dim/30 bg-ink-soft/60 px-1.5 py-0.5">ESC</kbd>
                关闭
              </div>
              <div className="flex items-center gap-2">
                {/* 重温 — 零 LLM 成本静态重放议会, 比"改一改再问"更先放是因为它更便宜 */}
                {target.kind === "transcript" && loaded?.run_id && onReplay && (
                  <button
                    type="button"
                    onClick={() => {
                      onReplay(loaded.run_id!, loaded.question);
                      onClose();
                    }}
                    className="rounded-md border border-amber-dim/40 bg-amber-dim/[0.1] px-3 py-1.5 text-[12px] text-amber-glow transition-colors hover:bg-amber-dim/[0.2]"
                    title="零 LLM 成本 · 重新走一遍这场议会"
                  >
                    ⟳ 重温
                  </button>
                )}
                {target.kind === "transcript" && loaded?.question && onPrefill && (
                  <button
                    type="button"
                    onClick={() => {
                      if (loaded.question) onPrefill(loaded.question);
                      onClose();
                    }}
                    className="rounded-md border border-amber-dim/40 bg-amber-dim/[0.1] px-3 py-1.5 text-[12px] text-amber-glow transition-colors hover:bg-amber-dim/[0.2]"
                  >
                    改一改再问
                  </button>
                )}
                {target.kind === "persona" && onPrefill && (
                  <button
                    type="button"
                    onClick={() => {
                      onPrefill(`/refine ${target.id}`);
                      onClose();
                    }}
                    className="rounded-md border border-amber-dim/40 bg-amber-dim/[0.1] px-3 py-1.5 text-[12px] text-amber-glow transition-colors hover:bg-amber-dim/[0.2]"
                    title="把 /refine 命令塞进输入框"
                  >
                    深化此人格
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    if (loaded?.body) {
                      void navigator.clipboard.writeText(loaded.body);
                    }
                  }}
                  className="rounded-md border border-amber-dim/30 bg-ink-soft/40 px-3 py-1.5 text-[12px] text-parchment/65 transition-colors hover:border-amber-dim/50 hover:text-amber-glow"
                >
                  复制 Markdown
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ─────────────────────────────────────────────────────────
// 极简 Markdown 渲染 — 不引第三方 lib, 处理 # 标题 + 段落 + 列表 + > 引用
// 不支持: 图片 / 表格 / 内嵌 HTML / 代码块语法高亮
// ─────────────────────────────────────────────────────────
function MarkdownView({ body }: { body: string }) {
  const blocks = parseBlocks(body);
  return (
    <article className="font-serif text-[15px] leading-relaxed text-parchment/85">
      {blocks.map((b, i) => {
        if (b.type === "h1") return <h1 key={i} className="mb-4 mt-6 font-serif text-2xl font-medium text-amber-glow first:mt-0">{b.text}</h1>;
        if (b.type === "h2") return <h2 key={i} className="mb-3 mt-6 font-serif text-xl font-medium text-amber-glow/90 first:mt-0">{b.text}</h2>;
        if (b.type === "h3") return <h3 key={i} className="mb-2 mt-5 font-serif text-base font-semibold text-parchment/90 first:mt-0">{b.text}</h3>;
        if (b.type === "quote")
          return (
            <blockquote key={i} className="mb-4 border-l-2 border-amber-dim/50 bg-ink-soft/30 px-4 py-2 italic text-parchment/75">
              {b.text}
            </blockquote>
          );
        if (b.type === "ul")
          return (
            <ul key={i} className="mb-4 space-y-1.5 pl-5">
              {b.items.map((it, j) => (
                <li key={j} className="list-disc text-parchment/80 marker:text-amber-glow/50">
                  {renderInline(it)}
                </li>
              ))}
            </ul>
          );
        if (b.type === "ol")
          return (
            <ol key={i} className="mb-4 space-y-1.5 pl-5">
              {b.items.map((it, j) => (
                <li key={j} className="list-decimal text-parchment/80 marker:text-amber-glow/50">
                  {renderInline(it)}
                </li>
              ))}
            </ol>
          );
        if (b.type === "hr")
          return <hr key={i} className="my-6 border-amber-dim/15" />;
        if (b.type === "code")
          return (
            <pre key={i} className="mb-4 overflow-x-auto rounded-md border border-amber-dim/15 bg-ink-deep/70 p-3 font-mono text-[12px] text-parchment/70">
              {b.text}
            </pre>
          );
        // p
        return (
          <p key={i} className="mb-3 text-parchment/80">
            {renderInline(b.text)}
          </p>
        );
      })}
    </article>
  );
}

// 每个 type 单独成 variant — TS 的 discriminated union 才能完美 narrowing
type Block =
  | { type: "h1"; text: string }
  | { type: "h2"; text: string }
  | { type: "h3"; text: string }
  | { type: "p"; text: string }
  | { type: "quote"; text: string }
  | { type: "ul"; items: string[] }
  | { type: "ol"; items: string[] }
  | { type: "hr" }
  | { type: "code"; text: string };

function parseBlocks(md: string): Block[] {
  // 去掉 frontmatter (---...---)
  const stripped = md.replace(/^---\n[\s\S]*?\n---\n?/, "");
  const lines = stripped.split(/\r?\n/);
  const blocks: Block[] = [];
  let i = 0;
  let inCode = false;
  let codeBuf: string[] = [];

  while (i < lines.length) {
    const line = lines[i];

    // 代码块
    if (line.startsWith("```")) {
      if (inCode) {
        blocks.push({ type: "code", text: codeBuf.join("\n") });
        codeBuf = [];
        inCode = false;
      } else {
        inCode = true;
      }
      i++;
      continue;
    }
    if (inCode) {
      codeBuf.push(line);
      i++;
      continue;
    }

    // hr
    if (/^---+$/.test(line.trim())) {
      blocks.push({ type: "hr" });
      i++;
      continue;
    }
    // 空行跳过
    if (!line.trim()) {
      i++;
      continue;
    }
    // headings
    const h = line.match(/^(#{1,3})\s+(.+)$/);
    if (h) {
      const level = h[1].length as 1 | 2 | 3;
      blocks.push({ type: `h${level}` as "h1" | "h2" | "h3", text: h[2].trim() });
      i++;
      continue;
    }
    // quote
    if (line.startsWith("> ")) {
      const buf = [line.slice(2)];
      i++;
      while (i < lines.length && lines[i].startsWith("> ")) {
        buf.push(lines[i].slice(2));
        i++;
      }
      blocks.push({ type: "quote", text: buf.join(" ") });
      continue;
    }
    // unordered list
    if (/^[-*+]\s+/.test(line)) {
      const items: string[] = [line.replace(/^[-*+]\s+/, "")];
      i++;
      while (i < lines.length && /^[-*+]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^[-*+]\s+/, ""));
        i++;
      }
      blocks.push({ type: "ul", items });
      continue;
    }
    // ordered list
    if (/^\d+\.\s+/.test(line)) {
      const items: string[] = [line.replace(/^\d+\.\s+/, "")];
      i++;
      while (i < lines.length && /^\d+\.\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\d+\.\s+/, ""));
        i++;
      }
      blocks.push({ type: "ol", items });
      continue;
    }
    // 段落: 收集连续非空行
    const buf = [line];
    i++;
    while (
      i < lines.length &&
      lines[i].trim() &&
      !/^(#{1,3}\s|>|---+$|[-*+]\s|\d+\.\s|```)/.test(lines[i])
    ) {
      buf.push(lines[i]);
      i++;
    }
    blocks.push({ type: "p", text: buf.join(" ") });
  }
  return blocks;
}

// 段内: **bold** *italic* `code`
function renderInline(s: string): React.ReactNode {
  // 简易解析: 用 regex 切 token 再 map
  const tokens: Array<{ kind: "text" | "bold" | "italic" | "code"; text: string }> = [];
  let rest = s;
  while (rest.length > 0) {
    // **bold** (优先于 *italic*)
    const bold = rest.match(/^\*\*([^*]+)\*\*/);
    if (bold) {
      tokens.push({ kind: "bold", text: bold[1] });
      rest = rest.slice(bold[0].length);
      continue;
    }
    // *italic* / _italic_
    const it = rest.match(/^[*_]([^*_]+)[*_]/);
    if (it) {
      tokens.push({ kind: "italic", text: it[1] });
      rest = rest.slice(it[0].length);
      continue;
    }
    // `code`
    const code = rest.match(/^`([^`]+)`/);
    if (code) {
      tokens.push({ kind: "code", text: code[1] });
      rest = rest.slice(code[0].length);
      continue;
    }
    // 普通文本 — 取到下一个特殊符号前
    const next = rest.search(/\*\*|[*_`]/);
    if (next < 0) {
      tokens.push({ kind: "text", text: rest });
      rest = "";
    } else if (next === 0) {
      // 落单的特殊符号
      tokens.push({ kind: "text", text: rest[0] });
      rest = rest.slice(1);
    } else {
      tokens.push({ kind: "text", text: rest.slice(0, next) });
      rest = rest.slice(next);
    }
  }
  return tokens.map((t, i) => {
    if (t.kind === "bold") return <strong key={i} className="font-semibold text-parchment/95">{t.text}</strong>;
    if (t.kind === "italic") return <em key={i} className="italic">{t.text}</em>;
    if (t.kind === "code") return <code key={i} className="rounded bg-ink-soft/70 px-1.5 py-0.5 font-mono text-[12px] text-amber-glow/80">{t.text}</code>;
    return <span key={i}>{t.text}</span>;
  });
}

// ─────────────────────────────────────────────────────────
function kindLabel(k: AssetKind): string {
  return k === "transcript"
    ? "议 · 会"
    : k === "session"
      ? "捕 · 获"
      : k === "skill"
        ? "高 · 光"
        : "人 · 格";
}

function fmt(iso: string): string {
  const d = new Date(iso);
  const now = Date.now();
  const diff = now - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins} 分钟前`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} 小时前`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days} 天前`;
  return d.toLocaleDateString("zh-CN");
}
