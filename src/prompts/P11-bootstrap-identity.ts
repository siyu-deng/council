import { callJSON } from "../core/claude.ts";
import { loadConfig } from "../core/config.ts";
import type { Persona } from "../core/skill-md.ts";

export interface BootstrapResult {
  identity_md: string;
  rationale: string;
}

const SYSTEM = `你在为 Council 用户**反向回推**他的身份档案 (identity.md)。输入是已经从他过往对话里蒸馏出来的 self personas + 一些代表性的 highlights (含原话). 你要写一份让用户"自己看了都觉得对"的 identity.md.

# 严格输出格式 (Markdown)

\`\`\`
# 我是谁

<3-5 行第一人称描述. 体现核心思考特征 + 身份角色 + 价值取向.>

# 我现在在做什么

<2-4 行. 从 highlights 里推断: 用户最近在思考/构造什么. 不要瞎编, 没有就空着.>

# 我最近最纠结的问题

- <1-3 条. 从 highlights 推断他还没想透的张力, 比如"全力做副业 vs 找稳定工作"这种真实纠结.>

# 我惯用的思考框架

- <列出他自己已经形成的 self personas 名字 + 一句话, 例如 "self:reframe-before-execute — 执行前先重构问题">
- <可以加 1-2 个他已 capture 的 mentor 视角, 如 Naval / Jobs / Munger.>

# 我希望 Council 帮我做什么

<1-2 句, 基于他的纠结点和思考偏好, 推断他最希望 Council 在哪些场景帮他.>
\`\`\`

# 硬性纪律

❌ 不许出现 \`<...>\` 占位符, 必须填实
❌ 不许写"用户/他"的第三人称, 必须用"我"
❌ 不许编造没有证据的 highlight 引用
❌ 不许写超过 600 字
❌ 不许用"很有洞察"、"思维深刻"这种空话

✅ 鼓励引用 highlights 里的原话作为锚点 (但要自然嵌入, 不要尬贴)
✅ 鼓励指出他思考方式中的张力 / 矛盾 / 进化方向

# rationale 字段

1-2 句话: 你从哪些 persona 和 highlight 推出了这份身份, 哪些信号最强.`;

export async function bootstrapIdentity(
  selfPersonas: Persona[],
  highlightExcerpts: Array<{ type: string; title: string; quote: string }>,
): Promise<BootstrapResult> {
  const cfg = loadConfig();

  const personasBlock = selfPersonas
    .map(
      (p) =>
        `### ${p.ref} (conf=${p.frontmatter.confidence ?? "n/a"})
description: ${p.frontmatter.description}
${p.body.slice(0, 1200)}`,
    )
    .join("\n\n---\n\n");

  const highlightsBlock = highlightExcerpts
    .map(
      (h, i) =>
        `[${i + 1}] [${h.type}] ${h.title}\n  quote: "${h.quote.slice(0, 200)}"`,
    )
    .join("\n");

  const prompt = `# 已蒸馏的 self personas

${personasBlock}

# 代表性 highlights

${highlightsBlock}

请基于以上证据写出 identity.md.`;

  const schema = {
    type: "object",
    properties: {
      identity_md: {
        type: "string",
        description: "完整 Markdown 正文, 严格按 5 段结构",
      },
      rationale: { type: "string" },
    },
    required: ["identity_md", "rationale"],
  };

  return await callJSON<BootstrapResult>(prompt, {
    model: cfg.models.distill,
    system: SYSTEM,
    label: "bootstrap-identity",
    temperature: 0.5,
    maxTokens: 1800,
    jsonSchema: schema,
    toolName: "bootstrap_identity",
  });
}
