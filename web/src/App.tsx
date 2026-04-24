import { useEffect, useState } from "react";
import { RoundTable } from "@/components/RoundTable";
import { CaptureView } from "@/components/CaptureView";
import { useCouncil } from "@/lib/store";
import { playMock } from "@/lib/fixtures";
import { CouncilSocket, startConvene } from "@/lib/ws";

type View = "council" | "capture";

function detectView(): View {
  const params = new URLSearchParams(window.location.search);
  if (params.get("view") === "capture") return "capture";
  if (window.location.pathname.replace(/\/+$/, "") === "/capture") {
    return "capture";
  }
  return "council";
}

// Single-page app. Read ?mock=1 or ?q= from URL on boot.
export default function App() {
  const connection = useCouncil((s) => s.connection);
  const runId = useCouncil((s) => s.runId);
  const running = useCouncil((s) => s.running);
  const setQuestion = useCouncil((s) => s.setQuestion);
  const reset = useCouncil((s) => s.reset);

  const [view, setView] = useState<View>(() => detectView());
  const [prefillQ, setPrefillQ] = useState<string>("");

  // React to back/forward navigation so the pill nav feels real.
  useEffect(() => {
    function onPop() {
      setView(detectView());
    }
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const mock = params.get("mock");
    const q = params.get("q") ?? "";
    if (q) setPrefillQ(q);
    if (mock === "1" && view === "council") {
      const stop = playMock();
      return () => stop();
    }
    return;
  }, [view]);

  // When a real convene run starts, attach a socket (only for council view).
  useEffect(() => {
    if (view !== "council") return;
    if (!runId || connection === "mock") return;
    const sock = new CouncilSocket({ runId });
    sock.open();
    return () => sock.close();
  }, [runId, connection, view]);

  function navigate(next: View) {
    const url = new URL(window.location.href);
    if (next === "capture") {
      url.searchParams.set("view", "capture");
    } else {
      url.searchParams.delete("view");
    }
    window.history.pushState({}, "", url.toString());
    setView(next);
  }

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
      <PillNav view={view} onNavigate={navigate} />
      <ConnectionBadge state={connection} />
      {view === "council" ? (
        <RoundTable
          prefillQuestion={prefillQ}
          onConvene={handleConvene}
          isBusy={running}
        />
      ) : (
        <CaptureView />
      )}
    </div>
  );
}

function PillNav({
  view,
  onNavigate,
}: {
  view: View;
  onNavigate: (v: View) => void;
}) {
  const base =
    "rounded-full px-3 py-1 text-xs tracking-wider transition-colors";
  const active = "text-amber-glow";
  const inactive = "text-parchment/50 hover:text-amber-glow/80";
  return (
    <div className="pointer-events-auto absolute left-1/2 top-4 z-40 -translate-x-1/2 rounded-full border border-amber-dim/40 bg-ink-soft/70 px-1.5 py-1 backdrop-blur">
      <div className="flex items-center gap-1 font-mono uppercase">
        <button
          type="button"
          onClick={() => onNavigate("council")}
          className={`${base} ${view === "council" ? active : inactive}`}
        >
          議會
        </button>
        <span className="text-parchment/20">·</span>
        <button
          type="button"
          onClick={() => onNavigate("capture")}
          className={`${base} ${view === "capture" ? active : inactive}`}
        >
          捕獲
        </button>
      </div>
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
