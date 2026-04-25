/**
 * Council Live Server
 * ───────────────────
 * 一条 Bun server 同时做三件事:
 *
 * 1. HTTP — 托管 web/ 构建产物 (圆桌页面)
 * 2. WebSocket `/ws?run_id=<id>` — 订阅 run 的实时事件, 连接时自动 replay 历史
 * 3. HTTP `/api/command` — 接受 {type, args} 发起运行 (convene / capture / distill)
 *
 * 与 MCP server 彻底分离 (分工不同, 耦合会成噩梦)。
 */

import { serve, type ServerWebSocket } from "bun";
import { existsSync, readFileSync, statSync } from "node:fs";
import { join, resolve, extname } from "node:path";
import { bus, type CouncilEvent } from "../engine/events.ts";
import { convene } from "../engine/convene.ts";
import { isInitialized, paths } from "../core/paths.ts";
import { loadDotEnv } from "../core/env.ts";

loadDotEnv();

const WEB_DIST = resolve(import.meta.dir, "..", "..", "web", "dist");

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".mjs": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".map": "application/json",
};

// ──────────────────────────────────────────────────────────
// WebSocket run → clients registry
// ──────────────────────────────────────────────────────────
const subscribers = new Map<string, Set<ServerWebSocketData>>();

interface ServerWebSocketData {
  runId: string;
  ws: WebSocketLike;
}

interface WebSocketLike {
  send: (s: string) => void;
  close: (code?: number, reason?: string) => void;
  readyState: number;
}

// 事件总线 → 广播给对应 run 的所有 ws
bus.subscribe((e: CouncilEvent) => {
  const clients = subscribers.get(e.run_id);
  if (!clients || clients.size === 0) return;
  const payload = JSON.stringify(e);
  for (const c of clients) {
    try {
      c.ws.send(payload);
    } catch {
      /* ignore */
    }
  }
});

// ──────────────────────────────────────────────────────────
// 命令 dispatch (POST /api/command)
// ──────────────────────────────────────────────────────────
type CommandType = "convene" | "capture" | "distill" | "refine";
interface CommandRequest {
  type: CommandType;
  args: Record<string, unknown>;
}

