import { create } from "zustand";
import type {
  CouncilEvent,
  CrossArrow,
  PersonaMeta,
  Phase,
  SynthesisJSON,
} from "./types";

// Per-persona speaking state, keyed by persona ref.
export interface SeatState {
  meta: PersonaMeta;
  // Current phase → streaming text buffer.
  buffers: Partial<Record<Phase, string>>;
  // Phase → final text once item.done fires.
  finalized: Partial<Record<Phase, string>>;
  speaking: boolean;
  // Last time a chunk landed — drives the glow.
  lastChunkAt: number;
}

export interface CouncilState {
  runId: string | null;
  question: string;
  phase: Phase | null;
  seats: Record<string, SeatState>;
  // Preserve seat order as personas are summoned.
  seatOrder: string[];
  rationale: string;
  // Cross-exam arrows, built from item.done in cross phase.
  arrows: CrossArrow[];
  // Streaming synthesis text before `result` lands.
  synthesisBuffer: string;
  synthesis: SynthesisJSON | null;
  running: boolean;
  finished: boolean;
  error: string | null;
  // Connection state for banner.
  connection: "offline" | "connecting" | "live" | "mock";
  // Rolling log for debug panel.
  logs: Array<{ level: string; msg: string; ts: number }>;
}

interface Actions {
  ingest: (e: CouncilEvent) => void;
  reset: () => void;
  setConnection: (c: CouncilState["connection"]) => void;
  setQuestion: (q: string) => void;
}

const initial: CouncilState = {
  runId: null,
  question: "",
  phase: null,
  seats: {},
  seatOrder: [],
  rationale: "",
  arrows: [],
  synthesisBuffer: "",
  synthesis: null,
  running: false,
  finished: false,
  error: null,
  connection: "offline",
  logs: [],
};

export const useCouncil = create<CouncilState & Actions>((set) => ({
  ...initial,

  reset: () => set({ ...initial }),

  setConnection: (connection) => set({ connection }),

  setQuestion: (question) => set({ question }),

  ingest: (e) =>
    set((state) => {
      switch (e.t) {
        case "run.started": {
          const q =
            (e.meta?.question as string | undefined) ?? state.question ?? "";
          return {
            ...initial,
            connection: state.connection,
            runId: e.run_id,
            question: q,
            running: true,
          };
        }

        case "run.done":
          return { ...state, running: false, finished: true };

        case "run.failed":
          return {
            ...state,
            running: false,
            finished: true,
            error: e.error,
          };

        case "phase.started":
          return { ...state, phase: e.phase };

        case "phase.done":
          // Stop glow on all seats when a phase ends — avoids stale animations.
          return {
            ...state,
            seats: Object.fromEntries(
              Object.entries(state.seats).map(([k, s]) => [
                k,
                { ...s, speaking: false },
              ]),
            ),
          };

        case "summon.done": {
          const seats: Record<string, SeatState> = {};
          const order: string[] = [];
          for (const p of e.selected) {
            seats[p.ref] = {
              meta: p,
              buffers: {},
              finalized: {},
              speaking: false,
              lastChunkAt: 0,
            };
            order.push(p.ref);
          }
          return {
            ...state,
            seats,
            seatOrder: order,
            rationale: e.rationale,
          };
        }

        case "chunk": {
          if (e.persona) {
            const seat = state.seats[e.persona];
            if (!seat) return state;
            const prev = seat.buffers[e.phase] ?? "";
            return {
              ...state,
              seats: {
                ...state.seats,
                [e.persona]: {
                  ...seat,
                  buffers: { ...seat.buffers, [e.phase]: prev + e.text },
                  speaking: true,
                  lastChunkAt: e.ts,
                },
              },
            };
          }
          // Synthesis chunks have no persona — accumulate into buffer.
          if (e.phase === "synthesis") {
            return {
              ...state,
              synthesisBuffer: state.synthesisBuffer + e.text,
            };
          }
          return state;
        }

        case "item.done": {
          // Statement or cross-exam finishing for a specific persona.
          if (e.phase === "statement" && state.seats[e.key]) {
            const seat = state.seats[e.key];
            const finalText =
              (typeof e.payload === "string"
                ? e.payload
                : (e.payload as { text?: string })?.text) ??
              seat.buffers.statement ??
              "";
            return {
              ...state,
              seats: {
                ...state.seats,
                [e.key]: {
                  ...seat,
                  speaking: false,
                  finalized: { ...seat.finalized, statement: finalText },
                },
              },
            };
          }

          if (e.phase === "cross") {
            // Engine payload: { ref, text } — 整段 cross-exam 文本.
            // 我们 (a) 把文本固化到 finalized.cross 让 trace 视图显示完整发言;
            // (b) 从文本里抽出被挑战的 persona refs 作为 arrows.
            const p = e.payload as {
              ref?: string;
              text?: string;
              from?: string;
              to?: string;
              point?: string;
            } | null;
            const from = p?.from ?? p?.ref ?? e.key;
            const text = p?.text ?? "";
            const seat = state.seats[from];
            const finalText = text || seat?.buffers.cross || "";

            // 从 cross-exam 正文里识别被挑战的 persona refs (mentors:xxx / self:xxx / roles:xxx)
            const refRegex = /\b(self|mentors?|roles?):([A-Za-z][A-Za-z0-9-]*)/g;
            const mentioned = new Set<string>();
            let m: RegExpExecArray | null;
            while ((m = refRegex.exec(finalText))) {
              const bucket = m[1].endsWith("s") || m[1] === "self" ? m[1] : m[1] + "s";
              const candidate = `${bucket}:${m[2]}`;
              if (candidate !== from && state.seats[candidate]) {
                mentioned.add(candidate);
              }
            }
            // 兼容 旧 from/to/point 格式
            if (p?.to && p.to !== from && state.seats[p.to]) mentioned.add(p.to);

            const newArrows: CrossArrow[] = [...state.arrows];
            for (const target of mentioned) {
              newArrows.push({
                from,
                to: target,
                point: p?.point ?? finalText.slice(0, 100),
              });
            }

            const newSeats = seat
              ? {
                  ...state.seats,
                  [from]: {
                    ...seat,
                    speaking: false,
                    finalized: { ...seat.finalized, cross: finalText },
                  },
                }
              : state.seats;

            return {
              ...state,
              arrows: newArrows,
              seats: newSeats,
            };
          }

          return state;
        }

        case "result": {
          if (e.kind === "synthesis") {
            return {
              ...state,
              synthesis: e.data as SynthesisJSON,
            };
          }
          return state;
        }

        case "log":
          return {
            ...state,
            logs: [
              ...state.logs.slice(-49),
              { level: e.level, msg: e.msg, ts: e.ts },
            ],
          };

        default:
          return state;
      }
    }),
}));
