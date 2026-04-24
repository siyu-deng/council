import { useMemo } from "react";
import { motion } from "framer-motion";
import { PersonaSeat } from "./PersonaSeat";
import { CenterStage } from "./CenterStage";
import { useCouncil } from "@/lib/store";

interface Props {
  prefillQuestion: string;
  onConvene: (q: string) => void;
  isBusy: boolean;
}

// Canonical angles for seats 1..5. The user sits at the bottom of the screen
// (angle = π/2 = straight down), so the council sits on the opposite hemisphere.
// We anchor the angles so the personas arc along the top/sides.
const ANGLES_BY_COUNT: Record<number, number[]> = {
  1: [-Math.PI / 2], // top
  2: [-Math.PI / 2 - 0.5, -Math.PI / 2 + 0.5],
  3: [-Math.PI, -Math.PI / 2, 0], // left, top, right
  4: [-Math.PI + 0.3, -Math.PI / 2 - 0.5, -Math.PI / 2 + 0.5, -0.3],
  5: [-Math.PI + 0.2, -Math.PI + 0.9, -Math.PI / 2, -0.9, -0.2],
};

// Convert an angle + radius to pixel offsets from center.
function polar(angle: number, radius: number) {
  return {
    x: Math.cos(angle) * radius,
    y: Math.sin(angle) * radius,
  };
}

export function RoundTable({ prefillQuestion, onConvene, isBusy }: Props) {
  const seats = useCouncil((s) => s.seats);
  const seatOrder = useCouncil((s) => s.seatOrder);
  const arrows = useCouncil((s) => s.arrows);
  const phase = useCouncil((s) => s.phase);

  const count = seatOrder.length;
  const angles = ANGLES_BY_COUNT[count] ?? generateAngles(count);
  const radius = 320;

  // Map persona ref -> anchor px so arrows can be drawn.
  const anchors = useMemo(() => {
    const map: Record<string, { x: number; y: number }> = {};
    seatOrder.forEach((ref, i) => {
      const a = angles[i]!;
      map[ref] = polar(a, radius);
    });
    return map;
  }, [seatOrder, angles]);

  return (
    <div className="relative z-10 flex h-full w-full items-center justify-center">
      {/* The table disc */}
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 1 }}
        className="table-disc absolute h-[520px] w-[520px] rounded-full"
      />

      {/* Center content */}
      <div className="relative z-20 flex max-h-[90vh] items-center justify-center overflow-y-auto scroll-thin px-4">
        <CenterStage
          prefillQuestion={prefillQuestion}
          onConvene={onConvene}
          isBusy={isBusy}
        />
      </div>

      {/* Cross-exam arrows — only during/after the cross phase */}
      <ArrowsLayer
        arrows={arrows}
        anchors={anchors}
        visible={phase === "cross" || phase === "synthesis"}
      />

      {/* Seats */}
      {seatOrder.map((ref) => {
        const seat = seats[ref];
        const anchor = anchors[ref];
        if (!seat || !anchor) return null;
        // Compute actual angle index for this seat to pass to PersonaSeat.
        const i = seatOrder.indexOf(ref);
        return (
          <PersonaSeat
            key={ref}
            seat={seat}
            angle={angles[i]!}
            radius={radius}
            anchor={anchor}
          />
        );
      })}

      {/* User chair at the bottom — subtle, to hint "you are here" */}
      {count > 0 && (
        <div className="pointer-events-none absolute bottom-6 left-1/2 z-10 -translate-x-1/2 text-center">
          <div className="tag-ref mb-1 text-amber-glow/60">你 · 议长</div>
          <div className="mx-auto h-1 w-24 rounded-full bg-gradient-to-r from-transparent via-amber-glow/40 to-transparent" />
        </div>
      )}
    </div>
  );
}

// SVG overlay of arrows between disputing seats.
function ArrowsLayer({
  arrows,
  anchors,
  visible,
}: {
  arrows: { from: string; to: string; point: string }[];
  anchors: Record<string, { x: number; y: number }>;
  visible: boolean;
}) {
  if (!visible || arrows.length === 0) return null;

  return (
    <svg
      className="pointer-events-none absolute left-1/2 top-1/2 z-[15] -translate-x-1/2 -translate-y-1/2"
      width={1200}
      height={900}
      viewBox="-600 -450 1200 900"
      style={{ overflow: "visible" }}
    >
      <defs>
        <marker
          id="arrowhead"
          viewBox="0 0 10 10"
          refX="9"
          refY="5"
          markerWidth="6"
          markerHeight="6"
          orient="auto-start-reverse"
        >
          <path d="M 0 0 L 10 5 L 0 10 z" fill="#E8B563" opacity="0.7" />
        </marker>
      </defs>
      {arrows.map((a, i) => {
        const from = anchors[a.from];
        const to = anchors[a.to];
        if (!from || !to) return null;
        // Pull endpoints slightly toward each other so they don't overlap the seat.
        const dx = to.x - from.x;
        const dy = to.y - from.y;
        const len = Math.hypot(dx, dy) || 1;
        const pad = 18;
        const fx = from.x + (dx / len) * pad;
        const fy = from.y + (dy / len) * pad;
        const tx = to.x - (dx / len) * pad;
        const ty = to.y - (dy / len) * pad;
        const midX = (fx + tx) / 2;
        const midY = (fy + ty) / 2;
        return (
          <motion.g
            key={i}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.4, delay: i * 0.2 }}
          >
            <line
              x1={fx}
              y1={fy}
              x2={tx}
              y2={ty}
              stroke="#E8B563"
              strokeWidth={1.2}
              strokeDasharray="3 4"
              opacity={0.45}
              markerEnd="url(#arrowhead)"
            />
            <foreignObject
              x={midX - 90}
              y={midY - 14}
              width={180}
              height={28}
              className="pointer-events-none"
            >
              <div className="flex justify-center">
                <div className="max-w-[180px] truncate rounded-full border border-amber-dim/40 bg-ink/80 px-2 py-0.5 text-[10px] text-amber-glow/80 backdrop-blur">
                  ⚡ {truncate(a.point, 36)}
                </div>
              </div>
            </foreignObject>
          </motion.g>
        );
      })}
    </svg>
  );
}

function truncate(s: string, n: number) {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

// Fallback angle distribution for >5 seats.
function generateAngles(n: number): number[] {
  if (n <= 0) return [];
  const result: number[] = [];
  // Distribute across the top half of the circle only: from π (left) to 0 (right).
  for (let i = 0; i < n; i++) {
    const t = n === 1 ? 0.5 : i / (n - 1);
    // lerp from π to 2π (i.e. left to right across the top)
    const angle = -Math.PI + t * Math.PI;
    result.push(angle);
  }
  return result;
}
