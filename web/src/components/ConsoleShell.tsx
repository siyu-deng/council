import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { AssetFeed } from "./AssetFeed";
import { TraceView } from "./TraceView";
import { CommandPalette } from "./CommandPalette";
import { AssetViewer, type ViewerTarget } from "./AssetViewer";
import { useCouncil } from "@/lib/store";
import { api } from "@/lib/api";
import { useTheme } from "@/lib/theme";

type FilterType = "all" | "sessions" | "skills" | "personas" | "transcripts";
type AppMode = "council" | "capture";

interface Props {
  prefillQuestion: string;
  onConvene: (q: string) => void;
  /** "原样重开": 静态重放某次 run 的事件流 (零 LLM 成本) */
  onReplay?: (runId: string, fallbackQuestion?: string) => void;
  isBusy: boolean;
  /** 当前主视图 (议会 / 捕获) */
  mode: AppMode;
  /** 切换主视图回调 (App.tsx 控制 URL) */
  onModeChange: (m: AppMode) => void;
  /** capture 模式时渲染的内容 (由 App 传入 CaptureView) */
  children?: React.ReactNode;
}

const SIDEBAR_FILTERS: Array<{ key: FilterType; label: string; glyph: React.ReactNode }> = [
  {
    key: "all",
    label: "全部",
    glyph: (
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none">
        <circle cx="12" cy="12" r="3.5" stroke="currentColor" strokeWidth="1.5" />
        <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1" strokeDasharray="2 3" opacity="0.6" />
      </svg>
    ),
  },
  {
    key: "sessions",
    label: "对话",
    glyph: (
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none">
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
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none">
        <path d="M 12 4 L 14 10 L 20 12 L 14 14 L 12 20 L 10 14 L 4 12 L 10 10 Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" fill="none" />
      </svg>
    ),
  },
  {
    key: "personas",
    label: "人格",
    glyph: (
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none">
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
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none">
        <path d="M 5 5 L 5 19 L 19 19 L 19 5 Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
        <line x1="9" y1="9" x2="15" y2="9" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
        <line x1="9" y1="12" x2="15" y2="12" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
        <line x1="9" y1="15" x2="13" y2="15" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      </svg>
    ),
  },
];

const SIDEBAR_MODES: Array<{ key: AppMode; label: string; glyph: React.ReactNode }> = [
  {
    key: "council",
    label: "议会",
    glyph: (
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none">
        {/* 圆桌 + 三个座位 */}
        <ellipse cx="12" cy="14" rx="7" ry="3" stroke="currentColor" strokeWidth="1.4" />
        <circle cx="6" cy="11" r="1.6" stroke="currentColor" strokeWidth="1.2" fill="currentColor" fillOpacity="0.2" />
        <circle cx="12" cy="8" r="1.6" stroke="currentColor" strokeWidth="1.2" fill="currentColor" fillOpacity="0.2" />
        <circle cx="18" cy="11" r="1.6" stroke="currentColor" strokeWidth="1.2" fill="currentColor" fillOpacity="0.2" />
      </svg>
    ),
  },
  {
    key: "capture",
    label: "捕获",
    glyph: (
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none">
        <rect x="4" y="5" width="16" height="14" rx="2" stroke="currentColor" strokeWidth="1.4" />
        <line x1="8" y1="10" x2="14" y2="10" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        <line x1="8" y1="13" x2="16" y2="13" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        <line x1="8" y1="16" x2="11" y2="16" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      </svg>
    ),
  },
];

const SIDEBAR_STORAGE_KEY = "council:sidebar:expanded";

