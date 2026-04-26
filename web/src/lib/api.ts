// Thin API client for the live server's REST endpoints.
// 同 origin 部署: live server 既托管 web/dist 也提供 /api/* 路由.
// 开发时 vite proxy 把 /api/* 转发到 http://localhost:3737.

export interface SessionRow {
  id: string;
  title?: string;
  captured_at: string;
  source: string;
  distilled: boolean;
  highlight_count: number;
}

export interface SkillRow {
  id: string;
  slug?: string;
  title: string;
  type: string;
  confidence: number;
  source_session: string;
  promoted_to_persona?: string;
}

export interface TranscriptRow {
  id: string;
  question: string;
  convened_at: string;
  personas: string[];
}

export interface PersonaRow {
  ref: string;
  type: "self" | "mentor" | "role";
  description?: string;
  confidence?: number;
  status?: string;
  avatar?: string;
  color?: string;
}

export interface IdentityResponse {
  raw: string;
  isTemplate: boolean;
}

async function getJSON<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.json() as Promise<T>;
}

export const api = {
  sessions: () =>
    getJSON<{ sessions: SessionRow[] }>("/api/sessions").then((r) => r.sessions),
  session: (id: string) =>
    getJSON<{
      id: string;
      title?: string;
      captured_at: string;
      source: string;
      distilled: boolean;
      body: string;
      highlights: Array<{
        id: string;
        slug?: string;
        title: string;
        type: string;
        confidence: number;
        promoted_to_persona?: string;
      }>;
    }>(`/api/sessions/${encodeURIComponent(id)}`),

  skills: (type?: string) =>
    getJSON<{ skills: SkillRow[] }>(
      type ? `/api/skills?type=${encodeURIComponent(type)}` : "/api/skills",
    ).then((r) => r.skills),
  skill: (idOrSlug: string) =>
    getJSON<SkillRow & { body: string }>(
      `/api/skills/${encodeURIComponent(idOrSlug)}`,
    ),

  transcripts: () =>
    getJSON<{ transcripts: TranscriptRow[] }>("/api/transcripts").then(
      (r) => r.transcripts,
    ),
  transcript: (id: string) =>
    getJSON<TranscriptRow & { body: string }>(
      `/api/transcripts/${encodeURIComponent(id)}`,
    ),

  personas: () =>
    getJSON<{ personas: PersonaRow[] }>("/api/personas").then((r) => r.personas),
  persona: (ref: string) =>
    getJSON<
      PersonaRow & {
        body: string;
        source_sessions?: string[];
        version?: number;
        origin?: string;
      }
    >(`/api/personas/${encodeURIComponent(ref)}`),

  identity: () => getJSON<IdentityResponse>("/api/identity"),

  // —— /api/command 派发 (refine / capture-text 等)
  command: async (req: {
    type: "refine" | "capture" | "convene" | "distill";
    args: Record<string, unknown>;
  }) => {
    const res = await fetch("/api/command", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req),
    });
    return res.json() as Promise<{ ok: boolean; run_id?: string; result?: unknown; error?: string }>;
  },

  // —— 软删除: 把 transcript / session 移到 _archive/ —— 文件不丢, 列表不再显示
  archiveTranscript: async (id: string) => {
    const res = await fetch(
      `/api/transcripts/${encodeURIComponent(id)}/archive`,
      { method: "POST" },
    );
    return res.json() as Promise<{ ok: boolean; archivedTo?: string; error?: string }>;
  },
  archiveSession: async (id: string) => {
    const res = await fetch(
      `/api/sessions/${encodeURIComponent(id)}/archive`,
      { method: "POST" },
    );
    return res.json() as Promise<{ ok: boolean; archivedTo?: string; error?: string }>;
  },
};
