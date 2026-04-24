import { motion } from "framer-motion";
import type { HighlightEntry } from "@/lib/capture-store";

interface Props {
  entry: HighlightEntry;
}

// Human-readable labels for highlight types. The backend emits the raw kebab
// form; we keep that as a `tag-ref` accent and surface the Chinese label
// alongside.
const TYPE_LABELS: Record<string, string> = {
  "problem-reframing": "问题重构",
  "meta-insight": "元洞察",
  "decision-heuristic": "决策启发",
  "boundary-response": "边界回应",
};

export function HighlightCard({ entry }: Props) {
  const { data, index } = entry;
  const label = TYPE_LABELS[data.type] ?? data.type;
  const confidence = Math.round((data.confidence ?? 0) * 100);

  return (
    <motion.div
      initial={{ opacity: 0, x: 24, scale: 0.96 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      transition={{
        duration: 0.55,
        ease: [0.25, 0.9, 0.3, 1],
        delay: Math.min(index * 0.08, 0.6),
      }}
      className="group relative"
    >
      {/* Soft amber aura — "something just got carved from the raw stone" */}
      <div
        aria-hidden
        className="pointer-events-none absolute -inset-[1px] rounded-xl opacity-70 blur-md"
        style={{
          background:
            "radial-gradient(60% 80% at 20% 0%, rgba(232,181,99,0.28), transparent 70%)",
        }}
      />
      <div className="relative rounded-xl border border-amber-dim/40 bg-ink-soft/80 p-4 shadow-seat backdrop-blur">
        <div className="mb-2 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="tag-ref text-amber-glow/80">{data.type}</span>
            <span className="text-[11px] text-parchment/60">· {label}</span>
          </div>
          <ConfidencePill pct={confidence} />
        </div>

        <h3 className="mb-2 font-serif text-lg leading-snug text-amber-glow">
          {data.title}
        </h3>

        {data.user_quote && (
          <blockquote className="border-l-2 border-amber-glow/40 pl-3 font-serif italic text-parchment/90">
            “{data.user_quote}”
          </blockquote>
        )}

        {data.why_non_trivial && (
          <p className="mt-3 text-xs leading-relaxed text-parchment/60">
            {data.why_non_trivial}
          </p>
        )}
      </div>
    </motion.div>
  );
}

function ConfidencePill({ pct }: { pct: number }) {
  // Clamp & tone: high confidence glows amber, low fades to dim.
  const clamped = Math.max(0, Math.min(100, pct));
  const tone =
    clamped >= 80
      ? "text-amber-glow border-amber-glow/50 bg-amber-glow/10"
      : clamped >= 60
        ? "text-amber-warm border-amber-dim/50 bg-amber-warm/5"
        : "text-parchment/50 border-amber-dim/30";
  return (
    <span
      className={`rounded-full border px-2 py-0.5 font-mono text-[10px] tracking-wider ${tone}`}
    >
      {clamped}%
    </span>
  );
}
