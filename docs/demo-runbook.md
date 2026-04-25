# Council · Hackathon Demo 脚本 v2

> **核心信息** (反复回到这里): **Hermes 让 AI 更像你。Council 让你更像你。**
>
> 每段结束前, 脑子里默念这句 — 没在强化这个判断就删掉。

**时长**: 3 分钟 · **上台形式**: 一块大屏, 一个浏览器, 一个终端 (小窗口放最下角)

---

## Pre-flight (上台前 5 分钟做完)

```bash
# 1. 一键预检 (会跑真实 API, 约 2 分钟, 全绿即可)
cd ~/path/to/councli
bun preflight                    # 全绿 = 可以上场

# 2. 干净的 demo 环境
rm -rf /tmp/.council-demo
export COUNCIL_HOME=/tmp/.council-demo
alias council='bun run ~/path/to/councli/bin/council.ts'

# 3. 初始化 + 预先 distill 好你自己的 self persona (让议会有"你自己的声音")
council init
cat 自我的材料/Claude-用第一性原理重构饮食系统.md | council capture
council distill --auto
# 现在 ~/.council-demo/personas/self/ 里有 3-4 个你自己的 persona

# 4. 准备一段真实对话在剪贴板 (后面给 demo 闪粘贴用)
pbcopy < 自我的材料/Claude-探索号.md
# 或者准备一段短的也行, 关键是真实

# 5. 预热浏览器 (避免冷启动卡)
open "http://localhost:3737/?mock=1"
# 看一眼 mock 议会是否显示正常, 关掉标签页

# 6. 全屏终端, 18pt 以上字体, 干净桌面
```

---

## 0:00 – 0:25 · 钩子 (质疑整个赛道)

**站姿**: 空手站在台上, 不开终端, 看观众。

**台词** (慢):

> "今天这场, 六个人里有四个在做'会成长的 AI 助手'。
>
> 我想先问一个更锋利的问题——
>
> 在 AI 越来越聪明的时代, **真正会被淘汰的, 不是不用 AI 的人, 是思考方式从来没被自己审视过的人**。
>
> 那些人每天用 AI, 但他们的思考路径、他们的判断框架、他们面对一个模糊问题怎么从零拆到清晰——
>
> **没有一个产品在认真收集这些东西。**
>
> Hermes 让 AI 记住你。Evolver 让 AI 自我进化。Second Me 训练你的分身。
>
> 我做的 Council, 问了另一个问题: **我们不需要更聪明的 AI, 我们需要的是让自己的思考变得结构化的工具。**"

**目的**: 从"又一个 AI Agent"的听觉疲劳里把评委拽出来。

---

## 0:25 – 0:50 · Council 是什么 (一句话)

**动作**: 走到屏幕前, 一键打开浏览器:

```bash
council convene "我应该先做一个不完美的产品推出去吗" --watch
```

浏览器自动弹出圆桌, 空无一人, 中央是你的问题。
终端默默在角落打印日志 (观众不需要看)。

**台词** (念完一行停一秒):

> "Council。一个思考议会。
>
> **Hermes 让 AI 更像你。Council 让你更像你。**
>
> 三件事:
> 第一, **捕获**你和 AI 每一次有价值的思考 —— 不是你说过什么, 是你怎么想问题。
> 第二, **蒸馏**这些思考, 变成你可以召集的 persona。
> 第三, 当你下次面对一个难决策, **召开你的议会** —— 你蒸馏的纳瓦尔、乔布斯、你自己的第一性原理, 一起辩论, 你做最终决策。"

