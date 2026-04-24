import { useCouncil } from "./store";
import type { CouncilEvent, PersonaMeta, SynthesisJSON } from "./types";

// Offline fixture — produces a realistic 3-persona convene run.
// Used when ?mock=1 or when WS is unavailable.

const RUN_ID = "mock-2026-04-24-founder-quit";

const QUESTION = "我应该放弃现在的前端工作，全职做 AI 产品吗？";

const PERSONAS: PersonaMeta[] = [
  {
    ref: "self:first-principles",
    type: "self",
    description: "你自己的第一性原理思考模式",
    avatar: "🌱",
    color: "#E8B563",
  },
  {
    ref: "mentors:naval",
    type: "mentor",
    description: "Naval Ravikant · 杠杆、专注、长期主义",
    avatar: "N",
    color: "#6BA3C9",
  },
  {
    ref: "roles:devils-advocate",
    type: "role",
    description: "魔鬼代言人 · 戳穿一切自我欺骗",
    avatar: "🔥",
    color: "#D4594A",
  },
];

const RATIONALE =
  "这是一个涉及职业、财务、长期目标的重大决策。召集第一性原理（帮你回到本质）、Naval（提供杠杆视角）和魔鬼代言人（戳穿侥幸心理）。";

const STATEMENTS: Record<string, string> = {
  "self:first-principles":
    "从第一性原理看，这个决定的本质不是「前端 vs AI」，而是「稳定现金流 vs 未验证的增长曲线」。你真正要回答的是：未来 18 个月，哪条路径能让你学到最多、积累最多的不可替代性？如果 AI 方向的 L(learning) * T(time) 显著大于现在，那问题就从「要不要跳」变成了「如何最小化 downside 地跳」。",
  "mentors:naval":
    "关键不是「要不要辞职」，而是「你是否已经构建了杠杆？」。代码是杠杆，受众是杠杆，资本也是杠杆。如果你还没有任何一种非线性回报的杠杆，辞职去做 AI 只是把时薪从一种工作换成另一种。先在业余时间把一个 AI 产品做到有真实用户付费，再谈全职。Specific knowledge 是独特的，不是某个框架。",
  "roles:devils-advocate":
    "让我直说：你可能只是在逃避现在工作的无聊，而不是真的看到了 AI 的机会。如果 AI 真的那么好，为什么你不能现在就用下班时间做出一个 MVP？「全职」往往是拖延症的借口——「等我有了完整的时间就能做好」是一种幻觉。另外，你有多少个月的跑道？没想清楚这个就跳，三个月后你会回来做一份更差的前端工作。",
};

const CROSS_EXAMS = [
  {
    from: "roles:devils-advocate",
    to: "self:first-principles",
    point: "你说的「学到最多」只是情绪化的表达。具体指标是什么？没有指标就不是第一性原理。",
  },
  {
    from: "mentors:naval",
    to: "roles:devils-advocate",
    point: "同意你的节奏感，但也别走到另一个极端——有些事情确实需要全职才能有非线性突破，关键是验证而不是恐惧。",
  },
  {
    from: "self:first-principles",
    to: "mentors:naval",
    point: "杠杆需要时间积累。如果我现在的工作让我每天只有 2 小时创作时间，12 个月后的杠杆会不会已经晚了？",
  },
];

const SYNTHESIS: SynthesisJSON = {
  consensus: [
    "现在直接全职跳 AI 风险过大，需要先在业余时间验证",
    "真正的问题是「杠杆积累」而不是「时间分配」",
    "必须有可量化的指标（付费用户数、收入）再决定跳还是留",
  ],
  disputes: [
    {
      a: "self:first-principles",
      b: "mentors:naval",
      point: "副业时间是否足够构建杠杆 —— 取决于个人状态和产品类型",
    },
    {
      a: "roles:devils-advocate",
      b: "self:first-principles",
      point: "是否真的理解现状本质 vs 被情绪驱动",
    },
  ],
  decision:
    "未来 90 天：不辞职。下班 + 周末做一个 AI 产品到 10 个付费用户。达成后再评估是否辞职，届时用「6 个月跑道 + MRR 覆盖基本生活」作为硬门槛。",
  meta_insight:
    "你问的不是「要不要跳」，而是「我是不是还不够勇敢」。Naval 和魔鬼代言人其实说的是同一件事：勇气 ≠ 鲁莽，验证 = 尊重自己。",
};

// Split a long string into small streaming-shaped chunks.
function chunkify(s: string, size = 8): string[] {
  const arr: string[] = [];
  for (let i = 0; i < s.length; i += size) arr.push(s.slice(i, i + size));
  return arr;
}

