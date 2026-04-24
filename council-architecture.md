# Council

> Your personal thinking council. Every conversation becomes a debatable asset. Every decision convenes a council of minds — including your own.

**Author**: 墨宇 (Siyu Deng)
**Status**: EvoTavern Beijing Hackathon · In Development
**Stack**: TypeScript · Node.js · Claude API · MCP Protocol · SKILL.md

---

## 一、Why Council

### 1.1 问题

AI 时代最稀缺的不是算力，不是模型，是**人做判断的结构**。

每个使用 AI 的人每天都在做大量决策：要不要接这个项目？这个方案对不对？这个人的反馈要不要听？但当他们打开 ChatGPT、Claude、Cursor 时，AI 每次都在**从零开始理解他们是谁、怎么想问题、手里在做什么**。

更糟的是，用户**每一次高质量的思考**——和 AI 的深度推演、被质疑后的重新框架、推翻 AI 的那个瞬间——**全都丢进对话历史里烂掉了**。下次打开新对话，全部归零。

### 1.2 现有方案的结构性缺陷

我调研了这个领域的全部主流玩家，他们共享同一个盲区。

| 产品 | 形态 | 核心问题 |
|---|---|---|
| Second Me (14k★) | 训练个人 AI 模型 | 处理"事实"和"偏好"，不处理"推理路径" |
| PAI (Daniel Miessler) | 模块化 Claude Code 基础设施 | 静态 Skill 集合，不会进化 |
| 花叔 nuwa-skill | 蒸馏公众人物思维 | 单向蒸馏，不接受使用反馈 |
| Agent Skills CLI | 175k+ skills 跨平台分发 | Skill 之间孤立，不能协同辩论 |
| AGENTS.md 标准 | 协议层统一 | 只管协议，不管内容 |

**他们的共同盲区：**

1. 记录"你是谁"，不记录"你怎么想"
2. 一次蒸馏终生不变，不会随使用进化
3. Skill 之间是孤岛，不会互相辩论
4. 绕过了最宝贵的数据源——**实时对话中的思考高光**

### 1.3 Council 的定位

**Council 不是另一个数字分身产品。**

它是一个**思考议会协议**——把你和 AI 的每一次深度对话蒸馏成可辩论的思维资产，让你自己蒸馏的纳瓦尔、乔布斯、第一性原理视角和你自己的决策框架，**在你下次面对问题时同时在场、各自表态、互相质疑、综合判断**。

一句话：**不是"蒸馏一个你"，是"召开你的思考会议"。**

---

## 二、Core Concept

### 2.1 核心循环

```
         真实对话
           │
           ▼
     ┌──────────┐
     │ Capture  │  识别思考高光 → 蒸馏 Thinking Skill
     └────┬─────┘
          │
          ▼
     ┌──────────┐
     │ Convene  │  召集议会 → 多 persona 辩论 → 综合判断
     └────┬─────┘
          │
          ▼
     ┌──────────┐
     │ Evolve   │  使用反馈 → Skill 自我修正
     └────┬─────┘
          │
          └────────── 下次对话 ←───────
```

四个核心动词：**Capture（捕获）→ Distill（蒸馏）→ Convene（召集）→ Evolve（进化）**。

### 2.2 三类 Persona

议会里坐着三种人。

**第一类：Self Personas**
从你自己的对话里蒸馏的思维框架。例：
- `first-principles-thinker.md`（你用第一性原理拆问题的方式）
- `project-selection.md`（你评估项目的决策树）
- `rejection-handling.md`（你面对否定时的处理路径）

**第二类：Mentor Personas**
你蒸馏的外部思想家。兼容花叔 nuwa-skill 格式，可直接导入。例：
- `naval.md`、`jobs.md`、`munger.md`、`feynman.md`

**第三类：Role Personas**
场景化角色，专为特定决策服务。例：
- `devils-advocate.md`（魔鬼代言人，专门反驳）
- `future-self.md`（五年后的你）
- `first-customer.md`（第一位真实用户视角）

### 2.3 议会机制

当用户 `council convene "<问题>"`：

1. **Summon**：根据问题上下文，自动选择最相关的 3-5 个 persona
2. **Statement**：每个 persona 独立给出判断（不受他人影响）
3. **Cross-examine**：persona 之间互相质疑对方的盲点
4. **Synthesis**：系统综合分歧点，给出最终建议 + 明确标注"仍存分歧的地方"
5. **Capture**：本次辩论本身也会被捕获成新的 Thinking Skill

