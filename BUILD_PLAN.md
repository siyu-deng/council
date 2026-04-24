# Council · Build Plan

> 配套架构文档: [council-architecture.md](./council-architecture.md)
> 开发窗口: 2026-04-24 (Fri) – 2026-04-26 (Sun)
> 目标: 3 天内跑通"实时粘贴对话 → 蒸馏 → 议会辩论 → MCP 导出"全链路，真实性优先。

---

## 0. 纪律 (Scope Cuts)

三天能做 vs 必须砍。Jobs 视角：**先想砍什么**。

**保留**:
- `council init`
- `council capture`
- `council distill`
- `council convene`
- `council export --mcp` + `council serve`

**明确砍掉** (黑客松版本不做):
- `council persona edit` (直接让用户改 Markdown 文件)
- `--mode debate` vs `--mode council` 两套模式 (合成一套)
- 终端头像气泡炫技 UI (第二优先级，有时间再做)
- 账号/多用户/Web/向量检索

**恢复** (用户反馈, Day 2 晚上 / Day 3 上午插入):
- `council feedback <transcript-id>` — 三档评级 helpful/generic/off-target
- `council evolve` — 扫全库打分, 标记 stale, 建议 merge
- `council merge <a> <b>` — 融合预览 + 确认

**命令表面缩减**:
架构文档里 `convene` 支持四五个 flag。黑客松只留:
```
council convene "<问题>"           # 自动 summon 3-5 personas
council convene "<问题>" --with naval,jobs,self:first-principles   # 显式指定
```

---

## 1. 项目结构 (Repo Layout)

```
councli/                                  # 当前目录 = 仓库根
├── council-architecture.md               # 既有
├── BUILD_PLAN.md                         # 本文
├── 自我的材料/                             # demo 素材, 不进仓库 (加 .gitignore)
├── package.json
├── tsconfig.json
├── bun.lockb
├── .gitignore
├── README.md                             # Day 3 最后写
│
├── bin/
│   └── council.ts                        # CLI entry, shebang + commander
│
├── src/
│   ├── commands/                         # 每个 CLI 命令一个文件
│   │   ├── init.ts
│   │   ├── capture.ts
│   │   ├── distill.ts
│   │   ├── persona.ts                    # list / add (不做 edit)
│   │   ├── convene.ts
│   │   ├── export.ts
│   │   └── serve.ts                      # MCP server 启动
│   │
│   ├── core/
│   │   ├── claude.ts                     # Anthropic SDK 封装 + 重试
│   │   ├── paths.ts                      # ~/.council 路径工具
│   │   ├── frontmatter.ts                # gray-matter 薄封装
│   │   ├── skill-md.ts                   # SKILL.md 读写 (兼容花叔/Claude Skills)
│   │   ├── config.ts                     # config.yml 加载
│   │   ├── logger.ts                     # 彩色日志 + spinner
│   │   └── errors.ts                     # 统一错误类型
│   │
│   ├── engine/
│   │   ├── distill.ts                    # session → highlights → personas
│   │   ├── summon.ts                     # 根据问题选 3-5 个 persona
│   │   ├── convene.ts                    # statement → cross-exam → synthesis 编排
│   │   └── render.ts                     # 辩论过程的终端渲染
│   │
│   ├── mcp/
│   │   ├── server.ts                     # @modelcontextprotocol/sdk 实现
│   │   └── tools.ts                      # 4 个 tool 的 handler
│   │
│   └── prompts/                          # 所有 LLM prompt, 单独放, 方便迭代
│       ├── P1-identify-highlights.ts
│       ├── P2-forge-persona.ts
│       ├── P3-summon-personas.ts
│       ├── P4-persona-statement.ts
│       ├── P5-cross-examination.ts
│       ├── P6-synthesis.ts
│       └── shared.ts                     # identity.md 注入等公共片段
│
├── seeds/                                # 随 CLI 安装分发的预置内容
│   ├── personas/
│   │   ├── mentors/
│   │   │   ├── naval.md                  # 从花叔抓 + 手工精修
│   │   │   ├── jobs.md
│   │   │   └── munger.md
│   │   └── roles/
│   │       ├── devils-advocate.md
│   │       └── first-customer.md
│   ├── identity.template.md
│   └── config.template.yml
│
└── scripts/
    └── dev-seed.ts                       # 本地开发: 把 自我的材料/ 灌进 ~/.council/sessions/
```

