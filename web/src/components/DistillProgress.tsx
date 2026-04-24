import { AnimatePresence, motion } from "framer-motion";
import { HighlightCard } from "./HighlightCard";
import { useCapture, type CapturePhase } from "@/lib/capture-store";

// Mapping from sub-phase to a human-readable progress line and its state.
// - `active` phases are the "在进行" ones (with pulse)
// - `done` phases are check-marked
function phaseConfig(
  phases: CapturePhase[],
  key: CapturePhase,
): { active: boolean; done: boolean } {
  if (!phases.includes(key)) return { active: false, done: false };
  // Done markers are the -ed variants paired with their -ing counterparts.
  const pairs: Record<CapturePhase, CapturePhase | null> = {
    titling: "titled",
    titled: null,
    identifying: "identified",
    identified: null,
    forging: "forged",
    forged: null,
  };
  const donePartner = pairs[key];
  if (donePartner) {
    // This is a start marker; active iff its partner hasn't landed.
    return { active: !phases.includes(donePartner), done: false };
  }
  // This is a done marker.
  return { active: false, done: true };
}

export function DistillProgress() {
  const stage = useCapture((s) => s.stage);
  const phases = useCapture((s) => s.phases);
  const session = useCapture((s) => s.session);
  const highlights = useCapture((s) => s.highlights);
  const personas = useCapture((s) => s.personas);
  const error = useCapture((s) => s.error);

  const titling = phaseConfig(phases, "titling");
  const identifying = phaseConfig(phases, "identifying");
  const forging = phaseConfig(phases, "forging");

  return (
    <div className="flex w-full flex-col gap-5">
      {/* Progress checklist */}
      <div className="rounded-xl border border-amber-dim/30 bg-ink-soft/60 p-4 backdrop-blur">
        <div className="tag-ref mb-3">蒸馏进度</div>
        <ul className="space-y-2 text-sm">
          <ProgressItem
            active={titling.active}
            done={!!session || titling.done}
            label={
              session
                ? `标题: ${session.title}`
                : titling.active
                  ? "生成标题中…"
                  : "等待开始"
            }
          />
          <ProgressItem
            active={identifying.active}
            done={identifying.done}
            label={
              identifying.done
                ? `识别到 ${highlights.length} 个高光`
                : identifying.active
                  ? "识别高光中…"
                  : "等待识别高光"
            }
          />
          <ProgressItem
            active={forging.active}
            done={forging.done}
            label={
              forging.done
                ? personas.length > 0
                  ? `铸造 ${personas.length} 个新 persona`
                  : "本轮无新 persona 生成"
                : forging.active
                  ? "锻造 persona 中…"
                  : "等待 persona 锻造"
            }
          />
        </ul>

        {error && (
          <div className="mt-3 rounded-md border border-red-900/60 bg-red-950/30 px-3 py-2 text-xs text-red-300">
            ⚠ 错误: {error}
          </div>
        )}
      </div>

      {/* Highlights stream */}
      <div className="flex flex-col gap-3">
        <div className="tag-ref">思考高光</div>
        {highlights.length === 0 && (
          <div className="rounded-md border border-dashed border-amber-dim/30 px-4 py-6 text-center text-xs text-parchment/40">
            {stage === "capturing" || stage === "idle"
              ? "等待蒸馏开始…"
              : "正在打磨原石 · 稍后会有高光浮现"}
          </div>
        )}
        <AnimatePresence initial={false}>
          {highlights.map((h) => (
            <HighlightCard key={h.id} entry={h} />
          ))}
        </AnimatePresence>
      </div>

      {/* Forged personas */}
      {personas.length > 0 && (
        <div className="flex flex-col gap-3">
          <div className="tag-ref">新 persona</div>
          {personas.map((p) => (
            <PersonaMiniCard key={p.ref} refName={p.ref} />
          ))}
        </div>
      )}
    </div>
  );
}

function ProgressItem({
  active,
  done,
  label,
}: {
  active: boolean;
  done: boolean;
  label: string;
}) {
  return (
    <li className="flex items-center gap-3">
      <span
        className={`inline-flex h-5 w-5 items-center justify-center rounded-full border text-[11px] ${
          done
            ? "border-amber-glow/70 bg-amber-glow/20 text-amber-glow"
            : active
              ? "border-amber-glow/60 bg-transparent text-amber-glow animate-flicker"
              : "border-amber-dim/40 bg-transparent text-parchment/40"
        }`}
      >
        {done ? "✓" : active ? "•" : "·"}
      </span>
      <span
        className={
          done
            ? "text-parchment/90"
            : active
              ? "text-amber-glow"
              : "text-parchment/50"
        }
      >
        {label}
      </span>
    </li>
  );
}

function PersonaMiniCard({ refName }: { refName: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10, scale: 0.94 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.5, ease: "easeOut" }}
      className="relative"
    >
      <div
        aria-hidden
        className="pointer-events-none absolute -inset-[1px] rounded-xl opacity-80 blur-md"
        style={{
          background:
            "radial-gradient(60% 80% at 50% 0%, rgba(232,181,99,0.35), transparent 70%)",
        }}
      />
      <div className="relative flex items-center gap-3 rounded-xl border border-amber-glow/40 bg-ink-soft/85 p-3 shadow-candle backdrop-blur">
        <div
          className="flex h-10 w-10 flex-none items-center justify-center rounded-full font-serif text-lg"
          style={{
            background:
              "linear-gradient(135deg, rgba(232,181,99,0.35), rgba(232,181,99,0.08))",
            border: "1.5px solid rgba(232,181,99,0.6)",
            color: "#E8B563",
          }}
        >
          🕯️
        </div>
        <div className="min-w-0 flex-1">
          <div className="tag-ref truncate">{refName}</div>
          <div className="text-xs text-parchment/70">
            一位新的自我 persona 已被锻造
          </div>
        </div>
      </div>
    </motion.div>
  );
}