**关键原则：议会不追求共识。** 分歧本身就是价值——它告诉用户"这件事没那么简单"。

---

## 三、Architecture

### 3.1 目录结构

```
~/.council/                        ← 用户的议会根目录
├── identity.md                    ← 核心画像（你是谁，在做什么）
├── config.yml                     ← 模型路由、API Key、persona 偏好
│
├── personas/
│   ├── self/                      ← 从你的对话蒸馏
│   │   ├── first-principles.md
│   │   ├── project-selection.md
│   │   └── rejection-handling.md
│   ├── mentors/                   ← 外部思想家
│   │   ├── naval.md
│   │   └── jobs.md
│   └── roles/                     ← 场景角色
│       ├── devils-advocate.md
│       └── first-customer.md
│
├── sessions/                      ← 捕获的原始对话
│   └── 2026-04-23-evotavern.md
│
├── skills/                        ← 已蒸馏的 Thinking Skills
│   └── [按 capture 时间排列]
│
├── transcripts/                   ← 历次 Council 辩论的记录
│   └── 2026-04-25-should-i-quit.md
│
└── exports/                       ← 导出产物
    ├── mcp-server/                ← MCP Server 形态
    ├── claude-skills/             ← Claude Skills 格式
    └── cursor-rules/              ← Cursor Rules 格式
```

### 3.2 CLI 接口

```bash
# ━━━ 初始化 ━━━
council init                                 # 创建 ~/.council/ 结构
council identity                             # 交互式构建 identity.md

# ━━━ Capture（捕获） ━━━
council capture                              # 从剪贴板/管道捕获对话
council capture --from claude-export.json    # 从 Claude.ai 导出捕获
council capture --file ./chat.md             # 从文件捕获

# ━━━ Distill（蒸馏） ━━━
council distill <session-id>                 # 将 session 蒸馏为 Thinking Skills
council distill --auto                       # 自动蒸馏所有未处理 session

# ━━━ Persona 管理 ━━━
council persona list                         # 列出所有 persona
council persona add <nuwa-skill-url>         # 从花叔生态导入 mentor
council persona create <name>                # 创建自定义 role persona
council persona edit <name>                  # 编辑 persona

# ━━━ Convene（召集议会） ━━━
council convene "<问题>"                      # 召开一次议会
council convene "<问题>" --personas naval,jobs,self:first-principles
council convene "<问题>" --mode debate       # 辩论模式（互相质疑）
council convene "<问题>" --mode council      # 议会模式（各自表态 + 综合）

# ━━━ Evolve（进化） ━━━
council evolve                               # 审视所有 skill，标记可能过时的
council feedback <skill-id> <rating>         # 对某次判断给反馈
council merge <skill-a> <skill-b>            # 合并重叠的 skill

# ━━━ Export（导出） ━━━
council export --mcp                         # 导出为 MCP Server
council export --claude                      # 导出为 Claude Skills
council export --cursor                      # 导出为 Cursor Rules
council serve                                # 启动 MCP Server，监听调用

# ━━━ 交互模式 ━━━
council                                      # 进入 REPL，持续对话
```

### 3.3 MCP 集成

Council 的核心杀手锏：**一键变成 MCP Server**，让 Claude Desktop / Cursor / Codex 任何 MCP 客户端都可以"召开你的议会"。

```bash
council export --mcp
# 生成 ~/.council/exports/mcp-server/
# 输出配置片段，用户粘贴到 claude_desktop_config.json

# 之后在任何 Claude 对话里：
# User: 我在纠结要不要离职做这个项目
# Claude: [自动调用 council_convene tool]
# → 返回议会辩论结果
```

**暴露的 MCP Tools：**

- `council_convene`：召集议会
- `council_ask_persona`：单独问某个 persona
- `council_capture_this`：把当前对话捕获成资产
- `council_list_personas`：列出可用 persona

### 3.4 技术栈

| 层 | 技术选型 | 理由 |
|---|---|---|
| CLI Framework | Node.js + Commander.js / Bun | 跨平台、启动快、生态好 |
| LLM 调用 | Anthropic Claude API（主）+ 可切换 | 长上下文适合蒸馏 |
| 文件格式 | SKILL.md（YAML frontmatter + Markdown） | 和花叔、GitHub Copilot、AGENTS.md 标准完全兼容 |
| MCP Server | @modelcontextprotocol/sdk | 官方 SDK |
| 存储 | 纯文件系统（`~/.council/`） | 用户可直接读/编辑/Git 管理 |
| 辩论引擎 | 多轮 Claude 调用 + 结构化 prompt chain | 不需要复杂框架 |

