# Council

[![npm version](https://img.shields.io/npm/v/@moyu-build/council.svg?color=E8B563)](https://www.npmjs.com/package/@moyu-build/council)
[![npm downloads](https://img.shields.io/npm/dt/@moyu-build/council.svg?color=8C8780)](https://www.npmjs.com/package/@moyu-build/council)
[![License: MIT](https://img.shields.io/badge/License-MIT-amber.svg?color=E8B563)](LICENSE)
[![MCP](https://img.shields.io/badge/MCP-server-amber.svg?color=B86D3A)](https://modelcontextprotocol.io)
[![Node](https://img.shields.io/badge/node-≥20-green)](https://nodejs.org)

> Your thinking, round-tabled.
>
> ChatGPT 让 AI 认识全人类。**Council 让 AI 认识你。**
>
> 不是让 AI 变成你, 是把你的思考外化成可召集的结构 — 然后通过 MCP 把这套结构暴露给任何 LLM 客户端 (Claude Desktop / Cursor / Cherry Studio)。

**Author**: 墨宇 (Siyu Deng) · **License**: MIT · **Status**: EvoTavern Hackathon 2026
**Stack**: Node 20+ · TypeScript · MCP Protocol · Anthropic Claude (Haiku 4.5) · Vite + React + Tailwind

---

## 5 分钟跑起来

```bash
# 1. 安装 (需要 Node 20+)
npm install -g @moyu-build/council

# 2. 准备 API key
echo "ANTHROPIC_API_KEY=sk-ant-..." > ~/.council.env

# 3. 初始化
council init

# 4. 体验三条主链路
council capture --file your-claude-chat.md      # 摄入一段思考对话
council distill --auto                           # 蒸馏出 self persona
council convene "我该不该接这个外包"             # 召集议会
council refine self:reframe-before-execute      # 让已有 persona 吸收新洞见

# 5. MCP 接入 Claude Desktop / Cursor
council export --mcp
# 把打印出的配置贴进 claude_desktop_config.json / .cursor/mcp.json → 重启客户端
```

> ⚠️ **`council live`（网页圆桌可视化）目前需要 Bun runtime** — 因为 live server 用了 `Bun.serve()` 提供低延迟的 SSE。如需用网页 GUI，请先 `brew install bun` 或参考 [bun.sh](https://bun.sh)。CLI / MCP 部分全部跑在 Node 上。

---

## 为什么要有 Council

每个做"个人 AI"的产品, 都在回答同一个问题: **怎么让 AI 更像你?**

Hermes 让 AI 和你一起成长。Second Me 训练你的数字分身。Evolver 给 Agent 装进化协议。花叔蒸馏思想家, 让你召唤他们进 Claude。

Council 问了一个不一样的问题:

> **怎么让人的思考变得更结构化、更可被自己召集、更可辩论 — 让人继续做决策者, AI 只是让议会继续开着的基础设施?**

Hermes 让 AI 更像你。**Council 让你更像你。**

这不是一个更好的 Agent。这不是 Agent。它是一种不同的**主语**。

---

## 核心流程

```
真实对话 ──▶ capture ──▶ distill ──▶ 蒸馏出属于你的 self personas
                                            │
你的问题 ──▶ convene ──▶ 召集 self + mentor (Naval/Jobs/Munger) + role (魔鬼代言人)
                                            │
                                            ▼
                        各自独立表态 ──▶ 互相质疑 ──▶ 综合建议 + 明确分歧
                                            │
                      ┌─────────────────────┼─────────────────────┐
                      ▼                     ▼                     ▼
                  终端 CLI            网页圆桌直播           MCP 可调用
                  (数据层)           (议会可视化)         (Claude/Cursor)
```

---

## 两种使用姿势

### CLI (开发者/资深用户的本地运行时)

```bash
council capture ./my-claude-chat.md      # 捕获对话
council distill --auto                   # 识别高光 + 蒸馏 self persona
council convene "我应该先做不完美的产品推出去吗"
```

每个命令的输出都是真实文件系统里的 Markdown。可 `git init`, 可手改, 可删除。

### Web (让别人看到你议会的开法)

```bash
council convene "我应该全职做 Council 吗" --watch
```

同一条命令, 加 `--watch`。终端日志继续打印, 浏览器自动弹出一张圆桌。椅子亮起表示在发言, 虚线箭头表示互相质疑, 最后中央浮现一张羊皮纸决议卡 (共识 / 仍存分歧 / 如果今天必须决定 / 本次议会的新模式)。

```bash
# 或者只启动 live server, 不发起议会:
council live                             # 浏览器访问 http://localhost:3737
```

### MCP (让 Claude Desktop / Cursor 等直接召集)

```bash
council export --mcp
# 把打印出来的配置贴进 claude_desktop_config.json → 重启 Claude Desktop
```

之后在 Claude Desktop 里:

> 你: 帮我决定要不要离职
> Claude: *调用 council_convene...*
> Claude: [返回你议会的结构化结论]

---

## 目录结构 (用户的议会就是文件系统)

```
~/.council/
├── identity.md                        # 告诉 Council 你是谁 (你手写)
├── config.yml                         # 模型配置 (默认 Haiku 4.5)
├── personas/
│   ├── self/<name>.md                 # 从你的对话蒸馏
│   ├── mentors/{naval,jobs,munger}.md # 预置
│   └── roles/{devils-advocate,first-customer}.md
├── sessions/<date>-<slug>.md          # 捕获的原始对话
├── skills/<观点-slug>.md              # 蒸馏出的高光 (按观点命名, 例: 真实性守门员是产品退化的防线.md)
├── transcripts/<date>-<slug>.md       # 议会 transcript (人读的)
├── live/<run-id>.jsonl                # 议会事件流 (网页/telemetry 订阅)
├── exports/mcp-server/                # MCP 导出产物
└── .state/distilled.json              # 防重跑索引
```

Markdown + YAML + JSONL, 没有数据库。用户拥有完全控制权。

---

## 安装

### 路径 A · NPM (推荐, 90% 用户)

```bash
# 一次性试水, 不全局装
export ANTHROPIC_API_KEY=sk-ant-...
npx @moyu-build/council@latest init
npx @moyu-build/council@latest convene "我该不该 X"

# 或全局装 (装一次, 之后命令直接是 council)
npm i -g @moyu-build/council
council init
council convene "我该不该 X"
```

**要求**: Node ≥ 20。**纯 npm 用法不需要 Bun**——dist 是 Node 单文件 bundle。

> ⚠️ 唯一例外: `council live` (网页圆桌直播) 仍需 Bun runtime——live server 用了 `Bun.serve()` 提供低延迟 SSE。**只用 CLI / MCP 的话, 装 Node 即可.**

### 路径 B · 从源码 (贡献者 / 跑 live server / 修引擎)

源码级运行需要 Bun, 因为引擎用了 TypeScript parameter properties 等语法, Node 不直接支持 (但 `tsdown` 打出来的 dist 是干净的 Node bundle, 这就是为什么发布版只要 Node).

```bash
# 1. Bun (如果没有)
curl -fsSL https://bun.sh/install | bash

# 2. 依赖
git clone https://github.com/siyu-deng/council.git && cd council
bun install
(cd web && bun install)

# 3. API Key
echo 'ANTHROPIC_API_KEY=sk-ant-...' > .env

# 4. 初始化 (创建 ~/.council/ + 预置 3 mentor + 2 role)
bun run bin/council.ts init

# 5. (可选) demo 前预检
bun preflight              # 全绿 = 可以上场
```

---

## 命令表

| 命令 | 用途 |
|---|---|
| `council init` | 初始化 ~/.council/ |
| `council capture [--file/--clipboard]` | 捕获一段对话为 session |
| `council distill [id\|--auto]` | 蒸馏 session 为 highlights + self personas |
| `council persona list` | 列出所有 persona |
| `council persona add <path\|url>` | 导入外部 SKILL.md 作为 mentor |
| `council convene "<问题>" [--watch]` | 召开议会。`--watch` 打开网页圆桌直播 |
| `council live` | 仅启动 Live Server (端口 3737), 不发起议会 |
| `council feedback <transcript-id>` | 三档评分 h/g/o |
| `council evolve` | 扫全库, 标记 stale, 建议 merge |
| `council merge <a> <b>` | 融合两个 persona |
| `council export --mcp` | 导出 MCP Server 配置 |
| `council serve` | 启动 MCP Server (stdio) |

---

## MCP 工具

| Tool | 用途 |
|---|---|
| `council_who_am_i` | 拉用户身份档案 + 全部可用 persona (会话开场调一次) |
| `council_list_personas` | 列出可用 persona (轻量) |
| `council_convene` | 召开议会, 返回 transcript |
| `council_ask_persona` | 单独问某个 persona |
| `council_should_capture` | 在 capture 前判断对话值不值得 |
| `council_capture_this` | 把当前对话捕获并立即蒸馏 |
| `council_bootstrap_identity` | 基于已有 self personas 反向回推 identity 草稿 |

### 接入 MCP 客户端

**Claude Code (一行命令)**:

```bash
claude mcp add council -e ANTHROPIC_API_KEY=sk-ant-... -- npx -y @moyu-build/council@latest serve
```

**Claude Desktop / Cursor / Cherry Studio (改 JSON 配置)**:

```json
{
  "mcpServers": {
    "council": {
      "command": "npx",
      "args": ["-y", "@moyu-build/council@latest", "serve"],
      "env": { "ANTHROPIC_API_KEY": "sk-ant-..." }
    }
  }
}
```

> 客户端首次启动会触发 `npx` 拉取最新版, 之后命中 npm 缓存秒启动。`@latest` 标签确保你跟主分支。
> 数据落在 `~/.council/`, 跨客户端共享同一份身份档案。

---

## 架构 (三层解耦)

```
┌─ CLI ─────────────── MCP Server ───────────── Web (浏览器/Pake app) ─┐
│                                                                      │
│                     POST /api/command                               │
│       writes          ▼                 broadcast                   │
│     ┌──────── 事件总线 (events.ts) ────────┐                        │
│     │                                      │                        │
│     ├─▶ ~/.council/live/*.jsonl (真相)    │                        │
│     ├─▶ stderr (CLI 渲染)                  │                        │
│     └─▶ WebSocket (网页订阅)              │                        │
│                                                                      │
│          convene / capture / distill / evolve  <── 业务引擎          │
│                         │                                            │
│                         ▼                                            │
│                   Claude Haiku 4.5                                   │
└──────────────────────────────────────────────────────────────────────┘
```

三层严格解耦:
- **数据层** (`~/.council/`): 文件系统是单一真相。Git-trackable, 用户拥有。
- **运行时** (CLI + MCP + Live Server): 业务逻辑, 事件总线, API 调用。stdout 干净 (MCP 协议安全), 事件通过文件+订阅两路出去。
- **展示层** (CLI 渲染 / 网页圆桌 / MCP 客户端): 只读订阅事件。互相不知道对方存在。

---

## 设计哲学

1. **你的数据属于你** — `~/.council/` 是纯 Markdown。Git-trackable, 可审计, 可导出, 可删除。没有数据库, 没有云依赖。
2. **协议高于产品** — 兼容 SKILL.md / MCP / AGENTS.md 三大标准。花叔的人物 skill 可以直接作为 mentor persona, Second Me 的模型可以作为 self persona 槽, Hermes/Evolver 蒸馏出的 skill 可以作为能力模块。**Council 不竞争, 是协同层**。
3. **分歧是特性** — 永远同意你的议会是你不需要的议会。synthesis 必须标出"仍存分歧", 不允许和稀泥。
4. **减法是纪律** — CLI + Markdown + MCP + 一页式 Web。没有 web UI dashboard, 没有账号, 没有训练, 十年后仍然成立。
5. **主语是人** — 这不是功能差异, 是世界观差异。任何对手把 Council 的功能抄光, 只要他们仍以"让 AI 更像你"为目标, 他们就做不出 Council。

---

## Dev

> 源码级开发需要 Bun。**纯使用者通过 `npm i -g @moyu-build/council` 即可, 不需要这一节**。

```bash
bun install
(cd web && bun install && bun run build)   # 首次构建 web 产物

# 后端 + 前端同时跑
bun run bin/council.ts live                # 本地 HTTP/WS on :3737
# 在另一个 terminal:
cd web && bun run dev                      # Vite dev server on :5173, 代理到 3737

# 沙箱测试
COUNCIL_HOME=/tmp/.council-test bun run bin/council.ts init

# Mock 模式 (不调真实 API)
COUNCIL_MOCK=1 bun run bin/council.ts convene "..." --watch
```

### 预检脚本

```bash
bun preflight              # 真实 API (~2 分钟)
bun preflight:mock         # mock 模式 (~5 秒)
bun preflight:fast         # 跳过 convene (省 API 钱)
bash scripts/preflight.sh --skip-web   # 只验 CLI/MCP
```

全绿即可上场。

---

## 状态 · 下一步

- ✅ **L0**: 事件总线 + 结构化 synthesis + persona 视觉元数据
- ✅ **L1**: Bun HTTP/WS server + Vite/React 圆桌页面 + `--watch`
- ✅ **L2**: 网页 capture/distill 流程 (粘贴 → 蒸馏 → 直接召集)
- 🔜 **L3**: Pake/Tauri Mac 原生 app (依赖 Rust ≥ 1.78)
- 未来: 剪贴板监听自动 capture, 桌面端全局快捷键, Council 之间的互相借调

详细架构见 [council-architecture.md](./council-architecture.md) · 演讲脚本见 [DEMO.md](./DEMO.md)

---

## License

MIT
