import { useEffect, useRef, useState } from "react";
import { api, type SessionRow, type SkillRow, type TranscriptRow, type PersonaRow } from "@/lib/api";

type FilterType = "all" | "sessions" | "skills" | "personas" | "transcripts";

interface FeedItem {
  kind: "session" | "transcript" | "persona" | "skill";
  ts: string;
  data: SessionRow | TranscriptRow | PersonaRow | SkillRow;
}

interface Props {
  filter: FilterType;
  onConvene?: (q: string) => void;
  /** 把问题塞回输入框, 让用户改后再召集 (UX 改进: 不一键直接 convene) */
  onPrefill?: (q: string) => void;
}

export function AssetFeed({ filter, onConvene, onPrefill }: Props) {
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [transcripts, setTranscripts] = useState<TranscriptRow[]>([]);
  const [personas, setPersonas] = useState<PersonaRow[]>([]);
  const [skills, setSkills] = useState<SkillRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadTick, setReloadTick] = useState(0);

  useEffect(() => {
    let cancel = false;
    setLoading(true);
    Promise.all([
      api.sessions().catch(() => []),
      api.transcripts().catch(() => []),
      api.personas().catch(() => []),
      api.skills().catch(() => []),
    ]).then(([s, t, p, sk]) => {
      if (cancel) return;
      setSessions(s);
      setTranscripts(t);
      setPersonas(p);
      setSkills(sk);
      setLoading(false);
    }).catch((e) => {
      if (cancel) return;
      setError(String(e));
      setLoading(false);
    });
    return () => {
      cancel = true;
    };
  }, [reloadTick]);

  // 归档完后重拉列表
  function reload() {
    setReloadTick((t) => t + 1);
  }

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center text-parchment/40 text-sm tracking-wider">
        加载中…
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full items-center justify-center text-amber-warm/60 text-sm">
        无法连接到 Council 服务: {error}
      </div>
    );
  }

  // Build mixed feed sorted by recency.
  const items: FeedItem[] = [];
  if (filter === "all" || filter === "transcripts") {
    transcripts.forEach((t) => items.push({ kind: "transcript", ts: t.convened_at, data: t }));
  }
  if (filter === "all" || filter === "sessions") {
    sessions.forEach((s) => items.push({ kind: "session", ts: s.captured_at, data: s }));
  }
  if (filter === "personas") {
    personas.forEach((p) =>
      items.push({ kind: "persona", ts: new Date().toISOString(), data: p }),
    );
  }
  if (filter === "skills") {
    skills.forEach((sk) =>
      items.push({ kind: "skill", ts: new Date().toISOString(), data: sk }),
    );
  }
  items.sort((a, b) => (a.ts < b.ts ? 1 : -1));

  const headline =
    filter === "all"
      ? "最近的思考资产"
      : filter === "sessions"
        ? "捕获的对话"
        : filter === "transcripts"
          ? "议会记录"
          : filter === "personas"
            ? "你的思考人格"
            : "蒸馏出的高光";

  const subtitle =
    filter === "all"
      ? "点击侧栏切换视角 · 在底部输入框开始一次议会"
      : filter === "sessions"
        ? `${sessions.length} 段对话已沉淀`
        : filter === "transcripts"
          ? `${transcripts.length} 次议会决策`
          : filter === "personas"
            ? `${personas.length} 个 persona 在召之即来`
            : `${skills.length} 个思考片段可追溯`;

  return (
    <div className="mx-auto h-full w-full max-w-5xl overflow-y-auto scroll-thin px-8 pb-8 pt-12">
      <h1 className="mb-1 font-serif text-2xl italic text-amber-glow">
        {headline}
      </h1>
      <div className="mb-8 text-xs tracking-wider text-parchment/40">
        {subtitle}
      </div>

      {items.length === 0 && (
        <div className="rounded-xl border border-dashed border-amber-dim/30 bg-ink-soft/30 p-12 text-center text-sm text-parchment/40">
          暂无内容. 在底部输入框打字开始第一次议会, 或用 CLI 执行 capture.
        </div>
      )}

      <div className="space-y-4">
        {items.map((item) => (
          <FeedCard
            key={`${item.kind}-${
              item.kind === "transcript" || item.kind === "session"
                ? (item.data as { id: string }).id
                : item.kind === "persona"
                  ? (item.data as PersonaRow).ref
                  : (item.data as SkillRow).id
            }`}
            item={item}
            onConvene={onConvene}
            onPrefill={onPrefill}
            onArchived={reload}
          />
        ))}
      </div>
    </div>
  );
}