**刻意的技术选择：**

- **不用数据库**：所有数据都是 Markdown 文件，用户拥有完全控制权，可以用 Git 版本化
- **不做 Web 界面**：核心形态就是 CLI + MCP，Web UI 留给未来
- **不训练模型**：所有智能来自 prompt engineering + SKILL.md 结构化，门槛低、可移植

---

## 四、Differentiation

### 4.1 和 Second Me 的区别

| 维度 | Second Me | Council |
|---|---|---|
| 形态 | 训练出的个人模型 | 可辩论的 persona 集合 |
| 数据源 | 用户上传的静态数据 | 实时对话 + 外部 mentor + 场景角色 |
| 单数 vs 复数 | 一个"我" | 一群声音（我 + 我的思想家 + 场景角色）|
| 核心体验 | "问我的 AI 分身" | "召开我的思考会议" |
| 进化方式 | 重新训练 | 使用反馈自动修正 |

**关系：** Council 可以**导入** Second Me 训练出的模型作为"self persona"。不是竞品，是上层。

### 4.2 和花叔蒸馏生态的区别

| 维度 | 花叔 nuwa-skill | Council |
|---|---|---|
| 蒸馏对象 | 公众人物（外部） | 用户自己的思考（第一人称） |
| 使用场景 | 调用单个思想家 | 召集多个思想家 + 自己辩论 |
| 生态关系 | 生产 SKILL.md | 消费并协同 SKILL.md |

**关系：** 花叔蒸馏的每一个人物 skill，都可以直接成为 Council 里的一位 mentor persona。Council 是花叔生态的**运行时**。

### 4.3 和 Agent Skills CLI 的区别

| 维度 | Agent Skills CLI | Council |
|---|---|---|
| 定位 | Skill 分发和同步工具 | 第一人称思考系统 |
| 核心抽象 | Skill | Persona + Council |
| 用户角色 | Skill 的搬运工 | 议会的召集人 |

Agent Skills CLI 是"包管理器"，Council 是"在这个包管理器之上的真实应用"。

### 4.4 护城河总结

按强度从弱到强：

1. **产品形态差异化** — 议会辩论的 UX 短期难复制
2. **对话高光识别算法** — 需要真实对话训练集，先发者占优
3. **生态兼容 + 上层抽象** — 不和既有玩家竞争，做它们的协同层
4. **用户数据复利** — Thinking Skill 高度私人化，迁移成本随时间指数增长
5. **Council 互联网络（长期）** — 未来的 Council 之间可以互相调用

---

## 五、Hackathon MVP

### 5.1 48 小时目标

只做一条完整链路，但要能演示。

**必须能演示的链路：**

粘贴对话 → `council capture` → 自动识别 3-5 个思考高光 → 蒸馏成 Thinking Skills → 导入 2 个花叔的 mentor skill（naval + jobs）→ `council convene "<新问题>"` → 屏幕上展示三方辩论 → `council export --mcp` → 在 Claude Desktop 里调用 → 成功

### 5.2 范围管理

**Must Have（必须做完）：**
- `council init`
- `council capture`（从文件或剪贴板）
- `council distill`（识别高光 + 生成 SKILL.md）
- `council convene`（至少支持 3 个 persona 辩论）
- `council export --mcp`（基础的 MCP Server）
- 预置 2-3 个从花叔生态抓下来的 mentor persona

**Should Have（有时间做）：**
- `council persona list / add`
- 终端里美观的议会辩论可视化（persona 头像 + 发言气泡）
- 辩论过程本身的自动捕获

**Won't Have（明确不做）：**
- Web 界面
- 账号系统
- Council 之间的互联
- 向量检索 / RAG
- 自己训练模型

### 5.3 两天开发计划

**Day 0（黑客松前）：**
- 搭好 Council CLI 的基础框架（init / capture）
- 用我和 AI 的真实对话（我们这几天聊的）预先蒸馏出 5 个 Self Persona 作为 demo 素材
- 从花叔生态抓 naval + jobs + munger 三个 mentor persona
- 写好 pitch 骨架