**技术栈定版**:
- Runtime: **Bun 1.x** (CLI 启动快、原生 TS、内置 shebang)
- CLI parser: **commander** (生态最成熟)
- LLM: `@anthropic-ai/sdk`
- MCP: `@modelcontextprotocol/sdk`
- Markdown + YAML: `gray-matter`
- 终端美化: `kleur` (颜色) + `ora` (spinner) + `boxen` (persona 发言框)
- 无数据库、无 Web

---

## 2. 运行时结构 (~/.council/)

严格按架构文档 §3.1 来。补充两个文件:

```
~/.council/
├── identity.md
├── config.yml
├── personas/ ...
├── sessions/
│   └── <YYYY-MM-DD-slug>.md              # frontmatter + 原文 + 状态位
├── skills/
│   └── <YYYY-MM-DD-slug>-highlight-N.md  # 每个高光 1 个文件, 可能晋升为 persona
├── transcripts/
│   └── <YYYY-MM-DD-slug>.md              # convene 完整记录
└── .state/
    ├── distilled.json                    # session → skill 映射, 防重跑
    └── summon-cache.json                 # 最近 summon 的 persona 组合
```

---

## 3. 数据 Schema

### 3.1 session 文件

```markdown
---
id: 2026-04-23-evotavern
captured_at: 2026-04-23T11:07:00Z
source: clipboard | file | stdin
distilled: false
---

# <对话标题, 从原文抓>

<原始对话全文>
```

### 3.2 SKILL.md (persona / skill 通用)

兼容花叔 nuwa-skill 格式 + Claude Skills + AGENTS.md 精神:

```markdown
---
name: first-principles
description: 把问题拆到无法再拆的底层事实，再重组。用于判断"这是原生问题还是二手叙事"。
type: self | mentor | role
origin: distilled | imported | handcrafted
source_sessions: [2026-04-23-evotavern]       # type=self 才有
confidence: 0.82                               # distill 时 LLM 自评
version: 1
created_at: 2026-04-23
---

# <人称> <Persona 名>

## 我是谁
<一段第一人称自我介绍, 5-8 行>

## 什么时候我会发言
- 当用户在收集框架而非解决具体问题时
- 当出现"大家都这么做"式的二手叙事时
- ...

## 我的思考路径
1. ...
2. ...

## 我反对什么
- ...

## 典型片段
> "<从源对话提取的一句原话, 带出处>"
```

### 3.3 transcript 文件 (convene 输出)

```markdown
---
question: 我应该红药丸还是蓝药丸?
convened_at: 2026-04-25T10:00:00Z
personas: [self:first-principles, mentors:naval, roles:devils-advocate]
---

## Statements (独立表态)
### self:first-principles
...

## Cross-examination
### naval 质疑 self:first-principles
...

## Synthesis
**共识**: ...
**仍存分歧**: ...
**建议下一步**: ...
```

---

## 4. Prompt 集 (核心 80% 价值)

所有 prompt 统一结构:
- `systemPrompt(identity)`: 注入 `identity.md`, 让 LLM 知道"用户是谁"
- `userPrompt(...)`: 具体任务输入
- 输出强制 JSON (用 tool_use 约束) 或强制 Markdown (frontmatter + 正文)

### P1 — Identify Highlights (最关键, 真实性守门员)

**任务**: 从一段"用户 vs AI"对话里提取 3–5 个真正属于用户的思考高光。

**输入**:
```
<identity.md>
<session transcript 全文>
```

**输出** (JSON 数组):
```json
[
  {
    "type": "problem-reframing | meta-insight | decision-heuristic | boundary-response",
    "title": "用一句话概括",
    "user_move": "用户实际说了什么 (尽量保留原话片段)",
    "why_non_trivial": "为什么这不是 AI 喂给用户的, 而是用户自己的",
    "trigger": "什么情境下会触发这个思考模式",
    "underlying_belief": "背后的底层信念",
    "confidence": 0.0
  }
]
```

