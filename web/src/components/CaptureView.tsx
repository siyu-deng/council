import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DistillProgress } from "./DistillProgress";
import { useCapture } from "@/lib/capture-store";
import type { CouncilEvent } from "@/lib/types";
import { CouncilSocket, startCapture, startDistill } from "@/lib/ws";

// --- Mock fixture (used when backend is unavailable) ----------------------

const MOCK_CAPTURE_RUN = "mock-capture-2026-04-24-xxx";
const MOCK_DISTILL_RUN = "mock-distill-2026-04-24-xxx";
const MOCK_SESSION_ID = "2026-04-24-ai-product-decision";

function mockCaptureEvents(): CouncilEvent[] {
  const base = Date.now();
  return [
    { t: "run.started", run_id: MOCK_CAPTURE_RUN, verb: "capture", ts: base },
    { t: "phase.started", run_id: MOCK_CAPTURE_RUN, phase: "title", ts: base + 10 },
    {
      t: "result",
      run_id: MOCK_CAPTURE_RUN,
      kind: "session",
      data: {
        id: MOCK_SESSION_ID,
        title: "AI 产品转型的取舍",
        filePath: `sessions/${MOCK_SESSION_ID}.md`,
      },
      ts: base + 1400,
    },
    { t: "phase.done", run_id: MOCK_CAPTURE_RUN, phase: "title", ts: base + 1420 },
    { t: "run.done", run_id: MOCK_CAPTURE_RUN, verb: "capture", ts: base + 1500 },
  ];
}

function mockDistillEvents(): CouncilEvent[] {
  const base = Date.now();
  const hl = (
    id: string,
    delta: number,
    data: {
      type: string;
      title: string;
      user_quote: string;
      why_non_trivial: string;
      trigger: string;
      underlying_belief: string;
      confidence: number;
    },
  ): CouncilEvent => ({
    t: "result",
    run_id: MOCK_DISTILL_RUN,
    kind: "highlight",
    data: { id, session_id: MOCK_SESSION_ID, data },
    ts: base + delta,
  });

  return [
    { t: "run.started", run_id: MOCK_DISTILL_RUN, verb: "distill", ts: base },
    { t: "phase.started", run_id: MOCK_DISTILL_RUN, phase: "identify", ts: base + 50 },
    hl("h1", 1200, {
      type: "problem-reframing",
      title: "不是辞不辞职，而是杠杆积累",
      user_quote:
        "问题其实不是我要不要跳 AI，而是我有没有能产生非线性回报的东西。",
      why_non_trivial:
        "把一个「要不要行动」的二元问题转成「我手里有什么资产」的资产视角，是典型的问题重构。",
      trigger: "在面对重大职业选择时",
      underlying_belief: "选择本身没有意义，除非你知道你在积累什么",
      confidence: 0.88,
    }),
    hl("h2", 2400, {
      type: "decision-heuristic",
      title: "MRR 覆盖生活费再跳",
      user_quote:
        "如果这件事真的值得全职，那至少先做到 MRR 能覆盖我一半生活费。",
      why_non_trivial:
        "自发地把一个模糊的「要不要辞职」问题量化为一个可验证的门槛，是决策启发。",
      trigger: "考虑放弃稳定收入去追求新机会时",
      underlying_belief: "勇气 ≠ 鲁莽，验证 = 尊重自己",
      confidence: 0.82,
    }),
    hl("h3", 3600, {
      type: "meta-insight",
      title: "对「全职才做得好」保持怀疑",
      user_quote: "「等我有了完整时间就能做好」好像是一种拖延症借口。",
      why_non_trivial:
        "用户自己识破了一个常见的自我欺骗叙事，这是 meta-insight。",
      trigger: "在思考时间分配和做事动力时",
      underlying_belief: "时间不是瓶颈，杠杆才是",
      confidence: 0.76,
    }),
    { t: "phase.done", run_id: MOCK_DISTILL_RUN, phase: "identify", ts: base + 4000 },
    { t: "phase.started", run_id: MOCK_DISTILL_RUN, phase: "forge", ts: base + 4100 },
    {
      t: "result",
      run_id: MOCK_DISTILL_RUN,
      kind: "persona",
      data: {
        ref: "self:leverage-first",
        description: "以杠杆积累为第一性原理的你",
      },
      ts: base + 5400,
    },
    { t: "phase.done", run_id: MOCK_DISTILL_RUN, phase: "forge", ts: base + 5500 },
    { t: "run.done", run_id: MOCK_DISTILL_RUN, verb: "distill", ts: base + 5600 },
  ];
}

