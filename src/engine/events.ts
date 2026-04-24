/**
 * Council Event Bus
 * ─────────────────
 * 所有动词 (capture / distill / convene / evolve) 的运行时都通过这里发事件。
 * 事件既写入 ~/.council/live/<id>.jsonl (single source of truth, 可重放),
 * 也 broadcast 给所有订阅的 sink (CLI stderr / WebSocket / 未来的 telemetry)。
 *
 * 核心原则:
 * 1. 事件 schema 通用化, 支持所有动词共享 (不只为 convene 设计)
 * 2. 双 sink 必选: 文件 + 运行时订阅, 缺一不可 — 文件是单一真相, 内存是延迟优化
 * 3. sink 之间完全解耦: CLI renderer 和 WS broadcaster 互不知道
 */

import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { paths, ensureDir } from "../core/paths.ts";

// ──────────────────────────────────────────────────────────
// Event schema (通用, 所有动词共享)
// ──────────────────────────────────────────────────────────

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

/**
 * 事件总线的统一 schema。
 * `verb`: 当前动词 (convene / capture / distill / evolve)
 * `phase`: 动词内部阶段, 命名由动词自己决定
 * `kind`: 事件类别 — started / chunk / item / done / failed 五选一
 *
 * 这个三元组 (verb, phase, kind) 足以描述所有生命周期事件。
 */
export type Verb = "convene" | "capture" | "distill" | "evolve";