**关键**: 这时候浏览器圆桌上开始有东西了 — summon 已经在后台跑, 3 把椅子 "材料化" 出来, 每个 persona 图腾(🧘 naval / 💎 jobs / 🎭 devil's advocate)慢慢亮起。

---

## 0:50 – 2:15 · 现场演示 (85 秒, demo 命脉)

**不要解释, 让屏幕自己说话。**

### 0:50 – 1:25 · 议会开场 (Statements + Cross-Exam)

浏览器上:
- 三把椅子同时发光 — **statements 并行** (这是后端的能力, 观众会觉得"他们三个在同时想")
- 每个 persona 说完, 椅背上展开一段话
- Cross-exam 阶段, 椅子之间画出虚线箭头, 带一个小标签 ("jobs ⇆ naval: 你在回避规模问题")

**一句旁白** (指着屏幕):

> "注意这里 — 他们不是轮流发言, 是**同时在想**。然后他们互相指出对方的盲点。
>
> 这是 Hermes 单 agent 架构做不到的 — 你得有多个视角, 才能有真实的分歧。"

### 1:25 – 1:55 · Synthesis — "决议卡"现身 (这 30 秒是全场的峰值)

中央浮现一张羊皮纸质感的"决议卡", 四段:

```
共识
  • 完美不是决策标准
  • 核心价值主张的清晰度才是
  • ...

仍存分歧 ⇄
  jobs ⇆ self:...  (清晰度是前置还是推出的结果)

如果今天必须决定
  推出去, 但设一个明确的失败阈值...
  (这段就是"建议", 直接、有偏见, 不和稀泥)

本次议会暴露出的新思考模式
  "前置条件陷阱" — 你用 X 来论证为什么不做 X...
```

**停在 "仍存分歧" 那段**, 手指屏幕, 停 2 秒:

> "注意 — 议会**没有给我一个标准答案**。它告诉我这里仍有分歧。
>
> 一个永远同意你的议会, 是一个你不需要的议会。**分歧本身才是产出**。"

这是本场的最高光时刻。**念完停一秒。**

### 1:55 – 2:15 · MCP 出圈 (Council 可携带)

**动作**: 回到终端:

```bash
council export --mcp
```

终端显示:
```
✓ MCP server generated.
  add to ~/Library/Application Support/Claude/claude_desktop_config.json
```

**切到 Claude Desktop** (已提前打开, MCP 已配好), 新对话:

> 用户: 我应该全职做 Council 吗?

Claude 自动调用 `council_convene` tool, 等 30 秒, 返回一张结构化的议会结论。

**一句旁白**:

> "现在 Claude 在任何对话里, 都能召开我的议会。我的思考, 跟着我跨工具走。**我的议会也可以装进 Mac 原生 App 里** — 这是独立打包的桌面版" (手指 Dock 上的 Council.app 图标)。

---

## 2:15 – 2:40 · 战略地图 (25 秒钉进评委脑子)

**动作**: 切到那张 SVG 战略地图 (`相关材料/council_strategic_map.svg`)。

**台词**:

> "我的位置。
>
> 主流玩家 — Hermes、Evolver、Second Me, **主语都是 AI**。
>
> 协议层 — 花叔的 nuwa-skill、Agent Skills CLI、AGENTS.md, 他们**做组件**。
>
> Council 在这里 — **主语是人**。我不做组件, 不和主流玩家竞争。
>
> 我消费他们的组件, 补他们世界观的空白。**花叔蒸馏的每一个人物, 都是我议会里的一把椅子**。Second Me 训练出的模型, 可以作为我的 self persona。
>
> Council 让整个生态变得更有用。这不是竞争位置, 是协同位置。"

---

## 2:40 – 3:00 · 收尾 (慢, 20 秒)

**动作**: 关屏幕, 回到空手站姿。

**台词**:

> "今年所有人都在做'更聪明的 AI'。
>
> 我赌另一边 — **人的思考本身, 是值得被基础设施化的资产**。
>
> 短期, Council 是一个开发者的 CLI 工具。
>
> 中期, 它是每个认真做决策的人, 都应该有的东西。
>
> 长期 — 当每个人都有自己的 Council, Council 之间可以互相借调。
>
> **我的议会可以请教你的议会**。那时候, 我们讨论的就不是 AI 网络, 是思考网络。
>
> 今天我只做了第一步。
>
> 谢谢。"

---

## 最危险的三个点 (及兜底)

| 风险 | 兜底 |
|---|---|
| **Synthesis API 卡壳** (最危险, 30 秒不出结果) | 提前 convene 一次产出 transcript, 演示前 `council convene "<问题>" --watch` 配合 `?run_id=<已有 id>` 触发 replay, 事件流从文件重放而不重新调 API |
| Claude Desktop MCP 连接失败 | 跳过"出圈"一节, 转到 Council.app 双击展示 |
| 浏览器没自动弹出 / LAN IP 冲突 | 手动 `open http://127.0.0.1:3737/`, 或用事先准备的二维码截图 |
| API rate limit | 备用 `COUNCIL_MOCK=1 council convene ... --watch` — mock 流量走相同事件总线, 视觉完全一致 |

---

## 三件要反复排练到条件反射的事

1. **锚句** — "Hermes 让 AI 更像你, Council 让你更像你" — 必须张口就来, 不念稿
2. **指"仍存分歧"那个动作** — 这是整场 demo 最重要的一个手势
3. **最后一句慢** — "成为思考网络" 念完停 1 秒再鞠躬

---

## 检查清单

- [ ] `.env` 有合法 `ANTHROPIC_API_KEY`
- [ ] `bun preflight` 全绿 (真实 API)
- [ ] `~/.council-demo/personas/self/` 至少 3 个文件 (提前 distill 过)
- [ ] 剪贴板有真实对话 (不是假数据)
- [ ] Claude Desktop 已打开 + MCP 配置已加
- [ ] Council.app 已 build 放 Dock (可选)
- [ ] 字体 ≥ 18pt
- [ ] 终端放右下角小窗, 浏览器铺满
- [ ] 备份 transcript 在 `~/.council-backup/transcripts/` 就位
- [ ] 音频可能被录, API Key 不要读出来
- [ ] 手机静音
- [ ] 战略地图 SVG 打开过, 确认能放大
- [ ] 锚句默念 3 遍
