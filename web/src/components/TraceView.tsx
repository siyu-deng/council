import { useState, useRef, useEffect, forwardRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useCouncil } from "@/lib/store";
import type { SeatState } from "@/lib/store";
import type { CrossArrow, Phase, SynthesisJSON } from "@/lib/types";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// TraceView — 议会进行 / 已完成 时的可追溯视图
// 严格按 docs/design/web-layout-convening.svg 实现:
//  - 议题 + 召集理由 + mini roundtable
//  - 三段 PHASE (statements / cross-exam / synthesis), 各自可折叠
//  - 右下悬浮球 (FAB) 跳到任意 phase
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export function TraceView() {
  const question = useCouncil((s) => s.question);
  const phase = useCouncil((s) => s.phase);
  const seats = useCouncil((s) => s.seats);
  const seatOrder = useCouncil((s) => s.seatOrder);
  const arrows = useCouncil((s) => s.arrows);
  const synthesis = useCouncil((s) => s.synthesis);
  const synthBuf = useCouncil((s) => s.synthesisBuffer);
  const rationale = useCouncil((s) => s.rationale);
  const finished = useCouncil((s) => s.finished);

  // 折叠状态 — 默认 done 折叠, current 展开, pending 折叠
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({
    statements: false,
    cross: false,
    synthesis: false,
  });

  // 当 phase 进入 cross / synthesis 时, 自动折叠之前的 phase
  useEffect(() => {
    if (phase === "cross") {
      setCollapsed((c) => ({ ...c, statements: true }));
    } else if (phase === "synthesis") {
      setCollapsed((c) => ({ ...c, statements: true, cross: true }));
    }
  }, [phase]);

  const phaseRefs = {
    statements: useRef<HTMLDivElement>(null),
    cross: useRef<HTMLDivElement>(null),
    synthesis: useRef<HTMLDivElement>(null),
  };

  function toggle(key: keyof typeof collapsed) {
    setCollapsed((c) => ({ ...c, [key]: !c[key] }));
  }

  function jumpTo(key: keyof typeof phaseRefs) {
    setCollapsed((c) => ({ ...c, [key]: false }));
    setTimeout(() => {
      phaseRefs[key].current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }, 80);
  }

  // 状态推导. 注意: 空数组 .every() 返回 true, 必须检查 length > 0.
  const allSeats = seatOrder.map((ref) => seats[ref]).filter(Boolean) as SeatState[];
  const hasSeats = allSeats.length > 0;
  const statementsCount = allSeats.filter((s) => s.finalized.statement).length;
  const crossesCount = allSeats.filter((s) => s.finalized.cross).length;
  const statementsDone = hasSeats && statementsCount === allSeats.length;
  const crossesDone = hasSeats && crossesCount === allSeats.length;
  const synthDone = !!synthesis;

  function deriveStatus(
    targetPhase: "statement" | "cross" | "synthesis",
  ): "done" | "current" | "pending" {
    // 还没召集人 → 全部 pending
    if (!phase || phase === "summon" || !hasSeats) return "pending";
    if (targetPhase === "statement") {
      if (statementsDone) return "done";
      if (phase === "statement") return "current";
      // 已经过了 statement 阶段
      return phase === "cross" || phase === "synthesis" ? "done" : "pending";
    }
    if (targetPhase === "cross") {
      if (!statementsDone) return "pending";
      if (crossesDone) return "done";
      if (phase === "cross") return "current";
      return phase === "synthesis" ? "done" : "pending";
    }
    // synthesis
    if (synthDone) return "done";
    if (phase === "synthesis") return "current";
    return "pending";
  }

  const phaseStatus = {
    statements: deriveStatus("statement"),
    cross: deriveStatus("cross"),
    synthesis: deriveStatus("synthesis"),
  } as const;

  // 进度计算 — 4 阶段加权平均
  // summon (10%) · statement (30%) · cross (30%) · synthesis (30%)
  const progress = (() => {
    if (finished) return 1;
    let p = 0;
    // summon
    if (phase && phase !== "summon") p += 0.1;
    else if (phase === "summon" && hasSeats) p += 0.1;
    else if (phase === "summon") p += 0.05;
    // statement
    if (statementsDone) p += 0.3;
    else if (hasSeats) p += 0.3 * (statementsCount / allSeats.length);
    // cross
    if (crossesDone) p += 0.3;
    else if (hasSeats && (phase === "cross" || phase === "synthesis"))
      p += 0.3 * (crossesCount / allSeats.length);
    // synthesis
    if (synthDone) p += 0.3;
    else if (phase === "synthesis") {
      // synthesis 是结构化, 一次性返回; 用 buffer 长度近似进度 (粗略)
      const ratio = Math.min(synthBuf.length / 600, 0.95);
      p += 0.3 * ratio;
    }
    return Math.min(p, 0.99);
  })();

  const progressPhaseLabel = synthDone
    ? "已完成"
    : phase === "synthesis"
      ? "综合裁定中"
      : phase === "cross"
        ? "互相质疑中"
        : phase === "statement"
          ? "独立陈述中"
          : phase === "summon"
            ? "召集人选中"
            : "准备中";

  return (
    <div className="relative h-full w-full overflow-y-auto scroll-thin">
      {/* ━━━ 顶部 sticky 进度条 ━━━ */}
      <div className="sticky top-0 z-10 border-b border-amber-dim/15 bg-ink-deep/85 backdrop-blur">
        <div className="mx-auto max-w-5xl px-8 py-2.5">
          <div className="mb-1 flex items-center justify-between text-[10px] tracking-[0.18em] text-parchment/50">
            <span>{progressPhaseLabel}</span>
            <span className="text-parchment/35">{Math.round(progress * 100)}%</span>
          </div>
          <div className="h-1 overflow-hidden rounded-full bg-amber-dim/15">
            <div
              className="h-full rounded-full bg-gradient-to-r from-amber-warm to-amber-glow transition-all duration-300 ease-out"
              style={{ width: `${progress * 100}%`, boxShadow: "0 0 8px rgba(232,181,99,0.5)" }}
            />
          </div>
        </div>
      </div>
      <div className="mx-auto max-w-5xl px-8 pb-12 pt-8">
        {/* ━━━ 议题 ━━━ */}
        <h1 className="mb-4 text-center font-serif text-2xl italic leading-snug text-amber-glow md:text-3xl">
          {question || "(尚无议题)"}
        </h1>

        {/* ━━━ 召集理由 ━━━ */}
        {rationale && (
          <div className="mb-8 rounded-lg border border-amber-dim/20 bg-gradient-to-b from-amber-dim/[0.04] to-transparent px-4 py-3">
            <div className="mb-1 text-[10px] tracking-[0.2em] text-amber-warm/70">
              召 集 理 由
            </div>
            <div className="text-[13px] italic leading-relaxed text-parchment/65">
              {rationale}
            </div>
          </div>
        )}

        {/* ━━━ mini roundtable ━━━ */}
        <MiniRoundtable
          seats={allSeats}
          arrows={arrows}
          activeRef={currentSpeakerRef(allSeats, phase)}
          phase={phase}
        />

        {/* ━━━ PHASE 1 · STATEMENTS ━━━ */}
        <PhaseSection
          ref={phaseRefs.statements}
          title="PHASE 1  ·  STATEMENTS"
          status={phaseStatus.statements}
          summary={
            phaseStatus.statements === "done"
              ? `${statementsCount}/${allSeats.length} 张已收起 · 点击 ▶ 展开重读`
              : phaseStatus.statements === "current"
                ? `${statementsCount}/${allSeats.length} 进行中`
                : "尚未开始"
          }
          collapsed={collapsed.statements}
          onToggle={() => toggle("statements")}
        >
          <div className="space-y-3">
            {allSeats.map((seat) => (
              <StatementCard key={seat.meta.ref} seat={seat} phase={phase} />
            ))}
          </div>
        </PhaseSection>

        {/* ━━━ PHASE 2 · CROSS-EXAM ━━━ */}
        <PhaseSection
          ref={phaseRefs.cross}
          title="PHASE 2  ·  CROSS-EXAMINATION"
          status={phaseStatus.cross}
          summary={
            phaseStatus.cross === "done"
              ? `${crossesCount} 轮质疑已结束 · 点击展开重读`
              : phaseStatus.cross === "current"
                ? `${crossesCount}/${allSeats.length} 进行中`
                : "等待 statements 完成"
          }
          collapsed={collapsed.cross}
          onToggle={() => toggle("cross")}
        >
          <div className="space-y-3">
            {allSeats.map((seat) => (
              <CrossExamCard
                key={seat.meta.ref}
                speaker={seat}
                arrows={arrows.filter((a) => a.from === seat.meta.ref)}
                phase={phase}
                seats={seats}
              />
            ))}
            {phase === "cross" && !crossesDone && (
              <div className="rounded-lg border border-dashed border-amber-dim/20 px-4 py-4 text-center text-xs italic text-parchment/30">
                等待剩余 cross-exam 流式完成…
              </div>
            )}
          </div>
        </PhaseSection>

        {/* ━━━ PHASE 3 · SYNTHESIS ━━━ */}
        <PhaseSection
          ref={phaseRefs.synthesis}
          title="PHASE 3  ·  SYNTHESIS"
          status={phaseStatus.synthesis}
          summary={
            phaseStatus.synthesis === "done"
              ? "P6 已综合 (共识 / 分歧 / 决定 / 新洞察)"
              : phaseStatus.synthesis === "current"
                ? "P6 流式生成中…"
                : "所有 cross-exam 完成后, P6 自动综合 (共识 / 分歧 / 决定 / 新洞察)"
          }
          collapsed={collapsed.synthesis}
          onToggle={() => toggle("synthesis")}
        >
          <SynthesisCard synthesis={synthesis} streaming={synthBuf} />
        </PhaseSection>

        {/* ━━━ 完成提示 ━━━ */}
        {finished && (
          <div className="mt-8 text-center text-[11px] tracking-wider text-amber-glow/40">
            议会已结束 · 议长可关闭页面或开始新议会
          </div>
        )}
      </div>

      {/* ━━━ 右下悬浮球 FAB ━━━ */}
      <PhaseFAB phaseStatus={phaseStatus} onJump={jumpTo} onCollapseAll={(v) =>
        setCollapsed({ statements: v, cross: v, synthesis: v })
      } />
    </div>
  );
}

