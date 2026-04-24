// CouncilEvent discriminated union — mirrors src/engine/events.ts from the CLI.
// Keep this in sync with the backend; any schema drift silently breaks the UI.

export type PersonaType = "self" | "mentor" | "role";

export interface PersonaMeta {
  ref: string;
  type: PersonaType;
  description?: string;
  avatar?: string;
  color?: string;
  confidence?: number;
}

export interface SynthesisJSON {
  consensus: string[];
  disputes: Array<{ a: string; b: string; point: string }>;
  decision: string;
  meta_insight?: string;
}

export type Verb = "convene" | "capture" | "distill" | "evolve";

export type Phase = "summon" | "statement" | "cross" | "synthesis" | string;

export type CouncilEvent =
  | {
      t: "run.started";
      run_id: string;
      verb: Verb;
      ts: number;
      meta?: Record<string, unknown> & { question?: string };
    }
  | {
      t: "run.done";
      run_id: string;
      verb: Verb;
      ts: number;
      result?: Record<string, unknown>;
    }
  | {
      t: "run.failed";
      run_id: string;
      verb: Verb;
      ts: number;
      error: string;
    }
  | {
      t: "phase.started";
      run_id: string;
      phase: Phase;
      ts: number;
      meta?: Record<string, unknown>;
    }
  | {
      t: "phase.done";
      run_id: string;
      phase: Phase;
      ts: number;
      meta?: Record<string, unknown>;
    }
  | {
      t: "summon.done";
      run_id: string;
      selected: PersonaMeta[];
      rationale: string;
      ts: number;
    }
  | {
      t: "chunk";
      run_id: string;
      phase: Phase;
      persona?: string;
      text: string;
      ts: number;
    }
  | {
      t: "item.done";
      run_id: string;
      phase: Phase;
      key: string;
      payload: unknown;
      ts: number;
    }
  | {
      t: "result";
      run_id: string;
      kind: string;
      data: unknown;
      ts: number;
    }
  | {
      t: "log";
      run_id: string;
      level: "info" | "warn" | "error" | "muted";
      msg: string;
      ts: number;
    };

// Shape of a single cross-exam arrow: A challenges B on some point.
export interface CrossArrow {
  from: string;
  to: string;
  point: string;
}