export function ConsoleShell({
  prefillQuestion,
  onConvene,
  onReplay,
  isBusy,
  mode,
  onModeChange,
  children,
}: Props) {
  const runId = useCouncil((s) => s.runId);
  const finished = useCouncil((s) => s.finished);
  const reset = useCouncil((s) => s.reset);
  const connection = useCouncil((s) => s.connection);
  const [filter, setFilter] = useState<FilterType>("all");
  const [draft, setDraft] = useState(prefillQuestion ?? "");
  const [toast, setToast] = useState<{ tone: "ok" | "warn" | "err"; text: string } | null>(null);
  const [pendingCmd, setPendingCmd] = useState<string | null>(null);

  // 资产查看器 (Cmd+K 选中后弹出)
  const [viewerTarget, setViewerTarget] = useState<ViewerTarget | null>(null);

  // prefill 视觉反馈 — 给输入框一次"闪光" 动画 + toast 通知 (修复用户感知不到 prefill 生效)
  const [inputFlash, setInputFlash] = useState(0);
  function prefillWithFeedback(q: string, label = "已填到输入框") {
    setDraft(q);
    setInputFlash((n) => n + 1);
    flash("ok", `✓ ${label} · 改完按 ⌘↩ 召集`);
  }

  // 侧栏展开状态 — 首次默认展开, 之后 localStorage 记住
  const [expanded, setExpanded] = useState<boolean>(() => {
    if (typeof window === "undefined") return true;
    // 窄屏 (< 768px) 默认折叠, 不管 localStorage
    if (window.matchMedia("(max-width: 767px)").matches) return false;
    const saved = window.localStorage.getItem(SIDEBAR_STORAGE_KEY);
    if (saved === null) return true; // 首次默认展开
    return saved === "1";
  });

  // 监听窗口尺寸变化 — 跨过 768 阈值时自动折叠/展开
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(max-width: 767px)");
    function onChange(e: MediaQueryListEvent) {
      if (e.matches) {
        setExpanded(false); // 进窄屏强制折叠
      }
      // 出窄屏不自动展开 — 尊重用户意图 (可能他在大屏也喜欢折叠)
    }
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  function toggleSidebar() {
    setExpanded((e) => {
      const next = !e;
      try {
        window.localStorage.setItem(SIDEBAR_STORAGE_KEY, next ? "1" : "0");
      } catch {
        /* ignore */
      }
      return next;
    });
  }

  function flash(tone: "ok" | "warn" | "err", text: string, ms = 5000) {
    setToast({ tone, text });
    window.setTimeout(() => setToast(null), ms);
  }

  // 同步 prefill (URL 进来的 ?q=)
  useEffect(() => {
    if (prefillQuestion) setDraft(prefillQuestion);
  }, [prefillQuestion]);

  // 全局快捷键: ⌘/ 折叠 sidebar (类似 ChatGPT 的 ⌘B); ESC 议会完成后重置
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "/") {
        e.preventDefault();
        toggleSidebar();
        return;
      }
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

  async function submit() {
    const q = draft.trim();
    if (!q) return;
    if (isBusy || pendingCmd) return;

    // —— 解析斜杠命令 ——
    if (q.startsWith("/capture")) {
      const body = q.replace(/^\/capture\s*/, "").trim();
      if (!body) {
        // 没正文 → 跳到独立 capture 视图
        onModeChange("capture");
        return;
      }
      setPendingCmd("capture");
      try {
        const r = await api.command({
          type: "capture",
          args: { body, title: body.slice(0, 30) },
        });
        if (r.ok) {
          flash("ok", `✓ 已 capture (${r.run_id?.slice(0, 24)}…), 摄入完成后查看「对话」`);
          setDraft("");
        } else {
          flash("err", `capture 失败: ${r.error}`);
        }
      } catch (err) {
        flash("err", `capture 失败: ${String(err)}`);
      } finally {
        setPendingCmd(null);
      }
      return;
    }

    if (q.startsWith("/refine")) {
      const personaRef = q.replace(/^\/refine\s*/, "").trim() || undefined;
      setPendingCmd("refine");
      flash("ok", "refine 进行中… (调 LLM 大约 30s, 别关页面)", 60000);
      try {
        const r = await api.command({
          type: "refine",
          args: personaRef ? { persona_ref: personaRef } : {},
        });
        if (r.ok) {
          const res = r.result as
            | { processed: number; applied: number; drafted: number; skipped: number }
            | undefined;
          flash(
            "ok",
            res
              ? `✓ refine 完毕 — 处理 ${res.processed}, 采纳 ${res.applied}, 草稿 ${res.drafted}, 跳过 ${res.skipped}`
              : "✓ refine 完毕",
            8000,
          );
          setDraft("");
        } else {
          flash("err", `refine 失败: ${r.error}`);
        }
      } catch (err) {
        flash("err", `refine 失败: ${String(err)}`);
      } finally {
        setPendingCmd(null);
      }
      return;
    }

    // —— 默认: 召集议会 ——
    onConvene(q);
  }

  const sidebarWidth = expanded ? 240 : 64;

  return (
    <div className="flex h-full w-full">
      {/* ═══════════ Cmd+K 全局检索 ═══════════ */}
      <CommandPalette
        onOpenAsset={(t) => setViewerTarget(t)}
        onModeChange={onModeChange}
      />

      {/* ═══════════ 资产查看器 (transcript / session / skill / persona) ═══════════ */}
      <AssetViewer
        target={viewerTarget}
        onClose={() => setViewerTarget(null)}
        onPrefill={(q) => prefillWithFeedback(q)}
      />

      {/* ═══════════ 全高 Sidebar ═══════════ */}
      <aside
        className="flex shrink-0 flex-col border-r border-amber-dim/15 bg-ink-deep/60 backdrop-blur transition-[width] duration-200 ease-out"
        style={{ width: sidebarWidth }}
      >
        {/* —— 顶部品牌 + 折叠按钮 —— */}
        <div className="flex h-14 shrink-0 items-center justify-between border-b border-amber-dim/15 px-3">
          <button
            type="button"
            onClick={() => onModeChange("council")}
            className="flex items-center gap-2 text-amber-glow transition-opacity hover:opacity-80"
            title="Council 主页"
          >
            <span className="text-xl leading-none">🕯️</span>
            <AnimatePresence initial={false}>
              {expanded && (
                <motion.span
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -8 }}
                  transition={{ duration: 0.15 }}
                  className="font-serif text-sm font-medium tracking-wider"
                >
                  Council
                </motion.span>
              )}
            </AnimatePresence>
          </button>
          <button
            type="button"
            onClick={toggleSidebar}
            className="flex h-7 w-7 items-center justify-center rounded-md text-parchment/40 transition-colors hover:bg-amber-dim/[0.08] hover:text-amber-glow"
            title={expanded ? "收起侧栏 (⌘/)" : "展开侧栏 (⌘/)"}
            aria-label={expanded ? "收起侧栏" : "展开侧栏"}
          >
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none">
              {expanded ? (
                // 收起 icon: 双箭头向左
                <path d="M 14 6 L 8 12 L 14 18 M 18 6 L 18 18" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
              ) : (
                // 展开 icon: 双箭头向右
                <path d="M 10 6 L 16 12 L 10 18 M 6 6 L 6 18" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
              )}
            </svg>
          </button>
        </div>

        {/* —— 全局检索按钮 (⌘K) —— */}
        <button
          type="button"
          onClick={() => {
            // 派一个虚拟 ⌘K 事件给 CommandPalette 监听器
            window.dispatchEvent(
              new KeyboardEvent("keydown", {
                key: "k",
                metaKey: true,
                ctrlKey: false,
                bubbles: true,
              }),
            );
          }}
          title={!expanded ? "搜索 (⌘K)" : undefined}
          className="group mx-3 mt-3 flex h-9 items-center gap-3 rounded-lg border border-amber-dim/20 bg-ink-soft/40 px-3 text-parchment/45 transition-colors hover:border-amber-dim/40 hover:bg-amber-dim/[0.06] hover:text-amber-glow/85"
        >
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" className="shrink-0">
            <circle cx="11" cy="11" r="6" stroke="currentColor" strokeWidth="1.6" />
            <path d="M 16 16 L 20 20" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
          <AnimatePresence initial={false}>
            {expanded && (
              <motion.span
                initial={{ opacity: 0, x: -6 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -6 }}
                transition={{ duration: 0.12 }}
                className="flex flex-1 items-center justify-between text-[12px]"
              >
                <span>搜索</span>
                <kbd className="rounded border border-amber-dim/30 bg-ink-deep/60 px-1.5 py-0.5 text-[9px] tracking-wider text-parchment/50">
                  ⌘K
                </kbd>
              </motion.span>
            )}
          </AnimatePresence>
        </button>

        {/* —— 模式切换 (议会 / 捕获) —— */}
        <div className="mt-2 border-b border-amber-dim/10 py-2">
          {SIDEBAR_MODES.map((m) => {
            const active = mode === m.key;
            return (
              <SidebarItem
                key={m.key}
                active={active}
                expanded={expanded}
                onClick={() => onModeChange(m.key)}
                label={m.label}
                glyph={m.glyph}
                accent
              />
            );
          })}
        </div>

        {/* —— 资产 filter (仅在议会模式下显示) —— */}
        {mode === "council" && (
          <>
            {expanded && (
              <div className="px-4 pt-4 pb-1.5 text-[10px] tracking-[0.18em] text-parchment/30">
                资产
              </div>
            )}
            <nav className="flex-1 overflow-y-auto py-1">
              {SIDEBAR_FILTERS.map((it) => {
                const active = !inConvene && filter === it.key;
                const disabled = inConvene && !finished;
                return (
                  <SidebarItem
                    key={it.key}
                    active={active}
                    disabled={disabled}
                    expanded={expanded}
                    onClick={() => {
                      if (inConvene && finished) {
                        reset();
                        setDraft("");
                      }
                      setFilter(it.key);
                    }}
                    label={it.label}
                    glyph={it.glyph}
                  />
                );
              })}
            </nav>
          </>
        )}
        {/* capture 模式时占位填充 */}
        {mode === "capture" && <div className="flex-1" />}

        {/* —— 底部状态 + 主题 + 版本 —— */}
        <div className="shrink-0 border-t border-amber-dim/10 px-3 py-2">
          <ConnectionPill state={connection} expanded={expanded} />
          <ThemePill expanded={expanded} />
          {expanded && (
            <div className="mt-1 px-1 text-[9px] tracking-[0.25em] text-parchment/30">
              v0.3 · NODE-NATIVE
            </div>
          )}
        </div>
      </aside>

      {/* ═══════════ 主内容区 ═══════════ */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* —— 主区: capture 模式渲染 children, 议会模式渲染 Feed/Trace —— */}
        <main className="relative min-h-0 flex-1 overflow-hidden">
          {mode === "capture" ? (
            <div className="absolute inset-0 overflow-y-auto scroll-thin">
              {children}
            </div>
          ) : (
            <AnimatePresence mode="wait">
              {inConvene ? (
                <motion.div
                  key="trace"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
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
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.18 }}
                  className="absolute inset-0"
                >
                  <AssetFeed
                    filter={filter}
                    onConvene={onConvene}
                    onReplay={onReplay}
                    onPrefill={(q) => prefillWithFeedback(q)}
                    onOpenAsset={(t) => setViewerTarget(t)}
                  />
                </motion.div>
              )}
            </AnimatePresence>
          )}
        </main>

        {/* —— 底部输入框 (capture 模式有自己的输入, 不显示这个) —— */}
        {mode === "council" && (
        <div className="relative shrink-0 border-t border-amber-dim/15 bg-ink/60 px-4 py-4 backdrop-blur md:px-8">
          <AnimatePresence>
            {toast && (
              <motion.div
                key={toast.text}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 12 }}
                transition={{ duration: 0.18 }}
                className={`pointer-events-none absolute -top-12 left-1/2 z-30 -translate-x-1/2 rounded-full border px-4 py-2 text-[12px] tracking-wide backdrop-blur ${
                  toast.tone === "ok"
                    ? "border-amber-glow/40 bg-amber-dim/[0.18] text-amber-glow"
                    : toast.tone === "warn"
                      ? "border-amber-warm/40 bg-amber-warm/[0.12] text-amber-warm"
                      : "border-orange-500/40 bg-orange-900/30 text-orange-300"
                }`}
              >
                {toast.text}
              </motion.div>
            )}
          </AnimatePresence>
          <div className="mx-auto max-w-5xl">
            {inConvene && !finished ? (
              <LockedInputBar />
            ) : (
              <ActiveInputBar
                value={draft}
                onChange={setDraft}
                onSubmit={submit}
                disabled={isBusy || !!pendingCmd}
                busyLabel={pendingCmd ?? null}
                flashTick={inputFlash}
                hint={
                  finished
                    ? "议会已结束 · 按 ESC 或点击侧栏返回 · 或问下一个问题"
                    : undefined
                }
              />
            )}
          </div>
        </div>
        )}
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────
// 一个 sidebar 行 — 自动适配展开/折叠
// ──────────────────────────────────────────────────────────────
function SidebarItem({
  active,
  disabled,
  expanded,
  onClick,
  label,
  glyph,
  accent,
}: {
  active: boolean;
  disabled?: boolean;
  expanded: boolean;
  onClick: () => void;
  label: string;
  glyph: React.ReactNode;
  /** 是否模式 toggle (略不同的强调) */
  accent?: boolean;
}) {
  const baseInactive = accent
    ? "text-parchment/55 hover:text-amber-glow hover:bg-amber-dim/[0.06]"
    : "text-parchment/45 hover:text-amber-glow/85 hover:bg-amber-dim/[0.05]";
  const baseActive = accent
    ? "text-amber-glow bg-amber-dim/[0.10]"
    : "text-amber-glow bg-amber-dim/[0.08]";

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={!expanded ? label : undefined}
      className={`group relative flex h-10 w-full items-center gap-3 px-4 text-left transition-colors ${
        active ? baseActive : baseInactive
      } ${disabled ? "cursor-not-allowed opacity-30" : ""}`}
    >
      {/* 左侧 active 指示条 */}
      {active && (
        <span className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r bg-amber-glow shadow-[0_0_8px_rgba(232,181,99,0.5)]" />
      )}
      <span className="flex h-5 w-5 shrink-0 items-center justify-center">
        {glyph}
      </span>
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.span
            initial={{ opacity: 0, x: -6 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -6 }}
            transition={{ duration: 0.12 }}
            className="truncate text-[13px] font-medium tracking-wide"
          >
            {label}
          </motion.span>
        )}
      </AnimatePresence>
      {/* disabled 状态加 🔒 — 议会进行中切换 filter 视觉反馈更明确 */}
      {disabled && expanded && (
        <span className="ml-auto text-[10px] text-parchment/30" aria-hidden>🔒</span>
      )}
    </button>
  );
}