export type CouncilEvent =
  // —— 运行开始/结束 ——
  | {
      t: "run.started";
      run_id: string;
      verb: Verb;
      ts: number;
      meta?: Record<string, unknown>;
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

  // —— 阶段边界 ——
  | {
      t: "phase.started";
      run_id: string;
      phase: string;
      ts: number;
      meta?: Record<string, unknown>;
    }
  | {
      t: "phase.done";
      run_id: string;
      phase: string;
      ts: number;
      meta?: Record<string, unknown>;
    }

  // —— 召集议会特有 ——
  | {
      t: "summon.done";
      run_id: string;
      selected: PersonaMeta[];
      rationale: string;
      ts: number;
    }

  // —— 流式文本 chunk (statements / cross-exam / synthesis 通用) ——
  | {
      t: "chunk";
      run_id: string;
      phase: string;
      persona?: string; // persona ref, synthesis 阶段为空
      text: string;
      ts: number;
    }

  // —— 单个"件" 完成 (一个 persona 的 statement / 一个 cross-exam / 一个 highlight) ——
  | {
      t: "item.done";
      run_id: string;
      phase: string;
      key: string; // persona ref 或 highlight id
      payload: unknown;
      ts: number;
    }

  // —— 结构化结果 (synthesis JSON / persona forged / session captured) ——
  | {
      t: "result";
      run_id: string;
      kind: string; // 'synthesis' | 'persona' | 'session' | 'highlight'
      data: unknown;
      ts: number;
    }

  // —— 日志/诊断信息 (供 CLI renderer 展示, 不进 transcript) ——
  | {
      t: "log";
      run_id: string;
      level: "info" | "warn" | "error" | "muted";
      msg: string;
      ts: number;
    };

// ──────────────────────────────────────────────────────────
// Sink 接口 (订阅者)
// ──────────────────────────────────────────────────────────

export type Sink = (e: CouncilEvent) => void;

// ──────────────────────────────────────────────────────────
// Bus 实现
// ──────────────────────────────────────────────────────────

class Bus {
  private sinks = new Set<Sink>();
  // 每个 run 对应一个 NDJSON 文件, 打开一次复用
  private fileHandles = new Map<string, string>(); // run_id → file path

  subscribe(sink: Sink): () => void {
    this.sinks.add(sink);
    return () => this.sinks.delete(sink);
  }

  emit(e: CouncilEvent): void {
    // 1. 写文件 (single source of truth)
    try {
      const filePath = this.ensureFile(e.run_id);
      appendFileSync(filePath, JSON.stringify(e) + "\n", "utf-8");
    } catch {
      // 文件写失败不能阻塞运行时 (比如权限问题), silent fail
    }
    // 2. broadcast 给所有 sink
    for (const sink of this.sinks) {
      try {
        sink(e);
      } catch {
        // 一个 sink 挂掉不能影响其他 sink
      }
    }
  }

  /** 读取指定 run 的所有事件 (网页重连时做 replay 用) */
  replay(runId: string): CouncilEvent[] {
    const filePath = this.filePath(runId);
    if (!existsSync(filePath)) return [];
    try {
      return readFileSync(filePath, "utf-8")
        .split("\n")
        .filter(Boolean)
        .map((l) => JSON.parse(l) as CouncilEvent);
    } catch {
      return [];
    }
  }

  /** 列出所有 run_id, 按文件 mtime 倒序 */
  listRuns(): string[] {
    const dir = paths.live();
    if (!existsSync(dir)) return [];
    const fs = require("node:fs") as typeof import("node:fs");
    try {
      return fs
        .readdirSync(dir)
        .filter((f) => f.endsWith(".jsonl"))
        .map((f) => ({
          id: f.replace(/\.jsonl$/, ""),
          mtime: fs.statSync(join(dir, f)).mtimeMs,
        }))
        .sort((a, b) => b.mtime - a.mtime)
        .map((x) => x.id);
    } catch {
      return [];
    }
  }

  private filePath(runId: string): string {
    return join(paths.live(), `${runId}.jsonl`);
  }

  private ensureFile(runId: string): string {
    if (this.fileHandles.has(runId)) return this.fileHandles.get(runId)!;
    const fp = this.filePath(runId);
    ensureDir(dirname(fp));
    this.fileHandles.set(runId, fp);
    return fp;
  }
}

// 单例
export const bus = new Bus();

// ──────────────────────────────────────────────────────────
// 便捷工具
// ──────────────────────────────────────────────────────────

export function newRunId(verb: Verb, slug?: string): string {
  const date = new Date().toISOString().slice(0, 10);
  const rand = Math.random().toString(36).slice(2, 8);
  const base = slug ? `${date}-${slug}` : `${date}-${verb}`;
  return `${base}-${rand}`;
}

/** 时间戳工具 */
export const now = () => Date.now();

/** 构造一个带 run_id 的 emit helper, 避免到处重复传 run_id */
export function makeEmitter(runId: string, verb: Verb) {
  return {
    runStarted: (meta?: Record<string, unknown>) =>
      bus.emit({ t: "run.started", run_id: runId, verb, ts: now(), meta }),
    runDone: (result?: Record<string, unknown>) =>
      bus.emit({ t: "run.done", run_id: runId, verb, ts: now(), result }),
    runFailed: (error: string) =>
      bus.emit({ t: "run.failed", run_id: runId, verb, ts: now(), error }),
    phaseStarted: (phase: string, meta?: Record<string, unknown>) =>
      bus.emit({ t: "phase.started", run_id: runId, phase, ts: now(), meta }),
    phaseDone: (phase: string, meta?: Record<string, unknown>) =>
      bus.emit({ t: "phase.done", run_id: runId, phase, ts: now(), meta }),
    summonDone: (selected: PersonaMeta[], rationale: string) =>
      bus.emit({
        t: "summon.done",
        run_id: runId,
        selected,
        rationale,
        ts: now(),
      }),
    chunk: (phase: string, text: string, persona?: string) =>
      bus.emit({ t: "chunk", run_id: runId, phase, text, persona, ts: now() }),
    itemDone: (phase: string, key: string, payload: unknown) =>
      bus.emit({
        t: "item.done",
        run_id: runId,
        phase,
        key,
        payload,
        ts: now(),
      }),
    result: (kind: string, data: unknown) =>
      bus.emit({ t: "result", run_id: runId, kind, data, ts: now() }),
    log: (level: "info" | "warn" | "error" | "muted", msg: string) =>
      bus.emit({ t: "log", run_id: runId, level, msg, ts: now() }),
  };
}