**反作弊规则** (写进 system prompt):
- **拒绝**提取"用户对 AI 建议表达认同"的片段 (那是 AI 的思考, 不是用户的)
- **拒绝**生成"用户用了第一性原理思考"这种同义反复 — 必须写出这次具体的拆法
- **拒绝**把"用户表达了情绪"单独当作高光 — 必须有可复用的决策/视角
- **偏爱**: 用户反驳 AI / 用户重构问题 / 用户给出 AI 没想到的类比 / 用户在纠结后做出反直觉选择
- 每个 `user_move` 必须能在原文里找到逐字根据, 否则 `confidence < 0.5`

**调用策略**:
- 每份 session 独立跑 P1
- temperature 0.3 (稳定但允许识别力)
- 低置信度高光 (<0.5) 进 `skills/_draft/`, 不自动升为 persona

### P2 — Forge Persona from Highlight Cluster

**任务**: 把同 `type` 的多个高光合并蒸馏成一个 persona 的 SKILL.md。

**输入**: 同 cluster 内所有 highlight + identity.md

**输出**: 严格遵守 §3.2 的 SKILL.md 文本。

**纪律**:
- 第一人称, 不写 "This persona..."
- "典型片段" 必须是原文逐字引用, 不许改写
- 如果 cluster 只有 1 个 highlight, 标记 `confidence < 0.7` + 文件名加 `-draft` 后缀

### P3 — Summon Personas

**任务**: 给定用户问题, 从已有 persona 列表里选 3–5 个最相关的。

**输入**: 问题 + 所有 persona 的 frontmatter (name + description)

**输出**:
```json
{
  "selected": ["self:first-principles", "mentors:naval", "roles:devils-advocate"],
  "rationale": "为什么选这几个, 为什么不选其他"
}
```

**规则**:
- 必须至少 1 个 `self` + 1 个 `mentor` + 1 个 `role`, 保证视角多样性
- 如果问题涉及具体人际冲突, 强制拉入 `devils-advocate`
- 如果问题涉及职业/决策, 强制拉入 `self:*` 相关的

### P4 — Persona Statement (独立表态)

**任务**: 让一个 persona 独立回答用户问题, **不看其他 persona 的回答**。

**输入**: 问题 + 该 persona 的完整 SKILL.md + identity.md

**输出** (Markdown):
```
## 我的判断
<2-4 段>

## 我最不同意的流行看法
<1 段>

## 我的具体建议
- ...
```

**并行调用**: N 个 persona 的 statement 并行跑 (Promise.all), 节省时间。

### P5 — Cross-Examination

**任务**: 每个 persona 看完其他所有 persona 的 statement 后, **挑出最大的盲点**提出质疑。

**输入**: 问题 + 自己 persona + 其他所有 persona 的 statement

**输出**:
```
## 我最不同意 <target-persona> 的地方
## 他们没看到的是
## 一个让他们不得不回答的问题
```

**纪律**:
- 禁止客套 ("其实说得很有道理") — 直接进入异议
- 至少针对 1 个其他 persona, 最多 2 个
- 字数硬上限, 避免水

### P6 — Synthesis

**任务**: 综合 statements + cross-examinations, 给出最终输出。

**输入**: 全部前置内容 + identity.md

**输出**:
```
## 共识
- ...

## 仍存分歧 (本次议会的价值)
- <persona A> 认为 ... 但 <persona B> 认为 ...

## 如果必须今天决定
<一个有偏见的但 actionable 的建议, 明确标注来自哪个 persona 的视角>

## 本次议会暴露出的新思考模式
<如果有, 本身会被再蒸馏成 skill — 对应架构里的 "Capture this debate">
```

**纪律**:
- **不追求消除分歧** — 保留分歧本身就是核心价值
- 不写"综上所述", 直接给结论

---

## 5. 各命令的实现计划

### `council init`
- 交互式问 3 个问题 (你是谁 / 在做什么 / 目前纠结什么)
- 写 `~/.council/identity.md` + `config.yml`
- 拷贝 `seeds/personas/` 到 `~/.council/personas/mentors/` 和 `roles/`
- 输出: "Your Council is ready. Try: `council capture`"

