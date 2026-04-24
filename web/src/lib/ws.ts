import { useCouncil } from "./store";
import type { CouncilEvent } from "./types";

// Thin WS client. Reconnects with exponential backoff up to 30s.
// Messages may be a single JSON event or an array (replay batch on connect).

export interface WSConfig {
  runId: string;
  url?: string; // Defaults to window.location-based ws://…/ws
}

export class CouncilSocket {
  private ws: WebSocket | null = null;
  private closed = false;
  private retry = 0;
  private readonly runId: string;
  private readonly url: string;

  constructor(cfg: WSConfig) {
    this.runId = cfg.runId;
    const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
    const host = window.location.host;
    this.url = cfg.url ?? `${proto}//${host}/ws?run_id=${cfg.runId}`;
  }

  open() {
    if (this.closed) return;
    useCouncil.getState().setConnection("connecting");
    try {
      this.ws = new WebSocket(this.url);
    } catch (err) {
      console.error("ws ctor failed", err);
      this.scheduleReconnect();
      return;
    }

    this.ws.onopen = () => {
      this.retry = 0;
      useCouncil.getState().setConnection("live");
    };

    this.ws.onmessage = (ev) => {
      try {
        const data = JSON.parse(ev.data as string);
        if (Array.isArray(data)) {
          for (const e of data as CouncilEvent[]) {
            useCouncil.getState().ingest(e);
          }
        } else {
          useCouncil.getState().ingest(data as CouncilEvent);
        }
      } catch (err) {
        console.error("ws parse error", err, ev.data);
      }
    };

    this.ws.onclose = () => {
      if (this.closed) return;
      useCouncil.getState().setConnection("offline");
      this.scheduleReconnect();
    };

    this.ws.onerror = () => {
      this.ws?.close();
    };
  }

  private scheduleReconnect() {
    if (this.closed) return;
    this.retry += 1;
    const delay = Math.min(1000 * 2 ** this.retry, 30_000);
    setTimeout(() => this.open(), delay);
  }

  close() {
    this.closed = true;
    this.ws?.close();
    this.ws = null;
  }
}

// Start a new convene via HTTP. Returns the run_id from the backend.
export async function startConvene(
  question: string,
  withPersonas?: string[],
): Promise<{ run_id: string }> {
  const res = await fetch("/api/command", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      type: "convene",
      args: { question, with: withPersonas },
    }),
  });
  if (!res.ok) {
    throw new Error(`convene failed: ${res.status} ${await res.text()}`);
  }
  return res.json();
}
