import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import type { SeatState } from "@/lib/store";

interface Props {
  seat: SeatState;
  angle: number; // radians, where 0 = right, π/2 = bottom
  radius: number; // px from table center
  // Anchor position on screen (from table center, viewport-relative origin).
  anchor: { x: number; y: number };
}

// One seat at the round table. Positioned absolutely; the parent provides
// anchor coordinates so arrows can be drawn between seats.
export function PersonaSeat({ seat, anchor }: Props) {
  const [expanded, setExpanded] = useState(false);

  const { meta, buffers, finalized, speaking } = seat;

  const activeText = useMemo(() => {
    return (
      finalized.statement ??
      buffers.statement ??
      buffers.cross ??
      ""
    );
  }, [finalized, buffers]);

  const accent = meta.color ?? "#E8B563";
  const isLeftSide = anchor.x < 0;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.6, ease: "easeOut" }}
      className="pointer-events-auto absolute"
      style={{
        left: `calc(50% + ${anchor.x}px)`,
        top: `calc(50% + ${anchor.y}px)`,
        transform: "translate(-50%, -50%)",
        width: 260,
      }}
    >
      <div
        onClick={() => setExpanded((x) => !x)}
        className={cn(
          "group relative cursor-pointer rounded-xl border border-amber-dim/40 bg-ink-soft/85 p-3 text-left transition-all backdrop-blur",
          speaking && "seat-speaking",
        )}
        style={{
          borderColor: speaking ? accent : undefined,
        }}
      >
        <div className="flex items-center gap-3">
          <div
            className="flex h-12 w-12 flex-none items-center justify-center rounded-full text-xl font-serif"
            style={{
              background: `linear-gradient(135deg, ${accent}40, ${accent}10)`,
              border: `1.5px solid ${accent}80`,
              color: accent,
            }}
          >
            {meta.avatar ?? meta.ref.slice(-1).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <div className="tag-ref truncate">{meta.ref}</div>
            <div className="truncate text-sm text-parchment/80">
              {meta.description ?? typeLabel(meta.type)}
            </div>
          </div>
        </div>

        {/* Live / finalized text — collapsed by default to keep the table visible */}
        {activeText && (
          <div
            className={cn(
              "mt-3 overflow-hidden text-xs leading-relaxed text-parchment/70 transition-all",
              expanded ? "max-h-[360px]" : "max-h-[42px]",
            )}
          >
            <p className="scroll-thin max-h-[340px] overflow-y-auto whitespace-pre-wrap pr-1">
              {activeText}
              {speaking && (
                <span className="ml-0.5 inline-block h-3 w-1 animate-flicker bg-amber-glow" />
              )}
            </p>
            {!expanded && activeText.length > 50 && (
              <div className="-mt-3 h-4 bg-gradient-to-t from-ink-soft to-transparent" />
            )}
          </div>
        )}

        {activeText && (
          <div className="mt-1 text-right text-[10px] tracking-wider text-amber-glow/50">
            {expanded ? "点击收起 ↑" : "点击展开 ↓"}
          </div>
        )}
      </div>

      {/* Small connector dot at the side facing the table — arrows anchor here */}
      <div
        className="absolute h-2 w-2 rounded-full"
        style={{
          background: accent,
          boxShadow: `0 0 12px ${accent}`,
          top: "50%",
          [isLeftSide ? "right" : "left"]: "-6px",
          transform: "translateY(-50%)",
        }}
      />
    </motion.div>
  );
}

function typeLabel(t: "self" | "mentor" | "role"): string {
  return t === "self" ? "自己的思维模式" : t === "mentor" ? "榜样" : "角色";
}
