// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Command Palette — ⌘K 全局检索
// 跨 sessions / transcripts / skills / personas 模糊搜
// 键盘: ⌘K 开 · ↑↓ 选 · Enter 跳 · Esc 关
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  api,
  type SessionRow,
  type TranscriptRow,
  type SkillRow,
  type PersonaRow,
} from "@/lib/api";

interface Hit {
  kind: "transcript" | "session" | "persona" | "skill";
  id: string;
  title: string;
  subtitle?: string;
  ts?: string;
  /** 匹配分数 (越高越靠前) */
  score: number;
  /** 跳转动作 */
  action: () => void;
}

interface IndexData {
  transcripts: TranscriptRow[];
  sessions: SessionRow[];
  personas: PersonaRow[];
  skills: SkillRow[];
}

interface Props {
  /** 当用户选中一项需要预填到输入框时 (用于 transcripts: 把问题塞回输入) */
  onPrefill?: (q: string) => void;
  /** 当用户切换 view 时 (例如想跳到 capture 视图) */
  onModeChange?: (m: "council" | "capture") => void;
}

export function CommandPalette({ onPrefill }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState<IndexData | null>(null);
  const [loading, setLoading] = useState(false);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // —— 全局 ⌘K 监听 ——
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      } else if (e.key === "Escape" && open) {
        setOpen(false);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  // —— 打开时拉数据 ——
  useEffect(() => {
    if (!open || index) return;
    setLoading(true);
    Promise.all([
      api.transcripts().catch(() => []),
      api.sessions().catch(() => []),
      api.personas().catch(() => []),
      api.skills().catch(() => []),
    ]).then(([t, s, p, sk]) => {
      setIndex({ transcripts: t, sessions: s, personas: p, skills: sk });
      setLoading(false);
    });
  }, [open, index]);

  // —— 焦点到 input + 重置 ——
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 30);
      setSelectedIdx(0);
    } else {
      setQuery("");
    }
  }, [open]);

  // —— 模糊搜 ——
  const hits = useMemo(() => {
    if (!index) return [] as Hit[];
    const q = query.trim().toLowerCase();
    const out: Hit[] = [];

    function scoreMatch(text: string): number {
      if (!q) return 0;
      const lower = text.toLowerCase();
      if (lower === q) return 100;
      if (lower.startsWith(q)) return 60;
      if (lower.includes(q)) return 30;
      // 简易"散字"匹配: 所有字符按顺序在 text 中出现
      let i = 0;
      for (const ch of q) {
        const found = lower.indexOf(ch, i);
        if (found < 0) return 0;
        i = found + 1;
      }
      return 10;
    }

    // —— transcripts ——
    for (const t of index.transcripts) {
      const haystack = `${t.question} ${t.personas.join(" ")}`;
      const s = q ? scoreMatch(haystack) : 80; // 无 query 时按时间倒序
      if (s > 0 || !q) {
        out.push({
          kind: "transcript",
          id: t.id,
          title: t.question,
          subtitle: `议会 · ${t.personas.length} 位 · ${fmt(t.convened_at)}`,
          ts: t.convened_at,
          score: s + recencyBoost(t.convened_at),
          action: () => {
            // 跳到 transcript: 用 ?run_id= 路由 (TranscriptViewer 可挂)
            // 当前我们没有独立 viewer, 改成 prefill 让用户重开
            onPrefill?.(t.question);
            setOpen(false);
          },
        });
      }
    }

    // —— sessions ——
    for (const s of index.sessions) {
      const haystack = `${s.title ?? ""} ${s.id}`;
      const sc = q ? scoreMatch(haystack) : 60;
      if (sc > 0 || !q) {
        out.push({
          kind: "session",
          id: s.id,
          title: s.title || s.id,
          subtitle: `对话 · ${s.distilled ? `${s.highlight_count} 高光` : "未蒸馏"} · ${fmt(s.captured_at)}`,
          ts: s.captured_at,
          score: sc + recencyBoost(s.captured_at),
          action: () => {
            // 暂时无独立 session viewer, 滚到 feed 顶部
            window.location.assign(`/?focus=session-${encodeURIComponent(s.id)}`);
            setOpen(false);
          },
        });
      }
    }

    // —— personas ——
    for (const p of index.personas) {
      const haystack = `${p.ref} ${p.description ?? ""}`;
      const sc = q ? scoreMatch(haystack) : 40;
      if (sc > 0 || !q) {
        out.push({
          kind: "persona",
          id: p.ref,
          title: p.ref,
          subtitle:
            p.description ?? (p.type === "self" ? "你的思考人格" : p.type),
          score: sc,
          action: () => {
            // ⌘K 选 persona → 把 ref 塞进输入框作为 /refine 命令前奏
            onPrefill?.(p.ref);
            setOpen(false);
          },
        });
      }
    }

    // —— skills ——
    for (const sk of index.skills) {
      const haystack = `${sk.title} ${sk.type}`;
      const sc = q ? scoreMatch(haystack) : 20;
      if (sc > 0 || !q) {
        out.push({
          kind: "skill",
          id: sk.id,
          title: sk.title,
          subtitle: `高光 · ${sk.type} · conf ${sk.confidence.toFixed(2)}${sk.promoted_to_persona ? ` → ${sk.promoted_to_persona}` : ""}`,
          score: sc,
          action: () => {
            window.location.assign(`/?focus=skill-${encodeURIComponent(sk.slug ?? sk.id)}`);
            setOpen(false);
          },
        });
      }
    }

    return out.sort((a, b) => b.score - a.score).slice(0, 30);
  }, [index, query, onPrefill]);

  // —— 键盘 nav ——
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIdx((i) => Math.min(i + 1, hits.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIdx((i) => Math.max(i - 1, 0));
      } else if (e.key === "Enter") {
        e.preventDefault();
        const hit = hits[selectedIdx];
        if (hit) hit.action();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, hits, selectedIdx]);

  // —— 选中项滚动到视图 ——
  useEffect(() => {
    if (!listRef.current) return;
    const el = listRef.current.querySelector<HTMLElement>(
      `[data-cmd-idx="${selectedIdx}"]`,
    );
    el?.scrollIntoView({ block: "nearest" });
  }, [selectedIdx]);

  // —— 搜索框变化重置选中 ——
  useEffect(() => {
    setSelectedIdx(0);
  }, [query]);

  const close = useCallback(() => setOpen(false), []);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="cmdk-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          onClick={close}
          className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 px-4 pt-[14vh] backdrop-blur-sm"
        >
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.98 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-2xl overflow-hidden rounded-xl border border-amber-dim/40 bg-ink-deep/95 shadow-[0_24px_48px_rgba(0,0,0,0.6),0_0_0_1px_rgba(232,181,99,0.1)] backdrop-blur-xl"
          >
            {/* —— 输入框 —— */}
            <div className="flex items-center gap-3 border-b border-amber-dim/15 px-4 py-3.5">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" className="shrink-0 text-amber-glow/60">
                <circle cx="11" cy="11" r="6" stroke="currentColor" strokeWidth="1.6" />
                <path d="M 16 16 L 20 20" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              </svg>
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="搜索议会、对话、高光、人格…"
                className="flex-1 bg-transparent text-[15px] text-parchment/90 placeholder:text-parchment/30 focus:outline-none"
              />
              <kbd className="shrink-0 rounded border border-amber-dim/30 bg-ink-soft/60 px-2 py-0.5 text-[10px] tracking-wider text-parchment/40">
                ESC
              </kbd>
            </div>

            {/* —— 结果列表 —— */}
            <div ref={listRef} className="max-h-[60vh] overflow-y-auto scroll-thin">
              {loading && (
                <div className="px-4 py-8 text-center text-[13px] text-parchment/40">
                  加载中…
                </div>
              )}

              {!loading && hits.length === 0 && (
                <div className="px-4 py-12 text-center text-[13px] text-parchment/40">
                  {query ? `没找到 "${query}" 相关的内容` : "暂无内容"}
                </div>
              )}

              {!loading && hits.length > 0 && (
                <div className="py-1">
                  {hits.map((hit, i) => {
                    const active = i === selectedIdx;
                    return (
                      <button
                        key={`${hit.kind}-${hit.id}-${i}`}
                        type="button"
                        data-cmd-idx={i}
                        onClick={() => hit.action()}
                        onMouseEnter={() => setSelectedIdx(i)}
                        className={`flex w-full items-start gap-3 px-4 py-2.5 text-left transition-colors ${
                          active
                            ? "bg-amber-dim/[0.12] text-amber-glow"
                            : "text-parchment/85 hover:bg-amber-dim/[0.06]"
                        }`}
                      >
                        <KindIcon kind={hit.kind} active={active} />
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-[14px] leading-snug">
                            {hit.title}
                          </div>
                          {hit.subtitle && (
                            <div
                              className={`truncate text-[11px] tracking-wide ${
                                active ? "text-amber-glow/70" : "text-parchment/45"
                              }`}
                            >
                              {hit.subtitle}
                            </div>
                          )}
                        </div>
                        {active && (
                          <kbd className="shrink-0 rounded border border-amber-glow/40 bg-amber-dim/[0.2] px-1.5 py-0.5 text-[9px] tracking-wider text-amber-glow/85">
                            ↵
                          </kbd>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* —— 底部脚注 —— */}
            <div className="flex items-center justify-between border-t border-amber-dim/15 px-4 py-2 text-[10px] tracking-wider text-parchment/35">
              <div className="flex items-center gap-3">
                <span>
                  <kbd className="mr-1 rounded border border-amber-dim/30 bg-ink-soft/60 px-1 py-0.5">↑↓</kbd>
                  选择
                </span>
                <span>
                  <kbd className="mr-1 rounded border border-amber-dim/30 bg-ink-soft/60 px-1 py-0.5">↵</kbd>
                  打开
                </span>
                <span>
                  <kbd className="mr-1 rounded border border-amber-dim/30 bg-ink-soft/60 px-1 py-0.5">⌘K</kbd>
                  开关
                </span>
              </div>
              <span>{hits.length > 0 && `${hits.length} 条结果`}</span>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ──────────────────────────────────────────────────────────────
function KindIcon({
  kind,
  active,
}: {
  kind: Hit["kind"];
  active: boolean;
}) {
  const color = active ? "text-amber-glow/85" : "text-parchment/45";
  const wrap = `flex h-8 w-8 shrink-0 items-center justify-center rounded-md ${
    active ? "bg-amber-dim/[0.18]" : "bg-ink-soft/60"
  } ${color}`;

  if (kind === "transcript") {
    return (
      <div className={wrap} aria-label="议会">
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none">
          <ellipse cx="12" cy="14" rx="7" ry="3" stroke="currentColor" strokeWidth="1.4" />
          <circle cx="6" cy="11" r="1.6" fill="currentColor" />
          <circle cx="12" cy="8" r="1.6" fill="currentColor" />
          <circle cx="18" cy="11" r="1.6" fill="currentColor" />
        </svg>
      </div>
    );
  }
  if (kind === "session") {
    return (
      <div className={wrap} aria-label="对话">
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none">
          <rect x="4" y="6" width="16" height="12" rx="2" stroke="currentColor" strokeWidth="1.4" />
          <line x1="7" y1="10" x2="17" y2="10" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
          <line x1="7" y1="14" x2="13" y2="14" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
        </svg>
      </div>
    );
  }
  if (kind === "persona") {
    return (
      <div className={wrap} aria-label="人格">
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none">
          <circle cx="8" cy="9" r="2.4" stroke="currentColor" strokeWidth="1.4" />
          <circle cx="16" cy="9" r="2.4" stroke="currentColor" strokeWidth="1.4" />
          <circle cx="12" cy="15" r="2.4" stroke="currentColor" strokeWidth="1.4" />
        </svg>
      </div>
    );
  }
  return (
    <div className={wrap} aria-label="高光">
      <svg viewBox="0 0 24 24" width="14" height="14" fill="none">
        <path d="M 12 4 L 14 10 L 20 12 L 14 14 L 12 20 L 10 14 L 4 12 L 10 10 Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
      </svg>
    </div>
  );
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

function recencyBoost(iso: string | undefined): number {
  if (!iso) return 0;
  const ageDays = (Date.now() - new Date(iso).getTime()) / 86400000;
  if (ageDays < 1) return 8;
  if (ageDays < 7) return 4;
  if (ageDays < 30) return 2;
  return 0;
}