async function playMockStream(
  events: CouncilEvent[],
  sink: (e: CouncilEvent) => void,
  signal: { cancelled: boolean },
) {
  for (const e of events) {
    if (signal.cancelled) return;
    sink(e);
    await new Promise((r) => setTimeout(r, 280 + Math.random() * 180));
  }
}

// --- Main component --------------------------------------------------------

export function CaptureView() {
  const stage = useCapture((s) => s.stage);
  const session = useCapture((s) => s.session);
  const highlights = useCapture((s) => s.highlights);
  const personas = useCapture((s) => s.personas);
  const reset = useCapture((s) => s.reset);
  const setBody = useCapture((s) => s.setBody);
  const setCaptureRunId = useCapture((s) => s.setCaptureRunId);
  const setDistillRunId = useCapture((s) => s.setDistillRunId);
  const setStage = useCapture((s) => s.setStage);
  const setMock = useCapture((s) => s.setMock);
  const setError = useCapture((s) => s.setError);
  const ingestCapture = useCapture((s) => s.ingestCapture);
  const ingestDistill = useCapture((s) => s.ingestDistill);

  const [input, setInput] = useState("");
  const captureSockRef = useRef<CouncilSocket | null>(null);
  const distillSockRef = useRef<CouncilSocket | null>(null);
  const mockCancel = useRef<{ cancelled: boolean } | null>(null);
  // `true` once we have already kicked off distill for the current session.
  const distillKickedRef = useRef(false);

  // Tear down WS on unmount.
  useEffect(() => {
    return () => {
      captureSockRef.current?.close();
      distillSockRef.current?.close();
      if (mockCancel.current) mockCancel.current.cancelled = true;
    };
  }, []);

  // Helper: start distill once we know the session id.
  const kickDistill = useCallback(
    async (sessionId: string) => {
      if (distillKickedRef.current) return;
      distillKickedRef.current = true;
      try {
        const { run_id } = await startDistill({ sessionId });
        setDistillRunId(run_id);
        setStage("distilling");
        const sock = new CouncilSocket({
          runId: run_id,
          sink: (e) => ingestDistill(e),
        });
        sock.open();
        distillSockRef.current = sock;
      } catch (err) {
        // If distill HTTP call fails, fall back to mock distill.
        console.warn("distill start failed, falling back to mock", err);
        setMock(true);
        setStage("distilling");
        const cancel = { cancelled: false };
        mockCancel.current = cancel;
        await playMockStream(
          mockDistillEvents(),
          (e) => ingestDistill(e),
          cancel,
        );
      }
    },
    [ingestDistill, setDistillRunId, setMock, setStage],
  );

  // Whenever the capture flow produces a session, kick distill.
  useEffect(() => {
    if (session && !distillKickedRef.current) {
      // Only chain if we're in mock-of-capture or a real capture run is done.
      // The session event arrives before run.done; kicking here is fine
      // because the backend distill command runs independently.
      void kickDistill(session.id);
    }
  }, [session, kickDistill]);

  // Sink wrapper that ingests capture events AND forwards them to the store.
  const captureIngest = useCallback(
    (e: CouncilEvent) => {
      ingestCapture(e);
    },
    [ingestCapture],
  );

  async function handleDistill() {
    const body = input.trim();
    if (!body) return;
    setBody(body);
    setStage("capturing");
    setError(null);
    distillKickedRef.current = false;

    try {
      const { run_id } = await startCapture(body);
      setCaptureRunId(run_id);
      const sock = new CouncilSocket({
        runId: run_id,
        sink: captureIngest,
      });
      sock.open();
      captureSockRef.current = sock;
    } catch (err) {
      console.warn("capture start failed, falling back to mock", err);
      // Full mock fallback for both capture and distill.
      setMock(true);
      setCaptureRunId(MOCK_CAPTURE_RUN);
      const cancel = { cancelled: false };
      mockCancel.current = cancel;
      await playMockStream(mockCaptureEvents(), captureIngest, cancel);
      // The `session` effect above will trigger distill kick automatically.
    }
  }

  function handleRestart() {
    captureSockRef.current?.close();
    distillSockRef.current?.close();
    if (mockCancel.current) mockCancel.current.cancelled = true;
    captureSockRef.current = null;
    distillSockRef.current = null;
    distillKickedRef.current = false;
    setInput("");
    reset();
  }

  function handleConvene() {
    // Suggest a natural next-step question based on the captured title + any
    // forged persona. Fall back to a generic prompt.
    const base = session?.title ?? "我刚捕获的这段思考";
    const q =
      personas.length > 0
        ? `请以我新锻造的 ${personas[0].ref} 视角, 继续推进「${base}」`
        : `围绕「${base}」, 我接下来该做什么？`;
    const url = new URL(window.location.href);
    url.searchParams.delete("view");
    url.pathname = "/";
    url.searchParams.set("q", q);
    window.location.href = url.toString();
  }

  // Idle state: the textarea. Centered, salon-style.
  if (stage === "idle") {
    return (
      <div className="relative z-10 mx-auto flex h-full w-full max-w-3xl flex-col items-center justify-center gap-6 px-6 py-10">
        <div className="text-center">
          <div className="mb-3 text-4xl">🕯️</div>
          <h1 className="font-serif text-3xl italic text-amber-glow">
            捕获 · 蒸馏
          </h1>
          <p className="mx-auto mt-2 max-w-md text-sm text-parchment/60">
            粘贴一段你和 AI 的深度对话，让议会从中雕刻出真正属于你的思考碎片。
          </p>
        </div>

        <form
          className="flex w-full flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            void handleDistill();
          }}
        >
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="粘贴你和 AI 的深度对话…"
            autoFocus
            rows={14}
            className="scroll-thin w-full resize-none rounded-lg border border-amber-dim/40 bg-ink/60 px-5 py-4 font-serif text-base leading-relaxed text-parchment placeholder:text-parchment/30 focus-visible:border-amber-glow/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-glow"
          />
          <div className="flex items-center justify-between">
            <span className="text-xs text-parchment/40">
              {input.length > 0 ? `${input.length} 字` : "Ctrl / ⌘ + V 粘贴即可"}
            </span>
            <Button
              type="submit"
              size="lg"
              disabled={!input.trim()}
            >
              开始蒸馏 ⇄
            </Button>
          </div>
        </form>
      </div>
    );
  }

  // Running / done: split view.
  return (
    <div className="relative z-10 mx-auto flex h-full w-full max-w-6xl flex-col gap-6 overflow-y-auto px-6 py-10 scroll-thin">
      <header className="flex items-start justify-between gap-4">
        <div>
          <div className="tag-ref mb-1">
            {stage === "done" ? "蒸馏完成" : "蒸馏进行中"}
          </div>
          <h2 className="font-serif text-2xl italic text-amber-glow">
            {session?.title ?? "正在理解你的对话…"}
          </h2>
          {session?.id && (
            <div className="mt-1 font-mono text-[10px] tracking-widest text-parchment/40">
              {session.id}
            </div>
          )}
        </div>
        <Button variant="ghost" size="sm" onClick={handleRestart}>
          重新开始
        </Button>
      </header>

      <div className="grid flex-1 grid-cols-1 gap-6 lg:grid-cols-[1fr_1fr]">
        {/* Left: the pasted transcript, serving as the raw material */}
        <div className="flex min-h-0 flex-col gap-2">
          <div className="tag-ref">原始对话</div>
          <TranscriptPane />
        </div>

        {/* Right: the distill progress + highlights + personas */}
        <div className="flex min-h-0 flex-col">
          <DistillProgress />
        </div>
      </div>

      <AnimatePresence>
        {stage === "done" && (
          <motion.div
            key="summary"
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.8, ease: "easeOut" }}
            className="mt-2"
          >
            <Card className="decree p-6">
              <div className="tag-ref mb-1 text-center">议会的收获</div>
              <div className="mb-4 text-center font-serif text-xl italic text-amber-glow">
                🕯️ 雕刻完成
              </div>
              <p className="mb-6 text-center font-serif text-lg leading-relaxed text-parchment">
                从这段对话里, 你拥有了 {" "}
                <span className="text-amber-glow">{highlights.length}</span>{" "}
                个思考高光
                {personas.length > 0 && (
                  <>
                    {" 和 "}
                    <span className="text-amber-glow">{personas.length}</span>{" "}
                    个新 persona
                  </>
                )}
                。
              </p>

              <div className="flex flex-wrap justify-center gap-3">
                <Button size="lg" onClick={handleConvene}>
                  现在召集议会 →
                </Button>
                <Button variant="outline" size="lg" onClick={handleRestart}>
                  再捕获一段
                </Button>
              </div>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function TranscriptPane() {
  const body = useCapture((s) => s.body);
  return (
    <div className="scroll-thin min-h-[320px] max-h-[60vh] overflow-y-auto rounded-xl border border-amber-dim/30 bg-ink-soft/40 p-4 backdrop-blur">
      <pre className="whitespace-pre-wrap font-serif text-sm leading-relaxed text-parchment/75">
        {body || "(空)"}
      </pre>
    </div>
  );
}
