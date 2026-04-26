/**
 * Council Live Server
 * ───────────────────
 * 一条 Node HTTP server 同时做三件事:
 *
 * 1. HTTP — 托管 web/ 构建产物 (圆桌页面)
 * 2. WebSocket `/ws?run_id=<id>` — 订阅 run 的实时事件, 连接时自动 replay 历史
 * 3. HTTP `/api/command` — 接受 {type, args} 发起运行 (convene / capture / distill / refine)
 *
 * 与 MCP server 彻底分离 (分工不同, 耦合会成噩梦)。
 *
 * Runtime: Node 20+ (用 ws npm 包做 WebSocket, 用 globalThis.Request/Response 做路由)。
 *          v0.3 之前用 Bun.serve, 现在迁到 Node — npm install -g 就能跑, 不再需要 Bun。
 */

import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { WebSocketServer, WebSocket as NodeWebSocket } from "ws";
import { existsSync, readFileSync, statSync } from "node:fs";
import { join, resolve, extname, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { bus, type CouncilEvent } from "../engine/events.ts";
import { convene } from "../engine/convene.ts";
import { captureCommand } from "../commands/capture.ts";
import { refineCommand } from "../commands/refine.ts";
import { distillAll, distillOne, readState } from "../engine/distill.ts";
import {
  listPersonas,
  getSession,
  getSkill,
  listSkills,
  listSessions,
  listTranscripts,
  getTranscript,
  readIdentity,
} from "../core/skill-md.ts";
import { defaultAvatarFor, defaultColorFor } from "../engine/persona-visual.ts";
import { isInitialized, paths } from "../core/paths.ts";
import { loadDotEnv } from "../core/env.ts";

loadDotEnv();

// import.meta.dir 是 Bun 专有, Node 用 fileURLToPath 兼容
const __dirname = dirname(fileURLToPath(import.meta.url));
const WEB_DIST = resolve(__dirname, "..", "..", "web", "dist");

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
interface ClientEntry {
  runId: string;
  ws: NodeWebSocket;
}

const subscribers = new Map<string, Set<ClientEntry>>();

// 事件总线 → 广播给对应 run 的所有 ws
bus.subscribe((e: CouncilEvent) => {
  const clients = subscribers.get(e.run_id);
  if (!clients || clients.size === 0) return;
  const payload = JSON.stringify(e);
  for (const c of clients) {
    try {
      if (c.ws.readyState === NodeWebSocket.OPEN) c.ws.send(payload);
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
): Promise<{ ok: boolean; run_id?: string; error?: string; result?: unknown }> {
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
      void captureCommand({ body, title, runId }).catch((err) => {
        console.error(`[live] capture failed: ${String(err)}`);
      });
      return { ok: true, run_id: runId };
    }

    if (req.type === "refine") {
      const personaRef = req.args.persona_ref
        ? String(req.args.persona_ref)
        : undefined;
      const result = await refineCommand(personaRef, {
        yes: true,
        silent: true,
      });
      return {
        ok: true,
        run_id: newRunIdGeneric("refine"),
        result,
      };
    }

    if (req.type === "distill") {
      const sessionId = req.args.sessionId
        ? String(req.args.sessionId)
        : undefined;
      const auto = !!req.args.auto;
      const runId =
        (req.args.run_id as string | undefined) ?? newRunIdGeneric("distill");
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
      .replace(/[^\w一-龥-]+/g, "-")
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
      return new Response(new Uint8Array(buf), { headers: { "Content-Type": mime } });
    } catch {
      return new Response("read error", { status: 500 });
    }
  }
  // 2. SPA fallback → index.html (client-side routing)
  const idx = join(WEB_DIST, "index.html");
  if (existsSync(idx)) {
    return new Response(new Uint8Array(readFileSync(idx)), {
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
cd web &amp;&amp; npm install &amp;&amp; npm run dev
# 然后访问 http://localhost:5173</pre>
<pre># 或者构建一次, 让本 server 接管
cd web &amp;&amp; npm run build
# 然后刷新本页</pre>
<p class=muted>WS 测试: <code>ws://localhost:3737/ws?run_id=&lt;id&gt;</code></p>
</div></body></html>`;

// ──────────────────────────────────────────────────────────
// Node ↔ Web standard adapter
// ──────────────────────────────────────────────────────────
async function nodeReqToWebReq(req: IncomingMessage): Promise<Request> {
  const host = req.headers.host ?? "127.0.0.1";
  const url = new URL(req.url ?? "/", `http://${host}`);
  const headers = new Headers();
  for (const [k, v] of Object.entries(req.headers)) {
    if (Array.isArray(v)) for (const vv of v) headers.append(k, vv);
    else if (v !== undefined) headers.set(k, v);
  }

  const init: RequestInit = {
    method: req.method ?? "GET",
    headers,
  };

  // 只有需要 body 的方法才读取
  if (req.method && !["GET", "HEAD"].includes(req.method.toUpperCase())) {
    const chunks: Buffer[] = [];
    for await (const chunk of req) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    if (chunks.length > 0) {
      init.body = Buffer.concat(chunks);
      // Node 的 fetch Request 需要明确 duplex: 'half' (有 body 的情况下)
      (init as RequestInit & { duplex?: string }).duplex = "half";
    }
  }

  return new Request(url.toString(), init);
}

async function webResToNodeRes(webRes: Response, nodeRes: ServerResponse): Promise<void> {
  // 复制 headers
  const headers: Record<string, string> = {};
  webRes.headers.forEach((v, k) => {
    headers[k] = v;
  });
  nodeRes.writeHead(webRes.status, headers);

  if (!webRes.body) {
    nodeRes.end();
    return;
  }

  // 把 web 标准 ReadableStream 写到 Node Response
  const buf = Buffer.from(await webRes.arrayBuffer());
  nodeRes.end(buf);
}

// ──────────────────────────────────────────────────────────
// Server entry
// ──────────────────────────────────────────────────────────
export interface LiveServerOpts {
  port?: number;
  host?: string;
}

/**
 * 启动 server, 返回类似 Bun.serve 的 handle ({port, stop()}) 让 convene.ts 能优雅停机。
 */
export function startLiveServer(opts: LiveServerOpts = {}) {
  const port = opts.port ?? Number(process.env.COUNCIL_LIVE_PORT ?? 3737);
  const host = opts.host ?? "127.0.0.1";

  if (!isInitialized()) {
    console.error(
      "[live] Council 尚未初始化。请先运行 `council init`",
    );
  }

  // ── HTTP server ──
  const httpServer = createServer(async (req, res) => {
    try {
      const webReq = await nodeReqToWebReq(req);
      const url = new URL(webReq.url);

      // /ws 路径不在这里处理 — upgrade 事件接管
      if (url.pathname === "/ws") {
        res.writeHead(400, { "Content-Type": "text/plain" });
        res.end("WebSocket endpoint — use ws:// scheme");
        return;
      }

      // /api/* 路由
      if (url.pathname.startsWith("/api/")) {
        const apiRes = await handleApi(webReq, url);
        await webResToNodeRes(apiRes, res);
        return;
      }

      // 静态文件
      const served = serveStatic(url.pathname);
      if (served) {
        await webResToNodeRes(served, res);
        return;
      }

      // dev hint
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(DEV_HINT_HTML);
    } catch (err) {
      console.error(`[live] request failed: ${String(err)}`);
      try {
        res.writeHead(500, { "Content-Type": "text/plain" });
        res.end("internal server error");
      } catch {
        /* connection already broken */
      }
    }
  });

  // ── WebSocket server (复用 HTTP 的 upgrade 事件) ──
  const wss = new WebSocketServer({ noServer: true });

  httpServer.on("upgrade", (req, socket, head) => {
    const url = new URL(req.url ?? "/", `http://${req.headers.host ?? host}`);
    if (url.pathname !== "/ws") {
      socket.destroy();
      return;
    }
    const runId = url.searchParams.get("run_id");
    if (!runId) {
      socket.write("HTTP/1.1 400 Bad Request\r\n\r\nrun_id required");
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      attachClient(ws, runId);
    });
  });

  function attachClient(ws: NodeWebSocket, runId: string) {
    if (!subscribers.has(runId)) subscribers.set(runId, new Set());
    const entry: ClientEntry = { runId, ws };
    subscribers.get(runId)!.add(entry);

    // Replay 历史事件
    const history = bus.replay(runId);
    for (const e of history) {
      try {
        ws.send(JSON.stringify(e));
      } catch {
        /* socket closed early */
      }
    }
    // 告知客户端 replay 完毕
    try {
      ws.send(
        JSON.stringify({
          t: "stream.ready",
          run_id: runId,
          history_count: history.length,
          ts: Date.now(),
        }),
      );
    } catch {
      /* ignore */
    }

    ws.on("close", () => {
      const set = subscribers.get(runId);
      if (set) {
        set.delete(entry);
        if (set.size === 0) subscribers.delete(runId);
      }
    });

    ws.on("error", () => {
      // 错误也算断开 — close 会跟着触发
    });

    // 客户端不需要发消息, 全走 HTTP POST /api/command
    // 但有些 ws 客户端会发 ping, 不阻塞它
  }

  // ── Listen ──
  httpServer.listen(port, host);

  console.error(`[live] Council Live listening on http://${host}:${port}`);
  console.error(`[live] WS:  ws://${host}:${port}/ws?run_id=<id>`);
  console.error(`[live] Web: ${existsSync(WEB_DIST) ? WEB_DIST : "(not built — run `cd web && npm run build`)"}`);

  // 模拟 Bun.serve 的返回 (port + stop())
  return {
    port,
    hostname: host,
    stop() {
      // 关闭所有 ws 连接
      for (const set of subscribers.values()) {
        for (const entry of set) {
          try {
            entry.ws.close();
          } catch {
            /* ignore */
          }
        }
      }
      subscribers.clear();
      wss.close();
      httpServer.close();
    },
  };
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
    try {
      const t = getTranscript(id);
      return json({ ...t.data, body: t.body });
    } catch {
      return json({ error: "not found" }, 404);
    }
  }

  // GET /api/identity — 用户身份摘要 (用于 web 顶部 "你是谁")
  if (url.pathname === "/api/identity" && req.method === "GET") {
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
// CLI entry: `node dist/server/live.js` 或 `bun run src/server/live.ts`
// ──────────────────────────────────────────────────────────
// Bun 用 import.meta.main, Node 用 import.meta.url 跟 process.argv[1] 比较
const isMain = (() => {
  try {
    if (typeof (import.meta as { main?: boolean }).main === "boolean") {
      return (import.meta as { main?: boolean }).main === true;
    }
  } catch {
    /* ignore */
  }
  try {
    return import.meta.url === `file://${process.argv[1]}`;
  } catch {
    return false;
  }
})();

if (isMain) {
  startLiveServer();
}
