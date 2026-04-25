import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { AssetFeed } from "./AssetFeed";
import { TraceView } from "./TraceView";
import { useCouncil } from "@/lib/store";

type FilterType = "all" | "sessions" | "skills" | "personas" | "transcripts";

interface Props {
  prefillQuestion: string;
  onConvene: (q: string) => void;
  isBusy: boolean;
}

const SIDEBAR_ICONS: Array<{ key: FilterType; label: string; glyph: React.ReactNode }> = [
  {
    key: "all",
    label: "全部",
    glyph: (
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none">
        <circle cx="12" cy="12" r="3.5" stroke="currentColor" strokeWidth="1.5" />
        <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1" strokeDasharray="2 3" opacity="0.6" />
      </svg>
    ),
  },
  {
    key: "sessions",
    label: "对话",
    glyph: (
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none">
        <rect x="4" y="6" width="16" height="12" rx="2" stroke="currentColor" strokeWidth="1.5" />
        <line x1="7" y1="10" x2="17" y2="10" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
        <line x1="7" y1="14" x2="13" y2="14" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    key: "skills",
    label: "高光",
    glyph: (
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none">
        <path d="M 12 4 L 14 10 L 20 12 L 14 14 L 12 20 L 10 14 L 4 12 L 10 10 Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" fill="none" />
      </svg>
    ),
  },
  {
    key: "personas",
    label: "人格",
    glyph: (
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none">
        <circle cx="8" cy="9" r="2.4" stroke="currentColor" strokeWidth="1.4" />
        <circle cx="16" cy="9" r="2.4" stroke="currentColor" strokeWidth="1.4" />
        <circle cx="12" cy="15" r="2.4" stroke="currentColor" strokeWidth="1.4" />
      </svg>
    ),
  },
  {
    key: "transcripts",
    label: "议会",
    glyph: (
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none">
        <path d="M 5 5 L 5 19 L 19 19 L 19 5 Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
        <line x1="9" y1="9" x2="15" y2="9" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
        <line x1="9" y1="12" x2="15" y2="12" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
        <line x1="9" y1="15" x2="13" y2="15" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      </svg>
    ),
  },
];

export function ConsoleShell({ prefillQuestion, onConvene, isBusy }: Props) {
  const runId = useCouncil((s) => s.runId);
  const finished = useCouncil((s) => s.finished);
  const reset = useCouncil((s) => s.reset);
  const [filter, setFilter] = useState<FilterType>("all");
  const [draft, setDraft] = useState(prefillQuestion ?? "");

  // 同步 prefill (URL 进来的 ?q=)
  useEffect(() => {
    if (prefillQuestion) setDraft(prefillQuestion);
  }, [prefillQuestion]);

  // ESC 退回 default (如果议会进行中)
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && (runId || isBusy)) {
        if (finished) {
          reset();
          setDraft("");
        }
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [runId, isBusy, finished, reset]);

  const inConvene = !!runId;

  function submit() {
    const q = draft.trim();
    if (!q) return;
    if (isBusy) return;
    onConvene(q);
  }

  return (
    <div className="flex h-full w-full flex-col">
      <div className="flex flex-1 overflow-hidden">
        {/* ━━━ 左侧图标栏 ━━━ */}
        <aside className="flex w-[72px] flex-col items-center gap-2 border-r border-amber-dim/15 py-6">
          {SIDEBAR_ICONS.map((it) => {
            const active = !inConvene && filter === it.key;
            return (
              <button
                key={it.key}
                type="button"
                onClick={() => {
                  if (inConvene && finished) {
                    reset();
                    setDraft("");
                  }
                  setFilter(it.key);
                }}
                disabled={inConvene && !finished}
                className={`group flex h-12 w-12 flex-col items-center justify-center rounded-xl border transition-colors ${
                  active
                    ? "border-amber-glow/70 bg-amber-dim/[0.08] text-amber-glow shadow-[0_0_18px_rgba(232,181,99,0.25)]"
                    : "border-transparent text-parchment/40 hover:border-amber-dim/25 hover:text-amber-glow/80"
                } ${inConvene && !finished ? "opacity-30" : "opacity-100"}`}
                title={it.label}
              >
                {it.glyph}
              </button>
            );
          })}
          <div className="flex-1" />
          <div className="text-[9px] tracking-widest text-parchment/20">
            v0.1
          </div>
        </aside>

        {/* ━━━ 主舞台 ━━━ */}
        <main className="relative flex-1 overflow-hidden">
          {inConvene ? (
            <motion.div
              key="trace"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.18 }}
              className="absolute inset-0"
            >
              <TraceView />
            </motion.div>
          ) : (
            <motion.div
              key="feed"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.18 }}
              className="absolute inset-0"
            >
              <AssetFeed filter={filter} onConvene={onConvene} />
            </motion.div>
          )}
        </main>
      </div>

      {/* ━━━ 底部输入框 ━━━ */}
      <div className="border-t border-amber-dim/15 px-4 py-4 md:px-8">
        <div className="mx-auto max-w-5xl">
          {inConvene && !finished ? (
            <LockedInputBar />
          ) : (
            <ActiveInputBar
              value={draft}
              onChange={setDraft}
              onSubmit={submit}
              disabled={isBusy}
              hint={
                finished
                  ? "议会已结束 · 按 ESC 或点击侧栏返回 · 或问下一个问题"
                  : undefined
              }
            />
          )}
        </div>
      </div>
    </div>
  );
}

function ActiveInputBar({
  value,
  onChange,
  onSubmit,
  disabled,
  hint,
}: {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  disabled: boolean;
  hint?: string;
}) {
  return (
    <div className="rounded-2xl border border-amber-dim/30 bg-ink-soft/60 px-4 py-3 transition-colors focus-within:border-amber-dim/60 focus-within:bg-ink-soft/80">
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
            e.preventDefault();
            onSubmit();
          }
        }}
        placeholder={hint ?? "你面前有什么决定?"}
        rows={2}
        className="w-full resize-none bg-transparent font-serif text-[15px] italic leading-relaxed text-parchment/90 placeholder:font-sans placeholder:not-italic placeholder:text-parchment/30 focus:outline-none"
      />
      <div className="mt-1 flex items-center justify-between text-[10px] text-parchment/35">
        <div className="flex items-center gap-3">
          <span>⌘↩  召集议会</span>
          <span className="text-parchment/15">·</span>
          <span>暂支持纯问答 · 后续 /capture /refine</span>
        </div>
        <button
          type="button"
          onClick={onSubmit}
          disabled={disabled || !value.trim()}
          className="flex h-8 w-8 items-center justify-center rounded-full bg-amber-glow text-ink shadow-[0_0_18px_rgba(232,181,99,0.4)] transition-transform hover:scale-105 active:scale-95 disabled:cursor-not-allowed disabled:bg-amber-dim/50 disabled:shadow-none"
          aria-label="召集"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M 7 12 L 7 2 M 3 6 L 7 2 L 11 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>
    </div>
  );
}

function LockedInputBar() {
  return (
    <div className="rounded-2xl border border-dashed border-amber-dim/20 bg-ink-deep px-4 py-4">
      <div className="text-[14px] italic text-parchment/30">
        议会进行中, 输入框已锁. 等待 synthesis 完成…
      </div>
      <div className="mt-1 text-[10px] tracking-wider text-parchment/20">
        ⌘.  中断  ·  ESC  议会完成后切回 default
      </div>
    </div>
  );
}