// ────────────────────────────────────────────────────
// mini roundtable — 索引 (不是表演舞台)
// ────────────────────────────────────────────────────
function MiniRoundtable({
  seats,
  arrows,
  activeRef,
  phase,
}: {
  seats: SeatState[];
  arrows: CrossArrow[];
  activeRef: string | null;
  phase: Phase | null;
}) {
  if (seats.length === 0) {
    return (
      <div className="mb-10 rounded-lg border border-dashed border-amber-dim/20 px-4 py-6 text-center text-xs italic text-parchment/30">
        召集中… 等待 persona 落座
      </div>
    );
  }

  return (
    <div className="relative mb-10 px-4 py-6">
      <div className="mb-6 text-center text-[10px] tracking-[0.2em] text-parchment/30">
        参 会 ({seats.length})
      </div>
      <div className="relative flex items-start justify-around">
        {seats.map((seat) => {
          const isActive = seat.meta.ref === activeRef;
          const stmtDone = !!seat.finalized.statement;
          const crossDone = !!seat.finalized.cross;
          return (
            <div key={seat.meta.ref} className="relative flex flex-col items-center">
              <div
                className={`relative flex h-14 w-14 items-center justify-center rounded-full border-[1.5px] font-serif text-xl italic transition-all ${
                  isActive
                    ? "border-amber-glow bg-gradient-to-b from-amber-dim/20 to-amber-dim/5 text-amber-glow shadow-[0_0_24px_rgba(232,181,99,0.45)]"
                    : "border-parchment/20 bg-ink-soft/40 text-parchment/40"
                }`}
              >
                {seatGlyph(seat)}
                {isActive && (
                  <span className="pointer-events-none absolute inset-0 rounded-full border border-amber-glow/40 animate-flicker" />
                )}
                {(stmtDone || crossDone) && !isActive && (
                  <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full border border-emerald-700/60 bg-ink text-[8px] text-emerald-500/80">
                    ✓
                  </span>
                )}
              </div>
              <div className="mt-2 max-w-[160px] truncate text-center text-[10px] text-parchment/60">
                {seat.meta.ref}
              </div>
              <div className="text-center text-[9px] text-parchment/30">
                {phaseTagFor(seat, phase)}
              </div>
            </div>
          );
        })}
      </div>
      {arrows.length > 0 && phase === "cross" && (
        <div className="mt-3 flex flex-wrap justify-center gap-2 text-[9px] text-amber-warm/60">
          {arrows.map((a, i) => (
            <span key={i} className="rounded-full border border-amber-dim/30 px-2 py-0.5">
              {shortRef(a.from)} → {shortRef(a.to)}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function seatGlyph(seat: SeatState): string {
  if (seat.meta.avatar) return seat.meta.avatar;
  if (seat.meta.type === "self") return "◆";
  if (seat.meta.type === "role") return "◇";
  return seat.meta.ref.split(":")[1]?.[0]?.toUpperCase() ?? "●";
}

function phaseTagFor(seat: SeatState, phase: Phase | null): string {
  if (seat.speaking) return "正在发言";
  const stmt = !!seat.finalized.statement;
  const cross = !!seat.finalized.cross;
  if (stmt && cross) return "已 statement · 已 cross-exam";
  if (stmt && phase === "cross") return "已 statement · 等 cross-exam";
  if (stmt) return "已 statement";
  return "等待发言";
}

function shortRef(ref: string): string {
  return ref.split(":")[1]?.slice(0, 12) ?? ref;
}

function currentSpeakerRef(seats: SeatState[], _phase: Phase | null): string | null {
  const speaking = seats.find((s) => s.speaking);
  if (speaking) return speaking.meta.ref;
  return null;
}

// ────────────────────────────────────────────────────
// PhaseSection — 可折叠的 phase 容器 (forwardRef 让父级能 scroll into view)
// ────────────────────────────────────────────────────
const PhaseSection = forwardRef<
  HTMLDivElement,
  {
    title: string;
    status: "done" | "current" | "pending";
    summary: string;
    collapsed: boolean;
    onToggle: () => void;
    children: React.ReactNode;
  }
>(function PhaseSectionImpl(
  { title, status, summary, collapsed, onToggle, children },
  ref,
) {
  const headerColor =
    status === "current"
      ? "border-amber-glow/60 bg-amber-dim/[0.06]"
      : status === "done"
        ? "border-amber-dim/20 bg-ink-soft/40"
        : "border-amber-dim/15 bg-ink-soft/20 border-dashed";
  const titleColor =
    status === "current"
      ? "text-amber-glow"
      : status === "done"
        ? "text-parchment/65"
        : "text-parchment/30";
  const chevColor =
    status === "current"
      ? "text-amber-glow"
      : status === "done"
        ? "text-emerald-500/70"
        : "text-parchment/25";

  return (
    <div ref={ref} className="mt-6">
      <button
        type="button"
        onClick={onToggle}
        className={`group flex w-full items-center gap-3 rounded-lg border px-4 py-3 text-left transition-colors ${headerColor}`}
      >
        <span className={`text-sm leading-none ${chevColor}`}>
          {collapsed ? "▶" : "▼"}
        </span>
        <span className={`flex-1 text-[11px] tracking-[0.25em] ${titleColor}`}>
          {title}
        </span>
        <StatusBadge status={status} />
        <span className="hidden text-[10px] italic text-parchment/35 md:inline">
          {summary}
        </span>
      </button>

      {!collapsed && (
        <div className="pt-3">{children}</div>
      )}
    </div>
  );
});

function StatusBadge({ status }: { status: "done" | "current" | "pending" }) {
  const styles = {
    done: "border-emerald-700/40 text-emerald-500/80",
    current: "border-amber-glow/40 text-amber-glow",
    pending: "border-parchment/15 text-parchment/30",
  } as const;
  const labels = { done: "DONE", current: "CURRENT", pending: "PENDING" };
  return (
    <span className={`rounded-full border px-2 py-0.5 text-[9px] tracking-widest ${styles[status]}`}>
      {labels[status]}
    </span>
  );
}

// ────────────────────────────────────────────────────
// StatementCard
// ────────────────────────────────────────────────────
function StatementCard({ seat, phase }: { seat: SeatState; phase: Phase | null }) {
  const finalized = seat.finalized.statement;
  const buf = seat.buffers.statement;
  const isStreaming = phase === "statement" && seat.speaking;
  const text = finalized || buf || "";
  const tone =
    seat.meta.type === "self"
      ? "border-l-emerald-600/60"
      : seat.meta.type === "mentor"
        ? "border-l-amber-glow/80"
        : "border-l-orange-500/60";

  return (
    <div className={`relative rounded-lg border border-amber-dim/15 bg-ink-soft/40 px-5 py-4 border-l-[3px] ${tone}`}>
      <div className="mb-2 flex items-center gap-3">
        <SeatChip seat={seat} small />
        <span className="text-[10px] tracking-wider text-parchment/35">
          {seat.meta.ref}  ·  statement
        </span>
        {isStreaming && (
          <span className="flex items-center gap-1 text-[9px] tracking-widest text-amber-glow">
            <span className="h-1 w-1 rounded-full bg-amber-glow animate-flicker" />
            LIVE
          </span>
        )}
      </div>
      <div className="text-[13px] italic leading-relaxed text-parchment/80">
        {text || (
          <span className="text-parchment/25 not-italic">等待发言…</span>
        )}
        {isStreaming && (
          <span className="ml-1 inline-block h-3 w-[6px] -mb-[2px] bg-amber-glow animate-flicker" />
        )}
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────
// CrossExamCard — 一个 persona 的所有 cross-exam 输出
// ────────────────────────────────────────────────────
function CrossExamCard({
  speaker,
  arrows,
  phase,
  seats,
}: {
  speaker: SeatState;
  arrows: CrossArrow[];
  phase: Phase | null;
  seats: Record<string, SeatState>;
}) {
  const finalized = speaker.finalized.cross;
  const buf = speaker.buffers.cross;
  const isStreaming = phase === "cross" && speaker.speaking;
  const text = finalized || buf || "";
  if (!text && !isStreaming) {
    return (
      <div className="rounded-lg border border-dashed border-amber-dim/15 px-5 py-3 text-[12px] italic text-parchment/30">
        {speaker.meta.ref} 等待 cross-exam…
      </div>
    );
  }

  const targets = arrows.map((a) => a.to).filter((v, i, arr) => arr.indexOf(v) === i);

  return (
    <div className={`rounded-lg border bg-ink-soft/40 px-5 py-4 ${isStreaming ? "border-amber-glow/60 shadow-[0_0_24px_rgba(232,181,99,0.15)]" : "border-amber-dim/15"}`}>
      <div className="mb-3 flex items-center gap-2">
        <SeatChip seat={speaker} small />
        <span className="text-[11px] text-parchment/60">→</span>
        {targets.length === 0 ? (
          <span className="text-[10px] italic text-parchment/30">
            (尚未指定挑战对象)
          </span>
        ) : (
          <div className="flex items-center gap-1">
            {targets.map((t) => {
              const target = seats[t];
              return target ? (
                <SeatChip key={t} seat={target} small />
              ) : (
                <span key={t} className="text-[10px] text-parchment/40">
                  {t}
                </span>
              );
            })}
          </div>
        )}
        <span className="ml-auto text-[10px] tracking-wider text-parchment/35">
          cross-exam
        </span>
        {isStreaming && (
          <span className="flex items-center gap-1 text-[9px] tracking-widest text-amber-glow">
            <span className="h-1 w-1 rounded-full bg-amber-glow animate-flicker" />
            LIVE
          </span>
        )}
      </div>
      <div className="text-[13px] italic leading-relaxed text-parchment/80">
        {text}
        {isStreaming && (
          <span className="ml-1 inline-block h-3 w-[6px] -mb-[2px] bg-amber-glow animate-flicker" />
        )}
      </div>
      {arrows.length > 0 && (
        <div className="mt-3 space-y-1 text-[11px] text-amber-warm/70">
          {arrows.map((a, i) => (
            <div key={i} className="flex gap-2">
              <span className="text-amber-glow/60">⚡</span>
              <span className="leading-snug">{a.point}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────
// SynthesisCard
// ────────────────────────────────────────────────────
function SynthesisCard({
  synthesis,
  streaming,
}: {
  synthesis: SynthesisJSON | null;
  streaming: string;
}) {
  if (!synthesis && !streaming) {
    return (
      <div className="rounded-lg border border-dashed border-amber-dim/15 bg-ink-soft/20 px-5 py-6 text-[12px] italic text-parchment/30">
        将在所有 cross-exam 完成后由 P6 自动生成
        <ul className="mt-3 space-y-1 text-[11px] text-parchment/25">
          <li>·  共识</li>
          <li>·  仍存分歧</li>
          <li>·  如果今天必须决定</li>
          <li>·  本次议会暴露的新思考模式</li>
        </ul>
      </div>
    );
  }

  if (!synthesis && streaming) {
    return (
      <div className="rounded-lg border border-amber-glow/40 bg-gradient-to-b from-amber-dim/[0.06] to-transparent px-5 py-4 shadow-decree/20">
        <div className="mb-2 flex items-center gap-2 text-[10px] tracking-widest text-amber-glow/80">
          <span className="h-1.5 w-1.5 rounded-full bg-amber-glow animate-flicker" />
          P6  ·  STREAMING
        </div>
        <div className="whitespace-pre-wrap font-serif text-[14px] italic leading-relaxed text-parchment/85">
          {streaming}
          <span className="ml-1 inline-block h-3 w-[6px] -mb-[2px] bg-amber-glow animate-flicker" />
        </div>
      </div>
    );
  }

  if (!synthesis) return null;
  return (
    <div className="rounded-lg border border-amber-glow/40 bg-gradient-to-b from-amber-dim/[0.08] to-amber-dim/[0.02] px-6 py-5">
      <div className="mb-4 text-[10px] tracking-[0.2em] text-amber-glow/80">
        ⚖   议 会 综 合
      </div>

      {synthesis.consensus.length > 0 && (
        <div className="mb-4">
          <div className="mb-1 text-[11px] font-medium tracking-wider text-amber-warm/80">共识</div>
          <ul className="space-y-1 text-[13px] leading-relaxed text-parchment/80">
            {synthesis.consensus.map((c, i) => (
              <li key={i} className="flex gap-2">
                <span className="text-amber-glow/40">·</span>
                <span>{c}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {synthesis.disputes.length > 0 && (
        <div className="mb-4">
          <div className="mb-1 text-[11px] font-medium tracking-wider text-amber-warm/80">仍存分歧</div>
          <ul className="space-y-1 text-[13px] leading-relaxed text-parchment/80">
            {synthesis.disputes.map((d, i) => (
              <li key={i} className="flex gap-2">
                <span className="text-amber-glow/40">⇆</span>
                <span>
                  <span className="text-amber-warm/70">{d.a}  vs  {d.b}:</span>{" "}
                  {d.point}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mb-4">
        <div className="mb-1 text-[11px] font-medium tracking-wider text-amber-glow">
          如果今天必须决定
        </div>
        <div className="whitespace-pre-wrap font-serif text-[14px] italic leading-relaxed text-parchment/95">
          {synthesis.decision}
        </div>
      </div>

      {synthesis.meta_insight && (
        <div>
          <div className="mb-1 text-[11px] font-medium tracking-wider text-amber-warm/70">
            本次议会暴露的新思考模式
          </div>
          <div className="text-[13px] leading-relaxed text-parchment/65">
            {synthesis.meta_insight}
          </div>
        </div>
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────
// SeatChip — 小头像 + ref 名
// ────────────────────────────────────────────────────
function SeatChip({ seat, small }: { seat: SeatState; small?: boolean }) {
  const size = small ? "h-6 w-6 text-xs" : "h-8 w-8 text-sm";
  const tone =
    seat.meta.type === "self"
      ? "border-emerald-600/40 text-emerald-500/80"
      : seat.meta.type === "mentor"
        ? "border-amber-glow/40 text-amber-glow/85"
        : "border-orange-500/40 text-orange-400/80";
  return (
    <span className={`flex ${size} items-center justify-center rounded-full border bg-ink-soft/40 ${tone} font-serif italic`}>
      {seatGlyph(seat)}
    </span>
  );
}

// ────────────────────────────────────────────────────
// FAB — 右下悬浮球
// ────────────────────────────────────────────────────
function PhaseFAB({
  phaseStatus,
  onJump,
  onCollapseAll,
}: {
  phaseStatus: { statements: string; cross: string; synthesis: string };
  onJump: (key: "statements" | "cross" | "synthesis") => void;
  onCollapseAll: (collapsed: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="pointer-events-none fixed bottom-8 right-8 z-30">
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
            className="pointer-events-auto absolute bottom-20 right-0 w-56 rounded-2xl border border-amber-dim/30 bg-ink-soft/95 p-3 shadow-decree backdrop-blur"
          >
            <div className="mb-2 px-1 text-[9px] tracking-[0.2em] text-parchment/40">
              QUICK NAV  ·  跳到 Phase
            </div>
            <PhaseRow
              label="PHASE 1"
              name="Statements"
              status={phaseStatus.statements as any}
              onClick={() => {
                onJump("statements");
                setOpen(false);
              }}
            />
            <PhaseRow
              label="PHASE 2"
              name="Cross-exam"
              status={phaseStatus.cross as any}
              onClick={() => {
                onJump("cross");
                setOpen(false);
              }}
            />
            <PhaseRow
              label="PHASE 3"
              name="Synthesis"
              status={phaseStatus.synthesis as any}
              onClick={() => {
                onJump("synthesis");
                setOpen(false);
              }}
            />
            <div className="mt-2 border-t border-amber-dim/15 pt-2 text-[11px] text-parchment/55">
              <button
                type="button"
                onClick={() => {
                  onCollapseAll(false);
                  setOpen(false);
                }}
                className="block w-full rounded px-2 py-1 text-left hover:text-amber-glow"
              >
                ▼  展开全部 phase
              </button>
              <button
                type="button"
                onClick={() => {
                  onCollapseAll(true);
                  setOpen(false);
                }}
                className="block w-full rounded px-2 py-1 text-left hover:text-amber-glow"
              >
                ▶  折叠全部 phase
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="pointer-events-auto relative flex h-14 w-14 items-center justify-center rounded-full bg-amber-glow text-ink shadow-[0_0_32px_rgba(232,181,99,0.45)] transition-transform hover:scale-105 active:scale-95"
        aria-label="Phase navigation"
      >
        <FabIcon />
      </button>
    </div>
  );
}

function PhaseRow({
  label,
  name,
  status,
  onClick,
}: {
  label: string;
  name: string;
  status: "done" | "current" | "pending";
  onClick: () => void;
}) {
  const tone =
    status === "current"
      ? "border-amber-glow/60 bg-amber-dim/10"
      : status === "done"
        ? "border-amber-dim/20"
        : "border-amber-dim/15 border-dashed";
  const ico =
    status === "done" ? (
      <span className="flex h-5 w-5 items-center justify-center rounded-full border border-emerald-700/50 text-[10px] text-emerald-500/80">
        ✓
      </span>
    ) : status === "current" ? (
      <span className="flex h-5 w-5 items-center justify-center">
        <span className="h-2 w-2 rounded-full bg-amber-glow animate-flicker" />
      </span>
    ) : (
      <span className="flex h-5 w-5 items-center justify-center rounded-full border border-parchment/15 text-[9px] text-parchment/30">
        ◯
      </span>
    );
  return (
    <button
      type="button"
      onClick={onClick}
      className={`mt-1 flex w-full items-center gap-3 rounded-lg border px-3 py-2 text-left transition-colors hover:bg-amber-dim/10 ${tone}`}
    >
      {ico}
      <div className="flex-1">
        <div className={`text-[9px] tracking-widest ${status === "current" ? "text-amber-glow" : status === "done" ? "text-parchment/55" : "text-parchment/30"}`}>
          {label}
        </div>
        <div className="text-[12px] text-parchment/85">{name}</div>
      </div>
    </button>
  );
}

function FabIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
      <line x1="6" y1="8" x2="18" y2="8" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
      <line x1="6" y1="13" x2="18" y2="13" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
      <line x1="6" y1="18" x2="14" y2="18" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
      <circle cx="19" cy="13" r="1.6" fill="currentColor" />
    </svg>
  );
}
