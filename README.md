# Council

> 你的个人思考议会。每一次对话都是可辩论的资产, 每一次决策都召集一场议会。

**Status**: EvoTavern Beijing Hackathon · Working MVP
**Author**: 墨宇 (Siyu Deng)

---

## 3 分钟看懂

```
真实对话 ──▶ capture ──▶ distill ──▶ 蒸馏出属于你的 self personas
                                            │
你的问题 ──▶ convene ──▶ 召集 self + mentor (Naval/Jobs/Munger) + role (魔鬼代言人)
                                            │
                                            ▼
                        各自独立表态 ──▶ 互相质疑 ──▶ 综合建议 + 明确分歧
                                            │
                                            ▼
                        反馈 ──▶ evolve ──▶ 标记过时、建议合并
                                            │
                                            ▼
                        export --mcp ──▶ Claude Desktop 可直接召开你的议会
```

**Council 不是蒸馏一个你, 是召开你的思考会议。**

---

## 安装与初始化

```bash
# 装 Bun (如果还没有)
curl -fsSL https://bun.sh/install | bash

# 安装依赖
bun install

# 配置 API Key (项目根 .env, 已 gitignore)
echo 'ANTHROPIC_API_KEY=sk-ant-...' > .env

# 初始化 (创建 ~/.council/ 并拷入 3 个 mentor + 2 个 role persona)
bun run bin/council.ts init
```

为方便, 可以 `alias council='bun run /path/to/councli/bin/council.ts'`。后文假定这个 alias。

---

## 核心流程

### 1. 捕获一段真实对话

```bash
council capture --file ~/Downloads/my-claude-chat.md
# 或从剪贴板
council capture --clipboard
# 或从 stdin
pbpaste | council capture
```

### 2. 蒸馏出属于你的 personas

```bash
council distill --auto
```

LLM 会:
- 用 P1 prompt 识别 "真正属于用户自己" 的思考高光 (拒绝用户点头同意 AI 的片段)
- 用 P2 prompt 把同类高光融合为一个 **第一人称** persona
- 输出到 `~/.council/personas/self/`

**真实性守门员**: P1 的 system prompt 有硬拒绝清单, confidence < 0.5 的高光被丢弃。

### 3. 召集议会

```bash
council convene "我应该先做一个不完美的产品推出去吗?"

# 或显式指定 persona
council convene "..." --with "self:xxx,mentors:naval,roles:devils-advocate"
```

流程:
- **Summon**: 根据问题自动选 3-5 个 persona (强制 ≥1 self + ≥1 mentor + ≥1 role)
- **Statements**: 每个 persona 独立表态, 流式输出
- **Cross-exam**: 互相点出对方盲点 (prompt 里明确禁止客套)
- **Synthesis**: 综合, 但 **保留分歧** — 不追求"所以应该..."

transcript 会落到 `~/.council/transcripts/<date>-<slug>.md`。

### 4. 反馈 + 进化

```bash
council feedback <transcript-id>        # 三档评分: h/g/o
council evolve                          # 标记 stale, 建议合并
council merge self:aaa self:bbb         # 融合两个重叠 persona
```

score < 0.3 且反馈数 ≥ 3 的 persona 被归档到 `_stale/`。

### 5. 导出为 MCP Server, 让 Claude Desktop 直接用

```bash
council export --mcp
```

会打印一段 JSON 片段, 粘贴到 `~/Library/Application Support/Claude/claude_desktop_config.json` 的 `mcpServers` 下。重启 Claude Desktop, 然后:

> 你: 帮我决定要不要离职
> Claude: *调用 council_convene...*
> Claude: [返回你的议会辩论结果]

---

## 目录结构

```
~/.council/
├── identity.md                        # 告诉 Council 你是谁 (你手写)
├── config.yml                         # 模型配置 (默认 Haiku 4.5)
├── personas/
│   ├── self/<name>.md                 # 从你的对话蒸馏
│   ├── mentors/{naval,jobs,munger}.md # 预置
│   └── roles/{devils-advocate,first-customer}.md
├── sessions/<date>-<slug>.md          # 捕获的原始对话
├── skills/<session-id>-hN.md          # 蒸馏出的高光
├── transcripts/<date>-<slug>.md       # 议会 transcript
├── exports/mcp-server/                # MCP 导出产物
└── .state/distilled.json              # 防重跑索引
```

所有数据都是 Markdown + YAML, 用户拥有完全控制权, 可以 `git init` 版本化。

---

## 命令表

| 命令 | 用途 |
|---|---|
| `council init` | 初始化 ~/.council/ |
| `council capture [--file/--clipboard]` | 捕获一段对话为 session |
| `council distill [id\|--auto]` | 蒸馏 session 为 highlights + self personas |
| `council persona list` | 列出所有 persona |
| `council persona add <path\|url>` | 导入外部 SKILL.md |
| `council convene "<问题>"` | 召开议会 |
| `council feedback <transcript-id>` | 对议会评分 |
| `council evolve` | 扫全库, 标记 stale, 建议 merge |
| `council merge <a> <b>` | 融合两个 persona |
| `council export --mcp` | 导出 MCP Server 配置 |
| `council serve` | 直接启动 MCP server (stdio) |

---

## MCP 工具清单

Council 通过 MCP 暴露 4 个 tool 给 Claude Desktop / Cursor 等:

| Tool | 用途 |
|---|---|
| `council_list_personas` | 列出可用 persona |
| `council_convene` | 召开议会, 返回 transcript |
| `council_ask_persona` | 单独问某个 persona |
| `council_capture_this` | 把当前对话捕获并立即蒸馏 |

---

## 设计哲学

1. **用户数据属于用户** — 所有数据都是 `~/.council/` 下的 Markdown, 可 Git 版本化
2. **协议高于产品** — 兼容 SKILL.md / MCP / AGENTS.md 三大标准
3. **分歧是价值** — 议会不追求共识, 分歧本身就是产出
4. **简洁是纪律** — 无数据库、无 Web UI、无模型训练, 十年不过时

详细架构见 [council-architecture.md](./council-architecture.md), 开发纪律见 [BUILD_PLAN.md](./BUILD_PLAN.md)。

---

## Dev

```bash
bun install
bun run bin/council.ts --help              # CLI
bun run src/mcp/server.ts                  # MCP server (stdio)

# 沙箱测试 (不动你真正的 ~/.council/)
COUNCIL_HOME=/tmp/.council-test bun run bin/council.ts init

# 打桩 (不调真实 API, 便于离线开发)
COUNCIL_MOCK=1 bun run bin/council.ts distill --auto
```

---

## License

MIT
