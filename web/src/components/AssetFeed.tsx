import { useEffect, useState } from "react";
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
}

export function AssetFeed({ filter, onConvene }: Props) {
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [transcripts, setTranscripts] = useState<TranscriptRow[]>([]);
  const [personas, setPersonas] = useState<PersonaRow[]>([]);
  const [skills, setSkills] = useState<SkillRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
  }, []);

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

      <div className="space-y-3">
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
          />
        ))}
      </div>
    </div>
  );
}

function FeedCard({
  item,
  onConvene,
}: {
  item: FeedItem;
  onConvene?: (q: string) => void;
}) {
  if (item.kind === "transcript") {
    const t = item.data as TranscriptRow;
    return (
      <div className="group relative overflow-hidden rounded-xl border border-amber-dim/20 bg-gradient-to-b from-ink-soft to-ink-deep p-5 transition-colors hover:border-amber-dim/40">
        <div className="mb-2 flex items-center gap-3">
          <ChipTag label="CONVENE" tone="ember" />
          <span className="text-[10px] tracking-wider text-parchment/30">
            {fmtDate(t.convened_at)}
          </span>
        </div>
        <h3
          className="mb-2 overflow-hidden font-serif text-lg leading-snug text-parchment/90"
          style={{
            display: "-webkit-box",
            WebkitLineClamp: 3,
            WebkitBoxOrient: "vertical",
          }}
        >
          {t.question}
        </h3>
        <div className="mb-2 flex flex-wrap gap-2 text-[11px] text-parchment/50">
          {t.personas.map((p) => (
            <span
              key={p}
              className="rounded-full border border-amber-dim/30 px-2 py-0.5"
            >
              {p}
            </span>
          ))}
        </div>
        {onConvene && (
          <button
            type="button"
            onClick={() => onConvene(t.question)}
            className="mt-2 text-[11px] tracking-wider text-amber-glow/70 hover:text-amber-glow"
          >
            ↻ 重新召集
          </button>
        )}
      </div>
    );
  }

  if (item.kind === "session") {
    const s = item.data as SessionRow;
    return (
      <div className="group relative overflow-hidden rounded-xl border border-amber-dim/20 bg-gradient-to-b from-ink-soft to-ink-deep p-5 transition-colors hover:border-amber-dim/40">
        <div className="mb-2 flex items-center gap-3">
          <ChipTag label="CAPTURE" tone="warm" />
          <span className="text-[10px] tracking-wider text-parchment/30">
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
      <div className="group relative overflow-hidden rounded-xl border border-amber-dim/20 bg-gradient-to-b from-ink-soft to-ink-deep p-5 transition-colors hover:border-amber-dim/40">
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
      <div className="group relative overflow-hidden rounded-xl border border-amber-dim/20 bg-gradient-to-b from-ink-soft to-ink-deep p-5 transition-colors hover:border-amber-dim/40">
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