// ──────────────────────────────────────────────────────────────
// 连接状态 — 替代以前右上角浮的 ConnectionBadge
// ──────────────────────────────────────────────────────────────
function ConnectionPill({
  state,
  expanded,
}: {
  state: string;
  expanded: boolean;
}) {
  // 重新映射: "offline" 是 WS 连接状态, 不是 server 状态。
  // 没在议会中时不显示焦虑文案 — 改成"待召集"。
  const cfg: Record<string, { label: string; color: string; pulse?: boolean }> = {
    offline: { label: "待召集", color: "bg-parchment/40" },
    connecting: { label: "连接中", color: "bg-amber-warm", pulse: true },
    live: { label: "已连通", color: "bg-amber-glow", pulse: true },
    mock: { label: "Mock 模式", color: "bg-amber-warm" },
  };
  const c = cfg[state] ?? cfg.offline;

  return (
    <div
      className={`flex items-center gap-2 px-2 py-1.5 ${
        expanded ? "" : "justify-center"
      }`}
      title={
        !expanded ? `状态: ${c.label}` : undefined
      }
    >
      <span className="relative flex h-2 w-2 shrink-0">
        {c.pulse && (
          <span className={`absolute inset-0 animate-ping rounded-full ${c.color} opacity-60`} />
        )}
        <span className={`relative h-2 w-2 rounded-full ${c.color}`} />
      </span>
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.span
            initial={{ opacity: 0, x: -4 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -4 }}
            transition={{ duration: 0.12 }}
            className="truncate text-[11px] tracking-wider text-parchment/55"
          >
            {c.label}
          </motion.span>
        )}
      </AnimatePresence>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────