**Day 1（黑客松 Day 1）：**
- 上午：完成 distill 的思考高光识别 + SKILL.md 生成
- 下午：完成 convene 的多 persona 辩论引擎
- 晚上：完成 MCP Server 导出，跑通 Claude Desktop 集成

**Day 2（黑客松 Day 2）：**
- 上午：补充终端 UI，让 demo 更有视觉冲击
- 下午：准备 demo 脚本，排练 3 分钟 pitch
- 晚上：上台

### 5.4 Demo 脚本（3 分钟）

**0:00–0:20 · 问题**
> "每个使用 AI 的人都在重复一件蠢事：每次打开对话，都在重新解释自己是谁、在想什么。更蠢的是——你每一次高质量的思考，用完就消失了。"

**0:20–0:40 · 现有方案**
> "Second Me 想把你变成一个 AI 分身——但它处理的是你的事实和偏好，不是你做判断的方式。花叔蒸馏纳瓦尔、蒸馏乔布斯——但每次只能召唤一个人。ChatGPT Memory 存你喜欢短回答——但存不住你怎么推翻 AI 的那个瞬间。"

**0:40–1:00 · 我们的洞察**
> "真正稀缺的不是数字分身，是**一场会议**。一个重要决策需要多个声音——你自己、你蒸馏的智者、一个魔鬼代言人——同时在场，互相质疑。Council 就是做这件事的。"

**1:00–2:30 · 实时演示**
> 现场粘贴一段我和 AI 的真实对话（要不要离职做项目）
> `council capture` → 识别出"第一性原理"、"纳瓦尔杠杆观"、"对朋友反驳的处理"三个思考高光
> `council convene "我应该红药丸还是蓝药丸"`
> 屏幕上：Naval、Jobs、你自己的 first-principles persona 各自表态，互相质疑，给出综合判断 + 明确标出"仍存分歧"
> `council export --mcp` → 切到 Claude Desktop → 输入同一个问题 → Claude 自动调用 council → 返回议会结论

**2:30–3:00 · 愿景**
> "Council 兼容花叔、Second Me、AGENTS.md 所有生态。它不和它们竞争——它让它们可以一起开会。这是蒸馏之后的下一步：不是让 AI 变成你，是让 AI 协助你成为自己最好的那个版本。"

---

## 六、Why Me / Why Now

### 6.1 为什么我能做

- **AI Native 工程体系经验**：过去一年从零构建企业级 Monorepo + 24 条自定义 Skills + AGENTS.md 级别的 AI 治理体系，对 SKILL.md 格式和 MCP 协议有深度实战经验
- **Figma 语义化插件**：独立完成 2325 行 TypeScript + 三层语义管道的中间件级产品，证明我能从数据源头重新定义问题
- **真实的思考资产**：我自己就是第一个用户，手上有大量高质量对话可以作为 demo 素材和早期数据集

### 6.2 为什么是现在

- **2025-2026 是 Skill 协议标准化的临界点**：AGENTS.md / MCP / Claude Skills / Agent Skills 已经形成事实标准，Council 站在标准之上做应用层
- **蒸馏浪潮刚过峰值**：花叔证明了蒸馏的可行性，但所有玩家都停在"单 persona 静态 skill"这一层，协同辩论是空白
- **用户认知已经教育完成**：不需要再解释什么是 skill、什么是 persona、什么是 MCP，直接做新的

### 6.3 长期愿景

短期：每个程序员都应该有一个 `council`
中期：Council 之间可以互相调用，构成协作网络（"借调"一下你的 council 来参与我的议会）
长期：Council 是你留给世界的数字遗产——不是被动蒸馏的静态 skill，而是主动构建、持续进化的思考系统

---

## 七、License & Philosophy

**开源协议：** MIT

**设计哲学：**
1. **用户数据属于用户** —— 所有数据都是 `~/.council/` 下的 Markdown 文件，可以 Git 版本化、可以审计、可以迁移
2. **协议高于产品** —— Council 遵循 SKILL.md / MCP / AGENTS.md 标准，和任何兼容工具互操作
3. **分歧是价值** —— 议会不追求共识，不追求"最优解"，追求让用户看到更完整的判断空间
4. **简洁是纪律** —— 不做数据库、不做 Web UI、不训练模型。只做 CLI + Markdown + MCP，十年不过时

---

**Welcome to the real world. Convene your Council.**