async function dispatchCommand(
  req: CommandRequest,
): Promise<{ ok: boolean; run_id?: string; error?: string }> {
  try {
    if (req.type === "convene") {
      const q = String(req.args.question ?? "").trim();
      if (!q) return { ok: false, error: "question required" };
      const withRef = req.args.with ? String(req.args.with) : undefined;
      const runIdIn =
        (req.args.run_id as string | undefined) ?? undefined;
      const structured = req.args.structuredSynthesis !== false;
      const finalRunId = runIdIn ?? newSynthRunId(q);
      void convene(q, {
        with: withRef,
        runId: finalRunId,
        structuredSynthesis: structured,
      }).catch((err) => {
        console.error(`[live] convene failed: ${String(err)}`);
      });
      return { ok: true, run_id: finalRunId };
    }

    if (req.type === "capture") {
      const body = String(req.args.body ?? "").trim();
      const title = req.args.title ? String(req.args.title) : undefined;
      if (!body) return { ok: false, error: "body required" };
      const runId =
        (req.args.run_id as string | undefined) ?? newRunIdGeneric("capture");
      const { captureCommand } = await import("../commands/capture.ts");
      // 异步跑
      void captureCommand({ body, title, runId }).catch((err) => {
        console.error(`[live] capture failed: ${String(err)}`);
      });
      return { ok: true, run_id: runId };
    }

    if (req.type === "refine") {
      const personaRef = req.args.persona_ref
        ? String(req.args.persona_ref)
        : undefined;
      const { refineCommand } = await import("../commands/refine.ts");
      const result = await refineCommand(personaRef, {
        yes: true,
        silent: true,
      });
      return {
        ok: true,
        run_id: newRunIdGeneric("refine"),
        result,
      } as { ok: true; run_id: string; result: unknown };
    }

    if (req.type === "distill") {
      const sessionId = req.args.sessionId
        ? String(req.args.sessionId)
        : undefined;
      const auto = !!req.args.auto;
      const runId =
        (req.args.run_id as string | undefined) ?? newRunIdGeneric("distill");
      const { distillAll, distillOne } = await import("../engine/distill.ts");
      if (sessionId) {
        void distillOne(sessionId, runId).catch((err) => {
          console.error(`[live] distill failed: ${String(err)}`);
        });
      } else if (auto) {
        void distillAll(runId).catch((err) => {
          console.error(`[live] distill --auto failed: ${String(err)}`);
        });
      } else {
        return { ok: false, error: "sessionId or auto required" };
      }
      return { ok: true, run_id: runId };
    }

    return {
      ok: false,
      error: `unknown command type '${req.type}'`,
    };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

function newRunIdGeneric(verb: string): string {
  const date = new Date().toISOString().slice(0, 10);
  const rand = Math.random().toString(36).slice(2, 8);
  return `${date}-${verb}-${rand}`;
}

function newSynthRunId(question: string): string {
  const date = new Date().toISOString().slice(0, 10);
  const slug =
    question
      .toLowerCase()
      .replace(/[^\w\u4e00-\u9fa5-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 30) || "question";
  const rand = Math.random().toString(36).slice(2, 8);
  return `${date}-${slug}-${rand}`;
}

// ──────────────────────────────────────────────────────────
// 静态文件服务
// ──────────────────────────────────────────────────────────
function serveStatic(pathname: string): Response | null {
  if (!existsSync(WEB_DIST)) return null;
  // SPA 路由: 未知路径 → index.html
  const candidate =
    pathname === "/" ? "/index.html" : pathname.replace(/\/$/, "/index.html");
  const full = join(WEB_DIST, candidate);

  // 防路径穿越
  if (!full.startsWith(WEB_DIST)) return new Response("forbidden", { status: 403 });

  // 1. 直接命中文件
  if (existsSync(full) && statSync(full).isFile()) {
    const mime = MIME[extname(full).toLowerCase()] ?? "application/octet-stream";
    try {
      const buf = readFileSync(full);
      return new Response(buf, { headers: { "Content-Type": mime } });
    } catch {
      return new Response("read error", { status: 500 });
    }
  }
  // 2. SPA fallback → index.html (client-side routing)
  const idx = join(WEB_DIST, "index.html");
  if (existsSync(idx)) {
    return new Response(readFileSync(idx), {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }
  return null;
}

// ──────────────────────────────────────────────────────────
// Dev helper: 当 web/dist 不存在, 返回一个提示页
// ──────────────────────────────────────────────────────────
const DEV_HINT_HTML = `<!doctype html>
<html><head><meta charset=utf-8><title>Council Live — dev mode</title>
<style>
  body{background:#0E0D0C;color:#D8CFC4;font-family:ui-monospace,SFMono-Regular,monospace;
       display:flex;align-items:center;justify-content:center;height:100vh;margin:0;padding:2rem}
  .box{max-width:640px}
  h1{color:#F6C26B;font-size:1.4rem;margin:0 0 1rem 0}
  p,pre{font-size:.9rem;line-height:1.6;margin:.5rem 0}
  pre{background:#1a1715;padding:.75rem 1rem;border-radius:4px;color:#F6E27A}
  a{color:#F6C26B}
  .muted{color:#857e75}
</style></head><body><div class=box>
<h1>🕯️ Council Live — dev mode</h1>
<p>WS 服务在线 <span class=muted>(port 3737)</span>, 但 web 构建产物还不存在。</p>
<p>两条路:</p>
<pre># 开发 (推荐): Vite dev server, HMR
cd web &amp;&amp; bun install &amp;&amp; bun run dev
# 然后访问 http://localhost:5173</pre>
<pre># 或者构建一次, 让本 server 接管
cd web &amp;&amp; bun run build
# 然后刷新本页</pre>
<p class=muted>WS 测试: <code>ws://localhost:3737/ws?run_id=&lt;id&gt;</code></p>
</div></body></html>`;

// ──────────────────────────────────────────────────────────
// Server entry
// ──────────────────────────────────────────────────────────
export interface LiveServerOpts {
  port?: number;
  host?: string;
}

interface WSData {
  runId: string;
}

export function startLiveServer(opts: LiveServerOpts = {}) {
  const port = opts.port ?? Number(process.env.COUNCIL_LIVE_PORT ?? 3737);
  const host = opts.host ?? "127.0.0.1";

  if (!isInitialized()) {
    console.error(
      "[live] Council 尚未初始化。请先运行 `council init`",
    );
  }

  const server = serve<WSData>({
    port,
    hostname: host,
    fetch(req, srv) {
      const url = new URL(req.url);

      // WebSocket upgrade
      if (url.pathname === "/ws") {
        const runId = url.searchParams.get("run_id");
        if (!runId) return new Response("run_id required", { status: 400 });
        const success = srv.upgrade(req, { data: { runId } satisfies WSData });
        if (success) return undefined; // upgrade handled
        return new Response("WebSocket upgrade failed", { status: 400 });
      }

      // API
      if (url.pathname.startsWith("/api/")) {
        return handleApi(req, url);
      }

      // 静态
      const served = serveStatic(url.pathname);
      if (served) return served;

      // dev hint
      return new Response(DEV_HINT_HTML, {
        status: 200,
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    },

    websocket: {
      open(ws: ServerWebSocket<WSData>) {
        const runId = ws.data.runId;
        if (!subscribers.has(runId)) subscribers.set(runId, new Set());
        const entry: ServerWebSocketData = {
          runId,
          ws: { send: (s) => ws.send(s), close: (c, r) => ws.close(c, r), readyState: 1 },
        };
        subscribers.get(runId)!.add(entry);
        // 同时挂在 ws 上, 关闭时清理
        (ws as any)._entry = entry;

        // Replay 历史事件 (如果有)
        const history = bus.replay(runId);
        for (const e of history) {
          ws.send(JSON.stringify(e));
        }
        // 告知客户端 replay 完毕
        ws.send(
          JSON.stringify({
            t: "stream.ready",
            run_id: runId,
            history_count: history.length,
            ts: Date.now(),
          }),
        );
      },
      message(_ws: ServerWebSocket<WSData>, _msg: string | Buffer) {
        // 客户端不需要发消息, 全走 HTTP POST /api/command
      },
      close(ws: ServerWebSocket<WSData>) {
        const entry = (ws as any)._entry as ServerWebSocketData | undefined;
        if (!entry) return;
        const set = subscribers.get(entry.runId);
        if (set) {
          set.delete(entry);
          if (set.size === 0) subscribers.delete(entry.runId);
        }
      },
    },
  });

  console.error(`[live] Council Live listening on http://${host}:${port}`);
  console.error(`[live] WS:  ws://${host}:${port}/ws?run_id=<id>`);
  console.error(`[live] Web: ${existsSync(WEB_DIST) ? WEB_DIST : "(not built — run `cd web && bun run build`)"}`);
  return server;
}

// ──────────────────────────────────────────────────────────
// API 路由
// ──────────────────────────────────────────────────────────
async function handleApi(req: Request, url: URL): Promise<Response> {
  // POST /api/command
  if (url.pathname === "/api/command" && req.method === "POST") {
    let body: CommandRequest;
    try {
      body = (await req.json()) as CommandRequest;
    } catch {
      return json({ ok: false, error: "invalid JSON" }, 400);
    }
    const result = await dispatchCommand(body);
    return json(result, result.ok ? 200 : 400);
  }

  // GET /api/runs — 列出最近 runs
  if (url.pathname === "/api/runs" && req.method === "GET") {
    return json({ runs: bus.listRuns().slice(0, 20) });
  }

  // GET /api/runs/:id/replay — 取某次 run 的完整事件流
  const replayMatch = url.pathname.match(/^\/api\/runs\/([^/]+)\/replay$/);
  if (replayMatch && req.method === "GET") {
    const runId = decodeURIComponent(replayMatch[1]);
    return json({ run_id: runId, events: bus.replay(runId) });
  }

  // GET /api/personas — 列出当前可用 persona (给 web 端选人 picker 用)
  if (url.pathname === "/api/personas" && req.method === "GET") {
    const { listPersonas } = await import("../core/skill-md.ts");
    const { defaultAvatarFor, defaultColorFor } = await import(
      "../engine/persona-visual.ts"
    );
    const rows = listPersonas().map((p) => ({
      ref: p.ref,
      type: p.frontmatter.type,
      description: p.frontmatter.description,
      status: p.frontmatter.status ?? "active",
      confidence: p.frontmatter.confidence,
      avatar: p.frontmatter.avatar ?? defaultAvatarFor(p),
      color: p.frontmatter.color ?? defaultColorFor(p),
    }));
    return json({ personas: rows });
  }

  // GET /api/sessions — 列出所有 capture 过的 session (按时间倒序)
  if (url.pathname === "/api/sessions" && req.method === "GET") {
    const { listSessions } = await import("../core/skill-md.ts");
    const { readState } = await import("../engine/distill.ts");
    const sessions = listSessions();
    const state = readState();
    const rows = sessions.map((s) => {
      const fm = s.frontmatter;
      const hl = state.sessions[fm.id]?.highlight_ids.length ?? 0;
      return {
        id: fm.id,
        title: fm.title,
        captured_at: fm.captured_at,
        source: fm.source,
        distilled: fm.distilled,
        highlight_count: hl,
      };
    });
    return json({ sessions: rows });
  }

  // GET /api/sessions/:id — 单 session 详情 + 关联 highlights
  const sessionMatch = url.pathname.match(/^\/api\/sessions\/([^/]+)$/);
  if (sessionMatch && req.method === "GET") {
    const id = decodeURIComponent(sessionMatch[1]);
    const { getSession, listSkills } = await import("../core/skill-md.ts");
    const { readState } = await import("../engine/distill.ts");
    try {
      const s = getSession(id);
      const state = readState();
      const sessRec = state.sessions[id];
      const skillMap = new Map(listSkills().map((sk) => [sk.data.id, sk]));
      const hlToPersona = new Map<string, string>();
      for (const [name, rec] of Object.entries(state.personas)) {
        for (const hid of rec.source_highlights) hlToPersona.set(hid, `self:${name}`);
      }
      const highlights = (sessRec?.highlight_ids ?? [])
        .map((hid) => {
          const sk = skillMap.get(hid);
          if (!sk) return null;
          return {
            id: sk.data.id,
            slug: sk.data.slug,
            title: sk.data.title,
            type: sk.data.type,
            confidence: sk.data.confidence,
            promoted_to_persona: hlToPersona.get(hid),
          };
        })
        .filter(Boolean);
      return json({
        id: s.frontmatter.id,
        title: s.frontmatter.title,
        captured_at: s.frontmatter.captured_at,
        source: s.frontmatter.source,
        distilled: s.frontmatter.distilled,
        body: s.body,
        highlights,
      });
    } catch (err) {
      return json({ error: String(err) }, 404);
    }
  }

  // GET /api/skills — 列出所有 highlights, 可按 type 过滤
  if (url.pathname === "/api/skills" && req.method === "GET") {
    const { listSkills } = await import("../core/skill-md.ts");
    const { readState } = await import("../engine/distill.ts");
    const type = url.searchParams.get("type") ?? undefined;
    const all = listSkills();
    const filtered = type ? all.filter((s) => s.data.type === type) : all;
    const state = readState();
    const hlToPersona = new Map<string, string>();
    for (const [name, rec] of Object.entries(state.personas)) {
      for (const hid of rec.source_highlights) hlToPersona.set(hid, `self:${name}`);
    }
    const rows = filtered
      .sort((a, b) => b.data.confidence - a.data.confidence)
      .map((sk) => ({
        id: sk.data.id,
        slug: sk.data.slug,
        title: sk.data.title,
        type: sk.data.type,
        confidence: sk.data.confidence,
        source_session: sk.data.source_session,
        promoted_to_persona: hlToPersona.get(sk.data.id),
      }));
    return json({ skills: rows });
  }

  // GET /api/skills/:idOrSlug — 单 highlight 详情
  const skillMatch = url.pathname.match(/^\/api\/skills\/([^/]+)$/);
  if (skillMatch && req.method === "GET") {
    const idOrSlug = decodeURIComponent(skillMatch[1]);
    const { getSkill, listSkills } = await import("../core/skill-md.ts");
    let sk = getSkill(idOrSlug);
    if (!sk) {
      const all = listSkills();
      sk = all.find((x) => x.data.slug === idOrSlug) ?? null;
    }
    if (!sk) return json({ error: "not found" }, 404);
    return json({ ...sk.data, body: sk.body });
  }

  // GET /api/transcripts — 列出所有议会记录
  if (url.pathname === "/api/transcripts" && req.method === "GET") {
    const { listTranscripts } = await import("../core/skill-md.ts");
    const rows = listTranscripts().map((t) => ({
      id: t.data.id,
      question: t.data.question,
      convened_at: t.data.convened_at,
      personas: t.data.personas,
    }));
    return json({ transcripts: rows });
  }

  // GET /api/transcripts/:id
  const transMatch = url.pathname.match(/^\/api\/transcripts\/([^/]+)$/);
  if (transMatch && req.method === "GET") {
    const id = decodeURIComponent(transMatch[1]);
    const { getTranscript } = await import("../core/skill-md.ts");
    try {
      const t = getTranscript(id);
      return json({ ...t.data, body: t.body });
    } catch {
      return json({ error: "not found" }, 404);
    }
  }

  // GET /api/identity — 用户身份摘要 (用于 web 顶部 "你是谁")
  if (url.pathname === "/api/identity" && req.method === "GET") {
    const { readIdentity } = await import("../core/skill-md.ts");
    const raw = readIdentity().trim();
    const placeholderCount = (raw.match(/<[^<>]{3,80}>/g) ?? []).length;
    const isTemplate = !raw || placeholderCount >= 3;
    return json({ raw, isTemplate });
  }

  // GET /api/health
  if (url.pathname === "/api/health") {
    return json({ ok: true, initialized: isInitialized(), root: paths.root() });
  }

  return new Response("not found", { status: 404 });
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

// ──────────────────────────────────────────────────────────
// CLI entry: `bun run src/server/live.ts`
// ──────────────────────────────────────────────────────────
if (import.meta.main) {
  startLiveServer();
}