// 主题切换 (system → light → dark 三态循环)
// ──────────────────────────────────────────────────────────────
function ThemePill({ expanded }: { expanded: boolean }) {
  const { pref, resolved, cycle } = useTheme();
  const labelMap: Record<string, string> = {
    system: "跟随系统",
    light: "浅色",
    dark: "深色",
  };
  const icon = (() => {
    if (pref === "system") {
      // 半月: 跟随系统
      return (
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none">
          <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="1.5" />
          <path d="M 12 4 A 8 8 0 0 1 12 20 Z" fill="currentColor" />
        </svg>
      );
    }
    if (resolved === "light") {
      // 太阳
      return (
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none">
          <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="1.6" fill="currentColor" fillOpacity="0.3" />
          <line x1="12" y1="3" x2="12" y2="5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          <line x1="12" y1="19" x2="12" y2="21" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          <line x1="3" y1="12" x2="5" y2="12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          <line x1="19" y1="12" x2="21" y2="12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          <line x1="5.5" y1="5.5" x2="6.9" y2="6.9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          <line x1="17.1" y1="17.1" x2="18.5" y2="18.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          <line x1="5.5" y1="18.5" x2="6.9" y2="17.1" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          <line x1="17.1" y1="6.9" x2="18.5" y2="5.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      );
    }
    // 月亮
    return (
      <svg viewBox="0 0 24 24" width="14" height="14" fill="none">
        <path
          d="M 20 14 A 8 8 0 1 1 10 4 A 6 6 0 0 0 20 14 Z"
          stroke="currentColor"
          strokeWidth="1.6"
          fill="currentColor"
          fillOpacity="0.3"
        />
      </svg>
    );
  })();

  return (
    <button
      type="button"
      onClick={cycle}
      title={`主题: ${labelMap[pref]} (点击切换)`}
      className={`flex items-center gap-2 rounded px-2 py-1.5 text-parchment/55 transition-colors hover:bg-amber-dim/[0.08] hover:text-amber-glow ${
        expanded ? "w-full" : "justify-center"
      }`}
    >
      <span className="shrink-0">{icon}</span>
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.span
            initial={{ opacity: 0, x: -4 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -4 }}
            transition={{ duration: 0.12 }}
            className="truncate text-[11px] tracking-wider"
          >
            {labelMap[pref]}
          </motion.span>
        )}
      </AnimatePresence>
    </button>
  );
}