// Build the full ordered event stream.
export function mockEvents(): CouncilEvent[] {
  const events: CouncilEvent[] = [];
  let t = Date.now();
  const tick = (step = 1) => (t += step);

  events.push({
    t: "run.started",
    run_id: RUN_ID,
    verb: "convene",
    ts: tick(),
    meta: { question: QUESTION },
  });

  // Phase: summon
  events.push({ t: "phase.started", run_id: RUN_ID, phase: "summon", ts: tick() });
  events.push({
    t: "summon.done",
    run_id: RUN_ID,
    selected: PERSONAS,
    rationale: RATIONALE,
    ts: tick(),
  });
  events.push({ t: "phase.done", run_id: RUN_ID, phase: "summon", ts: tick() });

  // Phase: statement (parallel)
  events.push({
    t: "phase.started",
    run_id: RUN_ID,
    phase: "statement",
    ts: tick(),
    meta: { parallel: 3 },
  });
  // Interleave chunks from all three personas.
  const queues = PERSONAS.map((p) => ({
    persona: p.ref,
    chunks: chunkify(STATEMENTS[p.ref]!, 6),
  }));
  let done = 0;
  const doneFlags: Record<string, boolean> = {};
  while (done < queues.length) {
    for (const q of queues) {
      if (doneFlags[q.persona]) continue;
      const next = q.chunks.shift();
      if (!next) {
        doneFlags[q.persona] = true;
        done++;
        events.push({
          t: "item.done",
          run_id: RUN_ID,
          phase: "statement",
          key: q.persona,
          payload: { text: STATEMENTS[q.persona] },
          ts: tick(),
        });
        continue;
      }
      events.push({
        t: "chunk",
        run_id: RUN_ID,
        phase: "statement",
        persona: q.persona,
        text: next,
        ts: tick(),
      });
    }
  }
  events.push({
    t: "phase.done",
    run_id: RUN_ID,
    phase: "statement",
    ts: tick(),
  });

  // Phase: cross-exam
  events.push({
    t: "phase.started",
    run_id: RUN_ID,
    phase: "cross",
    ts: tick(),
  });
  for (const ex of CROSS_EXAMS) {
    // A short warning chunk from the speaker to indicate they're firing.
    for (const ch of chunkify(ex.point, 8)) {
      events.push({
        t: "chunk",
        run_id: RUN_ID,
        phase: "cross",
        persona: ex.from,
        text: ch,
        ts: tick(),
      });
    }
    events.push({
      t: "item.done",
      run_id: RUN_ID,
      phase: "cross",
      key: `${ex.from}->${ex.to}`,
      payload: ex,
      ts: tick(),
    });
  }
  events.push({ t: "phase.done", run_id: RUN_ID, phase: "cross", ts: tick() });

  // Phase: synthesis
  events.push({
    t: "phase.started",
    run_id: RUN_ID,
    phase: "synthesis",
    ts: tick(),
  });
  for (const ch of chunkify(
    "正在整合议会意见… 寻找共识与分歧… 产出决策…",
    4,
  )) {
    events.push({
      t: "chunk",
      run_id: RUN_ID,
      phase: "synthesis",
      text: ch,
      ts: tick(),
    });
  }
  events.push({
    t: "result",
    run_id: RUN_ID,
    kind: "synthesis",
    data: SYNTHESIS,
    ts: tick(),
  });
  events.push({
    t: "phase.done",
    run_id: RUN_ID,
    phase: "synthesis",
    ts: tick(),
  });

  events.push({
    t: "run.done",
    run_id: RUN_ID,
    verb: "convene",
    ts: tick(),
    result: { transcriptPath: "mock.md", transcriptId: "mock" },
  });

  return events;
}

// Play events through the store with realistic per-event delays.
export function playMock(): () => void {
  const events = mockEvents();
  let cancelled = false;
  useCouncil.getState().setConnection("mock");

  (async () => {
    for (const e of events) {
      if (cancelled) return;
      useCouncil.getState().ingest(e);
      const delay = chunkDelay(e);
      await sleep(delay);
    }
  })();

  return () => {
    cancelled = true;
  };
}

function chunkDelay(e: CouncilEvent): number {
  switch (e.t) {
    case "chunk":
      return 40 + Math.random() * 60;
    case "item.done":
      return 180;
    case "phase.started":
    case "phase.done":
      return 400;
    case "summon.done":
      return 600;
    case "result":
      return 500;
    default:
      return 100;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