function FeedCard({
  item,
  onConvene,
  onPrefill,
  onArchived,
}: {
  item: FeedItem;
  onConvene?: (q: string) => void;
  onPrefill?: (q: string) => void;
  onArchived?: () => void;
}) {
  // 卡片右上角 … 菜单 (transcripts / sessions 才有)
  const menuActions = (() => {
    if (item.kind === "transcript") {
      const t = item.data as TranscriptRow;
      const url = `${window.location.origin}/?run_id=${encodeURIComponent(t.id)}&q=${encodeURIComponent(t.question)}`;
      return [
        { label: "复制分享链接", onClick: () => { void navigator.clipboard.writeText(url); } },
        { label: "复制问题", onClick: () => { void navigator.clipboard.writeText(t.question); } },
        { label: "归档此议会", danger: true, onClick: async () => {
          if (!window.confirm(`确定归档议会 "${t.question.slice(0, 30)}…"?\n\n文件会被移到 transcripts/_archive/, 不会真删除。`)) return;
          const r = await api.archiveTranscript(t.id);
          if (r.ok) onArchived?.();
          else window.alert(`归档失败: ${r.error}`);
        }},
      ];
    }
    if (item.kind === "session") {
      const s = item.data as SessionRow;
      return [
        { label: "复制 ID", onClick: () => { void navigator.clipboard.writeText(s.id); } },
        { label: "归档此对话", danger: true, onClick: async () => {
          if (!window.confirm(`确定归档对话 "${s.title || s.id}"?\n\n文件会被移到 sessions/_archive/, 不会真删除。`)) return;
          const r = await api.archiveSession(s.id);
          if (r.ok) onArchived?.();
          else window.alert(`归档失败: ${r.error}`);
        }},
      ];
    }
    return [];
  })();

  if (item.kind === "transcript") {
    const t = item.data as TranscriptRow;
    return (
      <div className="group relative overflow-hidden rounded-xl border border-amber-dim/20 bg-gradient-to-b from-ink-soft to-ink-deep p-5 transition-all duration-200 hover:-translate-y-0.5 hover:border-amber-dim/50 hover:shadow-[0_4px_20px_rgba(0,0,0,0.4),0_0_0_1px_rgba(232,181,99,0.08)]">
        {menuActions.length > 0 && <CardMenu actions={menuActions} />}
        <div className="mb-2 flex items-center gap-3">
          <ChipTag label="CONVENE" tone="ember" />
          <span
            className="text-[10px] tracking-wider text-parchment/30"
            title={new Date(t.convened_at).toLocaleString("zh-CN")}
          >
            {fmtDate(t.convened_at)}
          </span>
        </div>
        <h3
          className="mb-3 overflow-hidden font-serif text-lg leading-snug text-parchment/90"
          style={{
            display: "-webkit-box",
            WebkitLineClamp: 3,
            WebkitBoxOrient: "vertical",
          }}
        >
          {t.question}
        </h3>
        <div className="mb-3 flex flex-wrap gap-2 text-[11px] text-parchment/50">
          {t.personas.map((p) => (
            <span
              key={p}
              className="rounded-full border border-amber-dim/30 px-2 py-0.5"
            >
              {p}
            </span>
          ))}
        </div>
        <div className="flex items-center gap-3 text-[11px] tracking-wider">
          {onPrefill && (
            <button
              type="button"
              onClick={() => onPrefill(t.question)}
              className="text-amber-glow/60 transition-colors hover:text-amber-glow"
              title="把问题填进输入框 (可改后再召集)"
            >
              ↻ 改一改再问
            </button>
          )}
          {onConvene && (
            <button
              type="button"
              onClick={() => onConvene(t.question)}
              className="text-parchment/40 transition-colors hover:text-amber-glow"
              title="原样再召集一次"
            >
              ⟳ 原样重开
            </button>
          )}
        </div>
      </div>
    );
  }

  if (item.kind === "session") {
    const s = item.data as SessionRow;
    return (
      <div className="group relative overflow-hidden rounded-xl border border-amber-dim/20 bg-gradient-to-b from-ink-soft to-ink-deep p-5 transition-all duration-200 hover:-translate-y-0.5 hover:border-amber-dim/50 hover:shadow-[0_4px_20px_rgba(0,0,0,0.4),0_0_0_1px_rgba(232,181,99,0.08)]">
        {menuActions.length > 0 && <CardMenu actions={menuActions} />}
        <div className="mb-2 flex items-center gap-3">
          <ChipTag label="CAPTURE" tone="warm" />
          <span
            className="text-[10px] tracking-wider text-parchment/30"
            title={new Date(s.captured_at).toLocaleString("zh-CN")}
          >
            {fmtDate(s.captured_at)}
          </span>
        </div>
        <h3 className="mb-1 text-base text-parchment/85">
          {s.title || s.id}
        </h3>
        <div className="text-[11px] text-parchment/40">
          {s.distilled
            ? `${s.highlight_count} 个高光蒸馏 · 来源 ${s.source}`
            : `未蒸馏 · 来源 ${s.source}`}
        </div>
      </div>
    );
  }

  if (item.kind === "persona") {
    const p = item.data as PersonaRow;
    return (
      <div className="group relative overflow-hidden rounded-xl border border-amber-dim/20 bg-gradient-to-b from-ink-soft to-ink-deep p-5 transition-all duration-200 hover:-translate-y-0.5 hover:border-amber-dim/50 hover:shadow-[0_4px_20px_rgba(0,0,0,0.4),0_0_0_1px_rgba(232,181,99,0.08)]">
        <div className="mb-2 flex items-center gap-3">
          <ChipTag
            label={p.type.toUpperCase()}
            tone={p.type === "self" ? "warm" : p.type === "mentor" ? "ember" : "dim"}
          />
          {p.confidence && (
            <span className="text-[10px] tracking-wider text-parchment/30">
              conf {p.confidence.toFixed(2)}
            </span>
          )}
        </div>
        <h3 className="mb-1 text-base font-medium text-parchment/85">
          {p.ref}
        </h3>
        <div className="text-[12px] leading-relaxed text-parchment/55">
          {p.description}
        </div>
      </div>
    );
  }

  if (item.kind === "skill") {
    const sk = item.data as SkillRow;
    return (
      <div className="group relative overflow-hidden rounded-xl border border-amber-dim/20 bg-gradient-to-b from-ink-soft to-ink-deep p-5 transition-all duration-200 hover:-translate-y-0.5 hover:border-amber-dim/50 hover:shadow-[0_4px_20px_rgba(0,0,0,0.4),0_0_0_1px_rgba(232,181,99,0.08)]">
        <div className="mb-2 flex items-center gap-3">
          <ChipTag label={sk.type.toUpperCase().replace(/-/g, " ")} tone="dim" />
          <span className="text-[10px] tracking-wider text-parchment/30">
            conf {sk.confidence.toFixed(2)}
          </span>
        </div>
        <h3 className="mb-1 text-base text-parchment/85">{sk.title}</h3>
        <div className="text-[11px] text-parchment/40">
          来源 {sk.source_session}
          {sk.promoted_to_persona && (
            <span className="ml-2 text-amber-glow/60">
              → {sk.promoted_to_persona}
            </span>
          )}
        </div>
      </div>
    );
  }

  return null;
}

