# Council · Hackathon Demo 脚本

> 3 分钟, 真实性优先: 现场 capture + distill, 不放录屏。

---

## Pre-flight (上台前 2 分钟做完)

```bash
# 1. 干净的 demo 环境
rm -rf /tmp/.council-demo
export COUNCIL_HOME=/tmp/.council-demo
alias council='bun run /path/to/councli/bin/council.ts'

# 2. 初始化 (只有 mentor + role, self 为空 — 这是关键)
council init

# 3. 准备好一段真实对话在剪贴板 (推荐: 你前一天的一个思考对话)
pbcopy < 自我的材料/Claude-用第一性原理重构饮食系统.md

# 4. 开大字体, 清屏, 准备
clear
```

---

## 0:00 – 0:20 · 钩子

直接念:

> "每个用 AI 的人, 每天都在重复一件蠢事: **每次打开对话, 都在重新解释自己是谁**。更蠢的是——你每一次高质量的思考, **用完就消失了**。今天我要让你们看一个 AI 从零开始学会我怎么思考。不是录屏, 现场来。"

---

## 0:20 – 0:50 · 现状 (Council 是空的)

```bash
council persona list
```

展示屏幕:

```
5 personas

mentor (3)
  mentors:naval     ...
  mentors:jobs      ...
  mentors:munger    ...

role (2)
  roles:devils-advocate
  roles:first-customer
```

口播:

> "现在 Council 只有我预置的 Naval、Jobs、Munger, 加两个场景角色。**self 目录是空的。AI 完全不知道我是谁。**"

---

## 0:50 – 1:40 · 现场捕获 + 蒸馏 (核心时刻)

```bash
council capture --clipboard
```

屏幕出现 `✓ Captured: 2026-04-23-xxx`。

```bash
council distill --auto
```

~15 秒后出现:

```
✔ 2026-04-23-xxx: 5 个高光
    • [problem-reframing] 从单餐问题到系统链条 (0.92)
    • [meta-insight] 识别出注意力是真正的稀缺资源 (0.88)
    • [decision-heuristic] 食物加工度的一句话判断法 (0.85)
    ...
✔ persona: self:trace-to-source (0.84)
✔ persona: self:attention-over-time (0.78)
...
```

立即打开一个新的 persona 文件念一段, **念出 "典型片段" 里的用户原话**:

```bash
cat ~/.council/personas/self/trace-to-source.md
```

口播:

> "看这句——'我觉得这样不好, 不利于长期发展'——这是**我上周散步时发的消息原话**, 不是 ChatGPT 的总结。P1 prompt 有一个硬拒绝清单, **用户点头同意 AI 的东西全部丢掉**, 只留用户自己反驳、重构、给出具体决策路径的部分。这就是蒸馏出的我的一个视角, persona ID 叫 `self:trace-to-source`。"

---

## 1:40 – 2:40 · Convene — 议会开会

```bash
council convene "我是否应该先做一个不完美的产品就推出去"
```

屏幕流式输出:

1. Summon 的 rationale (为什么选这几个)
2. 🔵 `self:trace-to-source` 先表态 — **是刚蒸馏出来的, 真实**
3. ✦ `mentors:jobs` — 用品味和减法视角质疑
4. ◇ `roles:devils-advocate` — 反驳
5. ◇ `roles:first-customer` — 用"谁现在就在等"拷问
6. Cross-examination: 互相点穿
7. Synthesis: 明确标出 "仍存分歧"

**停在 Synthesis 的 "仍存分歧" 那段**, 手指屏幕:

> "注意这里——议会**没有给我一个漂亮的'综上所述'**。它明确告诉我: Jobs 觉得我是在用 MVP 掩盖设计不足, first-customer 觉得我是在为想象中的用户优化。**保留分歧是 Council 的核心价值**——它提醒我这件事没那么简单, 而不是让我舒服。"

---

## 2:40 – 3:00 · MCP 出圈 + 愿景

```bash
council export --mcp
```

屏幕显示要粘贴到 `claude_desktop_config.json` 的片段。

> "一键导出 MCP Server。Claude Desktop、Cursor、任何 MCP 客户端, 都可以直接召开我的议会。"

切换到 Claude Desktop (如果演示机允许), 输入:

> 我还在纠结要不要全职做这个项目

Claude 自动调用 `council_convene`, 返回议会结论。

收尾, 字要慢:

> "Council 兼容花叔蒸馏生态、兼容 Second Me、兼容 AGENTS.md。它不和它们竞争——它让它们**一起开会**。蒸馏之后的下一步, 不是让 AI 变成你, 是让 AI 帮你**成为自己最好的那个版本**。"

---

## 兜底方案

| 风险 | 备案 |
|---|---|
| `capture` / `distill` 现场 API 超时 | 提前跑好一个 `/tmp/.council-backup/` 目录, 切过去继续 demo |
| `convene` 卡在 summon 或 statement | 预存 transcript, `cat ~/.council-backup/transcripts/xxx.md` 念一遍 |
| Claude Desktop MCP 连接失败 | 跳过 "出圈" 一节, 直接用 `council serve` + 另一个 tab 演示 stdio 交互 |
| 投影分辨率小 | 提前 `export PS1='$ '` 简化提示符; 字体调到 18pt 以上 |

---

## 演讲节奏

- 每一句重点 **停顿 1 秒** 让观众接收
- 所有命令 **不要解释细节**, 让屏幕自己说话
- "真实性" 那句话必须念出来 — 这是整个 demo 的支点
- 最后一句 "成为自己最好的那个版本" 要慢, 念完后停一秒再鞠躬

---

## 检查清单

- [ ] API Key 在 `.env` 里 (且不是过期的)
- [ ] Bun 在 PATH 里
- [ ] 剪贴板里有真实对话 (不是假数据)
- [ ] Claude Desktop 已打开 + MCP 配置已加
- [ ] 字体 ≥ 18pt
- [ ] 音频可能被录, 不要把 API Key 念出声
- [ ] 备份目录就位
- [ ] 手机静音
