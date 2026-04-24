import { useEffect, useState } from "react";
import { RoundTable } from "@/components/RoundTable";
import { useCouncil } from "@/lib/store";
import { playMock } from "@/lib/fixtures";
import { CouncilSocket, startConvene } from "@/lib/ws";

// Single-page app. Read ?mock=1 or ?q= from URL on boot.
export default function App() {
  const connection = useCouncil((s) => s.connection);
  const runId = useCouncil((s) => s.runId);
  const running = useCouncil((s) => s.running);
  const setQuestion = useCouncil((s) => s.setQuestion);
  const reset = useCouncil((s) => s.reset);

  const [prefillQ, setPrefillQ] = useState<string>("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const mock = params.get("mock");
    const q = params.get("q") ?? "";
    if (q) setPrefillQ(q);
    if (mock === "1") {
      const stop = playMock();
      return () => stop();
    }
    return;
  }, []);

  // When a real run starts, attach a socket.
  useEffect(() => {
    if (!runId || connection === "mock") return;
    const sock = new CouncilSocket({ runId });
    sock.open();
    return () => sock.close();
  }, [runId, connection]);

  // Kick off a new convene via HTTP.
  async function handleConvene(question: string) {
    setQuestion(question);
    reset();
    setQuestion(question);
    try {
      const { run_id } = await startConvene(question);
      // Ingesting run.started would happen once WS replays; the effect above
      // will have to observe runId — so set it here by ingesting a synthetic
      // run.started so the UI is immediately responsive.
      useCouncil.getState().ingest({
        t: "run.started",
        run_id,
        verb: "convene",
        ts: Date.now(),
        meta: { question },
      });
    } catch (err) {
      console.error("convene failed — falling back to mock", err);
      // Hackathon fallback: if backend not up, play the mock so the demo works.
      playMock();
    }
  }

  return (
    <div className="relative h-full w-full overflow-hidden">
      <ConnectionBadge state={connection} />
      <RoundTable
        prefillQuestion={prefillQ}
        onConvene={handleConvene}
        isBusy={running}
      />
    </div>
  );
}

function ConnectionBadge({ state }: { state: string }) {
  const label: Record<string, string> = {
    offline: "离线",
    connecting: "连接中…",
    live: "已连通",
    mock: "Mock 模式",
  };
  const tone: Record<string, string> = {
    offline: "text-parchment/40",
    connecting: "text-amber-warm animate-flicker",
    live: "text-amber-glow",
    mock: "text-amber-warm",
  };
  return (
    <div className="pointer-events-none absolute right-4 top-4 z-40 flex items-center gap-2 text-xs">
      <span className={`tag-ref ${tone[state] ?? ""}`}>🕯️ {label[state]}</span>
    </div>
  );
}