// ──────────────────────────────────────────────────────────────
// 输入框
// ──────────────────────────────────────────────────────────────
function ActiveInputBar({
  value,
  onChange,
  onSubmit,
  disabled,
  busyLabel,
  hint,
  flashTick,
}: {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  disabled: boolean;
  busyLabel: string | null;
  hint?: string;
  /** 每次自增触发输入框 focus + 闪光动画 (用于"已 prefill 反馈") */
  flashTick?: number;
}) {
  const taRef = useRef<HTMLTextAreaElement>(null);
  const [isFlashing, setIsFlashing] = useState(false);

  // —— flashTick 自增 → focus + 高亮闪一下 ——
  useEffect(() => {
    if (!flashTick) return;
    taRef.current?.focus();
    // 把光标放到末尾
    const ta = taRef.current;
    if (ta) {
      ta.setSelectionRange(ta.value.length, ta.value.length);
    }
    setIsFlashing(true);
    const t = setTimeout(() => setIsFlashing(false), 1100);
    return () => clearTimeout(t);
  }, [flashTick]);

  const isCapture = value.trimStart().startsWith("/capture");
  const isRefine = value.trimStart().startsWith("/refine");
  const verb = isCapture ? "capture" : isRefine ? "refine" : "convene";
  const verbLabel: Record<string, string> = {
    convene: "⌘↩  召集议会",
    capture: "⌘↩  捕获",
    refine: "⌘↩  深化 self persona",
  };

  // —— 斜杠命令 picker — 输入 / 时显示, 选择后插入命令 ——
  // 触发条件: 当前 value 整段就是 "/" 或 以 "/" 开头但还没匹配到完整 /capture / /refine
  const trimmed = value.trimStart();
  const showSlashPicker =
    trimmed === "/" ||
    (trimmed.startsWith("/") &&
      !trimmed.startsWith("/capture") &&
      !trimmed.startsWith("/refine") &&
      !trimmed.includes(" "));
  const [slashIdx, setSlashIdx] = useState(0);

  const slashCommands = [
    {
      key: "capture",
      label: "/capture",
      desc: "捕获一段文本作为 session (并自动蒸馏高光)",
      template: "/capture ",
    },
    {
      key: "refine",
      label: "/refine",
      desc: "深化已有 self persona (LLM 用最新对话补强)",
      template: "/refine ",
    },
  ];
  // 按当前输入过滤
  const filteredSlash = slashCommands.filter((c) =>
    c.label.startsWith(trimmed),
  );
  function pickSlash(i: number) {
    const cmd = filteredSlash[i];
    if (!cmd) return;
    onChange(cmd.template);
    setSlashIdx(0);
    // focus 留在 textarea, 光标到末尾
    setTimeout(() => {
      taRef.current?.focus();
      const ta = taRef.current;
      if (ta) ta.setSelectionRange(ta.value.length, ta.value.length);
    }, 0);
  }
  // 重置 slashIdx 当 value 变化超出 picker 范围
  useEffect(() => {
    if (showSlashPicker) setSlashIdx(0);
  }, [showSlashPicker]);

  return (
    <div
      className={`relative rounded-2xl border bg-ink-soft/60 px-4 py-3 transition-all focus-within:border-amber-dim/60 focus-within:bg-ink-soft/80 ${
        isFlashing
          ? "border-amber-glow/70 shadow-[0_0_24px_rgba(232,181,99,0.45)]"
          : "border-amber-dim/30"
      }`}
    >
      {/* 斜杠命令 picker — 浮在输入框正上方 */}
      <AnimatePresence>
        {showSlashPicker && filteredSlash.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 6 }}
            transition={{ duration: 0.12 }}
            className="absolute -top-2 left-0 right-0 z-20 mx-auto -translate-y-full overflow-hidden rounded-xl border border-amber-dim/40 bg-ink-deep/95 shadow-[0_8px_28px_rgba(0,0,0,0.5)] backdrop-blur"
          >
            <div className="border-b border-amber-dim/15 px-3 py-1.5 text-[10px] tracking-[0.18em] text-parchment/35">
              斜杠命令
            </div>
            {filteredSlash.map((c, i) => {
              const active = i === slashIdx;
              return (
                <button
                  key={c.key}
                  type="button"
                  onMouseEnter={() => setSlashIdx(i)}
                  onClick={() => pickSlash(i)}
                  className={`flex w-full items-center gap-3 px-3 py-2 text-left transition-colors ${
                    active
                      ? "bg-amber-dim/[0.12] text-amber-glow"
                      : "text-parchment/80 hover:bg-amber-dim/[0.06]"
                  }`}
                >
                  <span className="font-mono text-[13px]">{c.label}</span>
                  <span
                    className={`flex-1 truncate text-[11px] ${
                      active ? "text-amber-glow/70" : "text-parchment/40"
                    }`}
                  >
                    {c.desc}
                  </span>
                  {active && (
                    <kbd className="rounded border border-amber-glow/40 bg-amber-dim/[0.2] px-1.5 py-0.5 text-[9px] tracking-wider text-amber-glow/85">
                      ↹/↵
                    </kbd>
                  )}
                </button>
              );
            })}
            <div className="border-t border-amber-dim/15 px-3 py-1 text-[9px] tracking-wider text-parchment/30">
              ↑↓ 选 · ↹ Tab 或 ↵ Enter 插入 · Esc 关
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <textarea
        ref={taRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          // 斜杠 picker 优先处理键盘
          if (showSlashPicker && filteredSlash.length > 0) {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setSlashIdx((i) => Math.min(i + 1, filteredSlash.length - 1));
              return;
            }
            if (e.key === "ArrowUp") {
              e.preventDefault();
              setSlashIdx((i) => Math.max(i - 1, 0));
              return;
            }
            if (e.key === "Tab" || (e.key === "Enter" && !e.metaKey && !e.ctrlKey)) {
              e.preventDefault();
              pickSlash(slashIdx);
              return;
            }
            if (e.key === "Escape") {
              e.preventDefault();
              onChange("");
              return;
            }
          }
          if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
            e.preventDefault();
            onSubmit();
          }
        }}
        placeholder={hint ?? "你面前有什么决定?  输入 / 看命令"}
        rows={2}
        className="w-full resize-none bg-transparent font-serif text-[15px] italic leading-relaxed text-parchment/90 placeholder:font-sans placeholder:not-italic placeholder:text-parchment/30 focus:outline-none"
      />
      <div className="mt-1 flex items-center justify-between gap-3 text-[10px] text-parchment/35">
        <div className="flex min-w-0 items-center gap-3">
          <span
            className={`shrink-0 ${verb !== "convene" ? "text-amber-glow/80" : ""}`}
          >
            {verbLabel[verb]}
          </span>
          {busyLabel ? (
            <>
              <span className="text-parchment/15">·</span>
              <span className="truncate text-amber-warm/80">
                <span className="mr-1 inline-block h-1 w-1 rounded-full bg-amber-warm animate-flicker" />
                {busyLabel} 进行中…
              </span>
            </>
          ) : (
            <>
              <span className="text-parchment/15">·</span>
              <span className="hidden truncate sm:inline">
                斜杠命令: <span className="text-amber-glow/55">/capture</span>
                <span className="mx-1 text-parchment/15">/</span>
                <span className="text-amber-glow/55">/refine</span>
              </span>
            </>
          )}
        </div>
        <button
          type="button"
          onClick={onSubmit}
          disabled={disabled || !value.trim()}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-glow text-ink shadow-[0_0_18px_rgba(232,181,99,0.4)] transition-transform hover:scale-105 active:scale-95 disabled:cursor-not-allowed disabled:bg-amber-dim/50 disabled:shadow-none"
          aria-label={verb === "capture" ? "捕获" : verb === "refine" ? "深化" : "召集"}
        >
          {verb === "refine" ? (
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M 2 7 A 5 5 0 1 1 7 12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" fill="none" />
              <path d="M 4 12 L 7 12 L 7 9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" fill="none" />
            </svg>
          ) : verb === "capture" ? (
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <rect x="2" y="3" width="10" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.8" />
              <circle cx="7" cy="7" r="1.8" fill="currentColor" />
            </svg>
          ) : (
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M 7 12 L 7 2 M 3 6 L 7 2 L 11 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
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
        议会完成后按 ESC 切回 default
      </div>
    </div>
  );
}