function ChipTag({
  label,
  tone,
}: {
  label: string;
  tone: "warm" | "ember" | "dim";
}) {
  const toneClass =
    tone === "warm"
      ? "border-amber-warm/40 text-amber-warm/80"
      : tone === "ember"
        ? "border-amber-ember/40 text-amber-ember/85"
        : "border-amber-dim/30 text-parchment/50";
  return (
    <span
      className={`rounded-full border px-2 py-0.5 text-[10px] font-medium tracking-[0.15em] ${toneClass}`}
    >
      {label}
    </span>
  );
}

function fmtDate(iso: string): string {
  const d = new Date(iso);
  const now = Date.now();
  const diff = now - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "刚才";
  if (mins < 60) return `${mins} 分钟前`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} 小时前`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days} 天前`;
  return d.toLocaleDateString("zh-CN");
}

interface CardAction {
  label: string;
  onClick: () => void | Promise<void>;
  danger?: boolean;
}

/** 卡片右上角 … 菜单 — 复制/归档之类二级操作 */
function CardMenu({ actions }: { actions: CardAction[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // 点击外部关闭
  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  return (
    <div ref={ref} className="absolute right-3 top-3 z-10">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((o) => !o);
        }}
        className={`flex h-7 w-7 items-center justify-center rounded-md text-parchment/30 opacity-0 transition-all hover:bg-amber-dim/[0.1] hover:text-amber-glow group-hover:opacity-100 ${
          open ? "!opacity-100 bg-amber-dim/[0.08] text-amber-glow" : ""
        }`}
        aria-label="更多操作"
        title="更多操作"
      >
        <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
          <circle cx="6" cy="12" r="1.6" />
          <circle cx="12" cy="12" r="1.6" />
          <circle cx="18" cy="12" r="1.6" />
        </svg>
      </button>
      {open && (
        <div className="absolute right-0 top-9 min-w-[140px] overflow-hidden rounded-lg border border-amber-dim/30 bg-ink-deep/95 py-1 shadow-[0_8px_24px_rgba(0,0,0,0.5)] backdrop-blur">
          {actions.map((a, i) => (
            <button
              key={i}
              type="button"
              onClick={() => {
                setOpen(false);
                void a.onClick();
              }}
              className={`block w-full px-3 py-2 text-left text-[12px] transition-colors hover:bg-amber-dim/[0.12] ${
                a.danger ? "text-orange-300/80 hover:text-orange-200" : "text-parchment/75 hover:text-amber-glow"
              }`}
            >
              {a.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