### `council capture`
三个来源:
- `council capture` (无参): 读 `stdin` (管道) 或剪贴板
- `council capture --file <path>`
- `council capture --from claude-export.json`

动作:
1. 检测对话格式 (Claude export / 纯文本 / Markdown)
2. 自动生成 slug (让 LLM 给一个 3-5 字中文标题)
3. 写入 `~/.council/sessions/<date>-<slug>.md`
4. 打印: "Captured. Run `council distill <id>` or `council distill --auto`"

### `council distill`
- `council distill <session-id>`: 处理指定 session
- `council distill --auto`: 处理所有 `distilled: false` 的 session
流程:
1. 跑 P1 (identify highlights) → 每个 highlight 写成 `skills/<date>-<slug>-<n>.md`
2. 跨 session 按 `type` 聚类所有 highlight
3. 跑 P2 (forge persona) → 写 `personas/self/<name>.md`
4. 更新 `.state/distilled.json`
5. 终端展示: 新增 N highlight, 新增/更新 M persona

### `council persona list / add`
- `list`: 读 `personas/` 下所有 frontmatter, 表格输出 (name, type, description)
- `add <path-or-url>`: 从本地路径或 URL 拉 SKILL.md, 校验 frontmatter, 放入 `personas/mentors/`

### `council convene "<问题>"`
1. 跑 P3 (summon) → 得到 3-5 个 persona
2. 并行跑 P4 (statements)
3. 并行跑 P5 (cross-exam)
4. 跑 P6 (synthesis)
5. 流式渲染 (`engine/render.ts`):
   - 每个 persona 有颜色 + 头像字符 (e.g. N / J / D)
   - statement 逐字 typewriter, 不等所有完成
   - cross-exam 用不同缩进
   - synthesis 带高亮框
6. 全过程写入 `transcripts/<date>-<slug>.md`
7. 最后问: "把本次议会本身捕获为新 skill? [y/N]" (对应 Capture-this-debate)

### `council export --mcp`
- 生成 `~/.council/exports/mcp-server/` 目录:
  - `package.json` (指向 `@modelcontextprotocol/sdk`)
  - `server.js` (打包后的 MCP server)
  - `README.md` (粘贴给 Claude Desktop 的 config 片段)
- 输出到终端:
  ```json
  "council": {
    "command": "bun",
    "args": ["~/.council/exports/mcp-server/server.js"],
    "env": { "ANTHROPIC_API_KEY": "..." }
  }
  ```

### `council serve`
- 直接启动 MCP server (不经 export, 开发时用)
- stdio transport

---

## 6. MCP Server 设计

**4 个 tool**:

### `council_convene`
```
description: 召开一次思考议会, 针对用户的问题让多个 persona 辩论并综合.
input_schema:
  question: string (required)
  personas: string[] (optional, 默认自动 summon)
returns:
  transcript 的 Markdown + 结构化的 consensus/dissent 字段
```

### `council_ask_persona`
```
description: 单独问某个 persona 一个问题.
input_schema:
  persona: string (e.g. "mentors:naval")
  question: string
```

### `council_capture_this`
```
description: 把调用方 (如 Claude Desktop) 当前的对话捕获为 Council 的新 session, 并立即蒸馏.
input_schema:
  conversation: string (markdown 格式)
  title_hint: string (optional)
```

### `council_list_personas`
```
description: 列出当前可用的所有 persona, 供调用方决定要不要 convene 或 ask.
input_schema: {}
returns:
  [{name, type, description}]
```

---

## 7. 三天时间线

**Day 1 — 周五 (地基 + 真实性验证)**
上午:
- `bun init`, 目录结构, commander 骨架
- `paths.ts` / `skill-md.ts` / `frontmatter.ts` / `claude.ts`
- `init` + 种子文件拷贝
- `capture` (支持 file + stdin, 剪贴板放后面)

