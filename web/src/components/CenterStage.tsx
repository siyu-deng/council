import { motion, AnimatePresence } from "framer-motion";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { ChunkBubble } from "./ChunkBubble";
import { useCouncil } from "@/lib/store";

interface Props {
  prefillQuestion: string;
  onConvene: (question: string) => void;
  isBusy: boolean;
}

// The center of the round table. Three states:
// - idle (no run): the question input
// - running (no synthesis yet): show the question large
// - synthesis: the decree card
export function CenterStage({ prefillQuestion, onConvene, isBusy }: Props) {
  const runId = useCouncil((s) => s.runId);
  const question = useCouncil((s) => s.question);
  const phase = useCouncil((s) => s.phase);
  const synthesis = useCouncil((s) => s.synthesis);
  const synthesisBuffer = useCouncil((s) => s.synthesisBuffer);
  const rationale = useCouncil((s) => s.rationale);
  const reset = useCouncil((s) => s.reset);

  const [input, setInput] = useState(prefillQuestion);
  useEffect(() => {
    if (prefillQuestion) setInput(prefillQuestion);
  }, [prefillQuestion]);

  // Idle: show input.
  if (!runId && !isBusy) {
    return (
      <div className="flex max-w-xl flex-col items-center gap-6 text-center">
        <div className="text-4xl">🕯️</div>
        <h1 className="font-serif text-3xl italic text-amber-glow">
          思考议会
        </h1>
        <p className="text-sm text-parchment/60">
          召集你信任的头脑围坐圆桌，让他们替你辩论、拆穿、综合。
          <br />
          你是议长。
        </p>
        <form
          className="flex w-full flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (!input.trim()) return;
            onConvene(input.trim());
          }}
        >
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="你面前有什么决定？"
            autoFocus
            className="text-center text-base"
          />
          <Button
            type="submit"
            size="lg"
            disabled={!input.trim()}
            className="mx-auto"
          >
            召集议会 ⇄
          </Button>
        </form>
        <button
          type="button"
          className="text-xs text-parchment/40 underline underline-offset-4 hover:text-amber-glow"
          onClick={() => {
            const url = new URL(window.location.href);
            url.searchParams.set("mock", "1");
            window.location.href = url.toString();
          }}
        >
          或 · 查看一次 Mock 辩论
        </button>
      </div>
    );
  }

  // Running: show question + (optionally) synthesis card.
  return (
    <div className="flex w-full max-w-2xl flex-col items-center gap-4 text-center">
      {/* The question, large and italic */}
      <motion.div
        initial={{ opacity: 0, y: -6 }}
        animate={{ opacity: 1, y: 0 }}
        className="px-4"
      >
        <div className="tag-ref mb-2">议题</div>
        <h2 className="font-serif text-2xl italic leading-snug text-parchment">
          {question || "…"}
        </h2>
      </motion.div>

      {/* Summon rationale, if any */}
      {rationale && !synthesis && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
          className="max-w-md text-xs leading-relaxed text-parchment/50"
        >
          {rationale}
        </motion.div>
      )}

      {/* Phase indicator pill */}
      <PhaseIndicator phase={phase} />

      {/* Synthesis streaming bubble */}
      <ChunkBubble
        text={synthesisBuffer}
        visible={phase === "synthesis" && !synthesis}
      />

      {/* Decree card */}
      <AnimatePresence>
        {synthesis && (
          <motion.div
            key="decree"
            initial={{ opacity: 0, scale: 0.85, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.8, ease: "easeOut" }}
            className="mt-2 w-full"
          >
            <Card className="decree p-6 text-left">
              <div className="tag-ref mb-1 text-center">议会决议</div>
              <div className="mb-4 text-center font-serif text-xl italic text-amber-glow">
                🕯️ 决策
              </div>
              <p className="mb-6 font-serif text-lg leading-relaxed text-parchment">
                {synthesis.decision}
              </p>

              {synthesis.consensus.length > 0 && (
                <div className="mb-4">
                  <div className="tag-ref mb-2">共识</div>
                  <ul className="space-y-1 text-sm text-parchment/85">
                    {synthesis.consensus.map((c, i) => (
                      <li key={i} className="flex gap-2">
                        <span className="text-amber-glow/70">·</span>
                        <span>{c}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {synthesis.disputes.length > 0 && (
                <div className="mb-4">
                  <div className="tag-ref mb-2">分歧</div>
                  <ul className="space-y-2 text-sm text-parchment/75">
                    {synthesis.disputes.map((d, i) => (
                      <li key={i}>
                        <span className="tag-ref">
                          {d.a} ⇄ {d.b}
                        </span>
                        <div>{d.point}</div>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {synthesis.meta_insight && (
                <div className="mt-5 border-t border-amber-dim/30 pt-4">
                  <div className="tag-ref mb-2">💡 元洞察</div>
                  <p className="font-serif italic leading-relaxed text-parchment/90">
                    {synthesis.meta_insight}
                  </p>
                </div>
              )}

              <div className="mt-6 flex justify-center gap-3">
                <Button variant="ghost" size="sm" onClick={reset}>
                  重开议会
                </Button>
              </div>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function PhaseIndicator({ phase }: { phase: string | null }) {
  if (!phase) return null;
  const label: Record<string, string> = {
    summon: "召集中",
    statement: "陈述中",
    cross: "交锋中 ⚡",
    synthesis: "综合中",
  };
  return (
    <div className="flex items-center gap-2 rounded-full border border-amber-dim/40 bg-ink/60 px-3 py-1">
      <span className="h-1.5 w-1.5 animate-flicker rounded-full bg-amber-glow" />
      <span className="tag-ref">{label[phase] ?? phase}</span>
    </div>
  );
}
