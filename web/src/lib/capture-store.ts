import { create } from "zustand";
import type { CouncilEvent } from "./types";

// Stage of the combined capture → distill flow, as seen by the UI.
// - idle: textarea visible, nothing running
// - capturing: capture run in flight (title generation)
// - distilling: distill run in flight (identify + forge)
// - done: both finished
// - error: anything failed
export type CaptureStage =
  | "idle"
  | "capturing"
  | "distilling"
  | "done"
  | "error";

// Sub-phase for the progress list.
export type CapturePhase =
  | "titling" // capture: generating title
  | "titled" // capture: title returned
  | "identifying" // distill: identify highlights running
  | "identified" // distill: identify phase done
  | "forging" // distill: forge personas running
  | "forged"; // distill: forge phase done

export interface CapturedSession {
  id: string;
  title: string;
  filePath?: string;
}

// Highlight as emitted from the backend (result.kind === 'highlight').
// Backend shape (see src/engine/distill.ts StoredHighlight):
//   { id, session_id, data: { type, title, user_quote, why_non_trivial,
//     trigger, underlying_belief, confidence } }
export interface HighlightData {
  type:
    | "problem-reframing"
    | "meta-insight"
    | "decision-heuristic"
    | "boundary-response"
    | string;
  title: string;
  user_quote: string;
  why_non_trivial: string;
  trigger: string;
  underlying_belief: string;
  confidence: number;
}

export interface HighlightEntry {
  id: string;
  session_id: string;
  data: HighlightData;
  // Arrival order — drives the animation stagger.
  index: number;
}

export interface ForgedPersona {
  ref: string;
  // Optional visual metadata if the backend sends it later.
  description?: string;
  avatar?: string;
  color?: string;
}

export interface CaptureState {
  stage: CaptureStage;
  captureRunId: string | null;
  distillRunId: string | null;
  // The currently captured session (so distill can hook into it).
  session: CapturedSession | null;
  // Cumulative list of distilled highlights for the active flow.
  highlights: HighlightEntry[];
  // Forged personas (distill phase 'forge' → result.kind === 'persona').
  personas: ForgedPersona[];
  // Current visible sub-phases, in order of first activation.
  phases: CapturePhase[];
  // Error message if anything failed.
  error: string | null;
  // The raw body the user pasted — remembered for display under the flow.
  body: string;
  // `true` if we fell back to a fixture because the backend was unavailable.
  mock: boolean;
}

interface Actions {
  reset: () => void;
  setBody: (body: string) => void;
  setCaptureRunId: (id: string) => void;
  setDistillRunId: (id: string) => void;
  setStage: (s: CaptureStage) => void;
  setMock: (m: boolean) => void;
  addPhase: (p: CapturePhase) => void;
  setError: (err: string | null) => void;
  // Separate ingestors for capture and distill runs since they share event
  // types but carry different semantics.
  ingestCapture: (e: CouncilEvent) => void;
  ingestDistill: (e: CouncilEvent) => void;
}

const initial: CaptureState = {
  stage: "idle",
  captureRunId: null,
  distillRunId: null,
  session: null,
  highlights: [],
  personas: [],
  phases: [],
  error: null,
  body: "",
  mock: false,
};

export const useCapture = create<CaptureState & Actions>((set, get) => ({
  ...initial,

  reset: () => set({ ...initial }),

  setBody: (body) => set({ body }),
  setCaptureRunId: (captureRunId) => set({ captureRunId }),
  setDistillRunId: (distillRunId) => set({ distillRunId }),
  setStage: (stage) => set({ stage }),
  setMock: (mock) => set({ mock }),
  setError: (error) =>
    set({ error, stage: error ? "error" : get().stage }),

  addPhase: (p) =>
    set((s) =>
      s.phases.includes(p) ? s : { phases: [...s.phases, p] },
    ),

  ingestCapture: (e) => {
    set((s) => {
      switch (e.t) {
        case "run.started":
          return { ...s, stage: "capturing" };

        case "phase.started":
          if (e.phase === "title") {
            return s.phases.includes("titling")
              ? s
              : { ...s, phases: [...s.phases, "titling"] };
          }
          return s;

        case "phase.done":
          if (e.phase === "title") {
            return s.phases.includes("titled")
              ? s
              : { ...s, phases: [...s.phases, "titled"] };
          }
          return s;

        case "result": {
          if (e.kind === "session") {
            const d = e.data as {
              id: string;
              title: string;
              filePath?: string;
            };
            return {
              ...s,
              session: { id: d.id, title: d.title, filePath: d.filePath },
            };
          }
          return s;
        }

        case "run.failed":
          return { ...s, stage: "error", error: e.error };

        case "run.done":
          // Don't flip to `done` yet — distill will follow.
          return s;

        default:
          return s;
      }
    });
  },

  ingestDistill: (e) => {
    set((s) => {
      switch (e.t) {
        case "run.started":
          return { ...s, stage: "distilling" };

        case "phase.started": {
          if (e.phase === "identify") {
            return s.phases.includes("identifying")
              ? s
              : { ...s, phases: [...s.phases, "identifying"] };
          }
          if (e.phase === "forge") {
            return s.phases.includes("forging")
              ? s
              : { ...s, phases: [...s.phases, "forging"] };
          }
          return s;
        }

        case "phase.done": {
          if (e.phase === "identify") {
            return s.phases.includes("identified")
              ? s
              : { ...s, phases: [...s.phases, "identified"] };
          }
          if (e.phase === "forge") {
            return s.phases.includes("forged")
              ? s
              : { ...s, phases: [...s.phases, "forged"] };
          }
          return s;
        }

        case "result": {
          if (e.kind === "highlight") {
            const d = e.data as Omit<HighlightEntry, "index">;
            // Defensive: guard against duplicate ids on replay.
            if (s.highlights.some((h) => h.id === d.id)) return s;
            const entry: HighlightEntry = {
              id: d.id,
              session_id: d.session_id,
              data: d.data,
              index: s.highlights.length,
            };
            return { ...s, highlights: [...s.highlights, entry] };
          }
          if (e.kind === "persona") {
            const d = e.data as ForgedPersona;
            if (s.personas.some((p) => p.ref === d.ref)) return s;
            return { ...s, personas: [...s.personas, d] };
          }
          return s;
        }

        case "run.failed":
          return { ...s, stage: "error", error: e.error };

        case "run.done":
          return { ...s, stage: "done" };

        default:
          return s;
      }
    });
  },
}));