下午:
- 写 P1 (identify-highlights) prompt
- 实现 `distill` 命令 (只跑 P1, 输出 highlights)
- **关键验收**: 用 自我的材料/*.md 全部跑一遍, 人工评估每个 highlight 是否真实属于用户
- 如果 P1 输出有"AI 式通用洞察"混入, 迭代 prompt 直到合格

晚上:
- P2 (forge-persona)
- 跨 session 聚类 + persona 生成
- 手工修 naval.md / jobs.md / devils-advocate.md 三个种子 persona (从花叔抓原料 + 精修, 不完全自动)

**Day 2 — 周六 (议会引擎)**
上午:
- P3 (summon) + P4 (statements, 并行)
- `engine/convene.ts` 编排骨架

下午:
- P5 (cross-exam) + P6 (synthesis)
- `engine/render.ts` 终端流式渲染 (头像 + 颜色 + boxen)
- 端到端跑 `council convene "我应该红药丸还是蓝药丸"` 冒烟

晚上:
- `council persona list/add`
- transcripts 落盘
- 修 bug, 调 prompt (尤其是 P5 防客套)

**Day 3 — 周日 (MCP + demo)**
上午:
- `mcp/server.ts` 4 个 tool 实现
- `council export --mcp` + `council serve`
- 在 Claude Desktop 里配上, 端到端验证

下午:
- 终端 UI 抛光 (spinner / 颜色 / 辩论节奏)
- 写极简 README
- demo 脚本反复过 (见 §8)
- 备份 demo 数据 (预蒸馏一套兜底, 万一现场 API 断网)

晚上:
- 上台

---

## 8. Demo 脚本 (现场实时版, 真实性优先)

**0:00–0:30 · 钩子 + 问题**
打开终端, 已经 `council init` 过, 有 3 个 mentor, 但 **self personas 目录是空的**。
> "我今天不放录屏。接下来 3 分钟, 你们将看到一个 AI 从零开始学会我怎么思考。"

**0:30–1:20 · 实时 Capture + Distill**
粘贴 `自我的材料/Claude-从第一性原理到产品设计的学习路径.md` 的前 1/3 到剪贴板。
```bash
council capture
# → Captured: 2026-04-26-learning-path

council distill 2026-04-26-learning-path
# → 屏幕上出现 3 条 highlight 被识别出来
# → Generated persona: self/reframe-before-collect.md
```
打开那个 md 文件, 念出第一人称的"我是谁"段落。关键一句:
> "看, 这不是 GPT 说的'要用第一性原理', 这是我上周具体怎么拆一个'读什么书'的问题的方式。"

**1:20–2:30 · Convene**
```bash
council convene "我应该先做 60 分产品快速上线, 还是再想清楚一点?"
```
屏幕上:
- 🔵 self:reframe-before-collect 先说 (刚蒸馏出来的, **真实**)
- 🟡 mentors:naval 跟上
- 🔴 roles:devils-advocate 反驳
- cross-exam 互相点破
- synthesis 框出 "共识 / 仍存分歧 / 今天的建议"

停在 synthesis 界面:
> "它给了结论, 但更重要的是它**告诉我这件事仍然有分歧** — 这才是议会的价值。"

**2:30–3:00 · MCP 一键出圈 + 愿景**
```bash
council export --mcp
# 粘贴配置到 Claude Desktop
```
切到 Claude Desktop:
> User: 我还是在纠结要不要全职 all in
> Claude: [自动调用 council_convene]
> 返回议会结论

收尾:
> "Council 兼容花叔、Second Me、AGENTS.md 所有生态。它不和它们竞争, 它让它们一起开会。蒸馏之后的下一步, 不是让 AI 变成你, 是让 AI 帮你成为自己最好的那个版本。"

**兜底**: 如果 `council distill` 现场失败 (网络/API), 切到预跑好的 `~/.council.backup/` 继续 demo, 这一步台下看不出。

---

## 9. 风险登记

| 风险 | 概率 | 影响 | 对策 |
|---|---|---|---|
| P1 输出"AI 式通用洞察", 真实性崩塌 | 高 | 致命 | Day 1 下午必须过真实性验收, 不过关就不进入 Day 2 |
| Claude API 现场慢或超时 | 中 | 中 | 预蒸馏兜底数据; convene 用流式输出掩盖延迟 |
| MCP 在 Claude Desktop 上跑不通 | 中 | 高 | Day 3 上午优先级 #1; 实在不行用 `council serve` + 命令行演示 |
| 三个 persona 的 statement 互相撞, cross-exam 没料 | 中 | 中 | P3 summon 必须多样性 (1 self + 1 mentor + 1 role 强制) |
| 终端 UI 抛光吃时间, 挤压核心功能 | 中 | 低 | UI 放 Day 3 下午, 砍得动就砍 |
| 用户对话里隐私内容泄露到 demo | 低 | 中 | demo 前过一遍 identity.md, 敏感内容替换占位 |

---

## 10. 验收清单 (Done 的定义)

- [ ] `bun install && bun link && council --help` 能跑
- [ ] `council init` 产出合法的 `~/.council/` 目录
- [ ] `council capture < conversation.md` 落盘正确 session
- [ ] `council distill --auto` 跑完 4 份 `自我的材料/`, 产出 ≥ 3 个 self persona, **每个 persona 都能找到原文逐字支撑**
- [ ] `council convene "<问题>"` 完整跑通, transcript 落盘
- [ ] `council export --mcp` 生成的配置粘贴到 Claude Desktop 后, Claude 能成功调用 `council_convene`
- [ ] 3 分钟 demo 脚本能一次跑完不卡壳

---

## 11. Evolve 详细设计 (恢复后)

### 数据模型 (persona frontmatter 增补)
```yaml
usage_count: 8
last_used: 2026-04-25
score: 0.72                  # 自动计算
status: active | stale | archived
feedback_log:
  - at: 2026-04-25T10:00:00Z
    rating: helpful | generic | off-target
    transcript: 2026-04-25-should-i-quit
    note?: string
```

### `council feedback <transcript-id>`
读该 transcript 参与的 personas, 交互式让用户对每个 persona 的贡献打三档。
写入对应 persona 的 `feedback_log[]`, 重算 `score`。

### `council evolve`
1. 对所有 `type:self` personas 算 `score = (helpful_count - off_target_count - 0.5*generic_count) / total`
2. `score < 0.3` 且 `total >= 3`: 标记 `status: stale`, 移到 `personas/_stale/`
3. 跑 P7 (pairwise merge-check) 在所有 self personas 之间, 找 overlap > 0.75 的配对, 提示 `council merge A B`
4. 终端报告: 标记了 N 个 stale, 建议 M 组 merge

### `council merge <a> <b>`
1. 跑 P8 (synthesize merge) → 预览新 SKILL.md
2. 用户确认 y/N
3. 写入新文件, 旧文件移 `personas/_merged/` (保留溯源)

### P7 — Merge Check
Input: 两个 SKILL.md
Output: `{overlap: 0.0-1.0, rationale: string, suggested_name: string}`

### P8 — Synthesize Merge
Input: 两个 SKILL.md + 所有相关 highlights
Output: 统一的 SKILL.md, 合并 `source_sessions`, 保留 `feedback_log` 聚合

---

## 12. 自主决定 (记录备查)

| 决定 | 选择 | 理由 |
|---|---|---|
| Dev 期 API | `COUNCIL_MOCK=1` 环境变量切打桩 | 用户 key 未到, 不能阻塞 |
| Feedback 粒度 | 三档 categorical | 信号清晰, 无判断疲劳 |
| Mentor persona 来源 | 手工精写, 引用公开 essays/talks | 规避版权模糊, 质量可控 |
| 剪贴板支持 | `clipboardy` (跨平台) | macOS 为主但留退路 |
| Distill 模型 | `claude-opus-4-7` | 高风险环节用最强 |
| Summon 模型 | `claude-sonnet-4-6` | 性价比 |
| Persona 互斥性 | 强制 ≥1 self + ≥1 mentor + ≥1 role | 多样性硬约束 |

---

## 13. 非阻塞问题 (你慢慢答, 不挡工)

1. Anthropic API key 何时到位? (到位前 mock)
2. identity.md 初稿要我从 resume + 对话自动抽, 还是你直接写?
3. demo 主轴对话默认选"从第一性原理到产品设计的学习路径", 你有别的偏好吗?
4. demo 现场语言默认中文, 对吗?
