# Council 路演 Demo 操作手册

> **场景**: EvoTavern 现场路演 (报告厅)
> **时间**: 14:00 上场 · 13:30 开始 pre-flight · 13:55 进场就位
> **目标**: demo 命脉的安全网 — 网络一抖, 按这里走.

---

# ⏰ 13:30 - 13:55 · Pre-flight (25 分钟)

每一项做完打勾. 任意一项 ✗ 都不要上场跑 live demo, 切到"无 demo 路径".

## Step 1 — 桌面环境清理 (3 min)

```bash
[ ] 关掉所有不相关 app (微信 / Discord / Slack / 邮箱通知)
[ ] 浏览器只留 2 个 tab: localhost:3737, Cursor 网页 (如果用)
[ ] 终端只留 1 个窗口, 字体调到 16pt+
[ ] 屏幕亮度调到 100%
[ ] 系统通知关闭 / 勿扰开启
[ ] 关掉自动锁屏
```

## Step 2 — API key + Council 状态 (5 min)

```bash
echo $ANTHROPIC_API_KEY                    # ✓ 应有 sk-ant- 开头的值
council --version                          # ✓ 应返回 0.1.1
council persona list | head -5             # ✓ 应看到 4 个 self + mentor + role
council session list | head -3             # ✓ 应看到 6+ 段 session
ls ~/.council/transcripts/ | wc -l         # ✓ 应 ≥ 6 (历史议会 fallback 用)
```

## Step 3 — Live server 起来 (2 min)

```bash
[ ] council live  &                         # 后台跑, 起在 :3737
[ ] curl -s http://localhost:3737/api/health  # ✓ 应返回 ok
[ ] 浏览器打开 http://localhost:3737
[ ] 资产 feed 应显示 (历史 sessions / personas / transcripts)
[ ] 右上角连接状态: ✓ "已连通" (不是 "离线")
```

## Step 4 — 预跑议会 (5 min, ⭐ 关键)

**目的**: 留一个 fallback URL. 万一现场议会卡, 直接打开这个 URL 看 trace.

```bash
[ ] 在 web 输入框打: "我应该把当前 4 个 self persona 合并成 2 个吗?"
[ ] ⌘+Enter 召集
[ ] 验证时间:
    - ≤ 30 秒: 三个 statement 全出
    - ≤ 60 秒: cross-exam 出现 (Jobs 反驳 reframe 那段)
    - ≤ 120 秒: synthesis 完成
[ ] 看上方 URL bar, 记下 ?run_id=<...>
    例如: http://localhost:3737/?run_id=2026-04-26-...
[ ] 把这个 URL 收藏 / 复制到便签 → 这是 fallback (备用)
```

## Step 5 — Cursor MCP 验证 (5 min)

```bash
[ ] 打开 Cursor (不是网页, 是 app)
[ ] 新建对话窗口
[ ] 输入: /as_me
[ ] 应触发 council_who_am_i, 返回 4 个 self persona 的回显
[ ] 如果 Cursor MCP 没启用, 检查 ~/.cursor/mcp.json 里 council 条目
```

## Step 6 — 上场材料就位 (5 min)

```bash
[ ] PDF 用 Preview 打开 council-pitch.pdf, 进入全屏 (⌘+F)
[ ] 第 1 页 (cover) 在最上层
[ ] 切换 PPT 用键盘 ← → (不要用鼠标, 容易抖)
[ ] iPhone / 第二屏放 docs/pitch.md (讲稿) 滚到顶部
[ ] 桌面 Finder 备好 docs/pitch-lines.md (口袋金句, 临时翻看)
```

---

# 🎬 14:00 - 14:06 · 上场流 (6 分钟)

## 全程时间地图

```
0:00 ─────── 0:45 ─── 1:30 ─────────────── 4:00 ─── 4:30 ─── 5:00 ─── 5:30 ─── 6:00
   Hook       Pose         Demo (核心)        总结    反预期    协同    Close
   Slide 1   Slide 2       Live web           Slide 3 (无)     Slide 5  回 Slide 1
                                              ↑ 安全切回 Slide 3+4 路径
```

## 0:00-0:45 · Hook

**屏幕**: PPT Slide 1 (cover) — 一直在.

**站姿**: 中央, 不开终端, 看观众.

**核心动作**: 把"AI 自我进化 vs 人没曲线"这个反差扎下去.

**关键句** (重读):
> "AI 在加速自我进化. **人这一条曲线, 没人替你画.**"

---

## 0:45-1:30 · Pose · 锚句登场

**屏幕**: 切 PPT Slide 2 (vs Competitors).

**核心动作**: 主语反转的一句话定位 + 4 友商列举.

**关键句** (重读, 中间停 1 秒):
> "Evolver 让 Agent 自我进化. *(停 1 秒)* **Council 让人, 自我进化.**"

(**"人"必须重读**)

---

## 1:30-4:00 · Demo (核心 2.5 分钟)

**屏幕**: 切到浏览器 `localhost:3737`.

> ⚠️ **如果 web 没加载 / 卡住**: 立刻切回 PPT Slide 3 (Three Pipelines), 按"无 demo 路径"讲. 见下面 Failure Recovery.

### Demo Step A (1:30-1:45) · 资产 feed

**点击操作**: 不点, 让 feed 露 5-10 秒.

**说**:
> "这是我捕获的 5 段我自己的真实对话. Council 从里面蒸馏出了 4 个 self persona — **不是我写的, 是它从我说过的话里反向推出来的**."

### Demo Step B (1:45-2:10) · 点开 self persona

**点击操作**: 点 `self:reframe-before-execute` → 滚到"典型片段"段落.

**说**:
> "比如这个 — 它知道我会在执行前先质疑假设. confidence 0.95, 来源是 9 条原话.
>
> *(指典型片段)*
>
> 看, 都是我**原话逐字**引用. 这是 Council 的**真实性守门员** — 找不到逐字证据, 系统就不写."

### Demo Step C (2:10-2:40) · 召集议会

**点击操作**: 回 feed → 底部输入框打字 → ⌘+Enter.

**输入文本**: `我应该把当前 4 个 self persona 合并成 2 个吗?`

**说**:
> "现在我问它一个真问题 —
>
> *(打字)*
>
> ⌘ 召集.
>
> *(圆桌升起 → mini roundtable)*
>
> 三个 persona 自动被选了. 召集理由写得清清楚楚."

> ⚠️ **如果议会卡 30 秒+**: 立刻打开预跑那个 `?run_id=...` URL, 直接看 trace. 评委看不出区别.

### Demo Step D (2:40-3:30) · Cross-exam (灵魂帧)

**点击操作**: 等流式跑完 → 滚到 cross-exam 段.

**说**:
> "三个 persona 同时独立表态. 但议会的灵魂在这里 —
>
> *(滚到 cross-exam 卡片)*
>
> **不是三个 AI 同时回答你, 是他们互相挑战.**
>
> 看 — Jobs 在反驳我自己: *'你都在假设 MCP 的价值是证明架构 — 这是创始人自我欺骗.'*
>
> 谁挑战了谁, 写得清清楚楚.
>
> 这种锋利, **不会出现在任何单 AI 对话里**. 因为单 AI 永远在'同意你 + 给建议'的模式里."

### Demo Step E (3:30-3:50) · Synthesis

**点击操作**: 滚到底部 synthesis 卡.

**说**:
> "最后, 综合卡片: 共识 / 仍存分歧 / 如果今天必须决定 / 本次议会暴露的新思考模式.
>
> Council **不会给你标准答案. 它给你结构化的分歧.**
>
> *一个永远同意你的议会, 是你不需要的议会.*"

### Demo Step F (3:50-4:00) · Cursor MCP (杀手帧)

**点击操作**: 切到 Cursor app → 输入 `/as_me`.

**说**:
> "最后一帧 —
>
> *(切到 Cursor)*
>
> 同一个 self persona, 在 Cursor 里召唤. 在 Claude Desktop 也能召唤. 在 Cherry Studio 也能.
>
> **我的认知身份, 跨所有 LLM**. 这是 MCP 给的可移植性, 别的'个人 AI'做不到."

> ⚠️ **如果 Cursor 卡**: 别等. 直接说 "这是 MCP 协议的承诺, 任何 MCP 客户端都能调", 跳过.

---

## 4:00-4:30 · 链路总结

**屏幕**: 切 PPT Slide 3 (Three Pipelines).

**说**:
> "刚才你看到的, 是 Council 的三条链路 —
> Capture & Distill — 把对话蒸馏成会说话的人格.
> Convene — 多视角议会, 互相挑战, 综合决策.
> Refine & Evolve — 用得越多越懂你, 反馈影响下次召集.
>
> 11 个 prompt, 完整可追溯. 每条洞见都能溯源到原对话原话."

---

## 4:30-5:00 · 反预期 · PKM 时间方向

**屏幕**: 不切 (留在 Slide 3).

**说**:
> "你可能在想 — 这听起来像 Notion AI / Obsidian.
>
> 但 PKM 让你**存得越多越好** — 它解决'我以前想过什么'.
> Council 让你**忘得越合理越好** — 它解决'我此刻该怎么决定'.
>
> *(用手画 ← →)*
>
> 时间方向反了. PKM 是回望, Council 是前瞻."

---

## 5:00-5:30 · 战略协同

**屏幕**: 切 PPT Slide 5 (Strategic Map).

**说**:
> "*(指地图)* 这是我对自己位置的看法.
>
> 主流玩家在这个象限 — 主语是 AI / Agent.
> Council 在另一个象限 — 主语是人.
>
> 但更重要的是 — Council **不和他们竞争**.
>
> 我**消费**他们的组件:
> - 花叔蒸馏的每一个人物 = 我议会里的一把椅子
> - Second Me 的模型 = 我的 self persona 槽
> - Hermes / Evolver 的 skill = 我的能力模块
>
> Council 让整个生态变得更有用. 这不是竞争位置, 是**协同位置**."

---

## 5:30-6:00 · Close · 长期愿景

**屏幕**: 切回 PPT Slide 1 (Cover).

**站姿**: 离开屏幕, 中央, 看观众.

**说**:
> "今天所有人都在做 Agent 的自我进化.
>
> 我赌另一边 — **人的自我进化, 也需要一份协议.**
>
> *(停一拍)*
>
> 短期看, Council 是一个 npm 包 + 一个 MCP server. **已经发布. 现在打开终端就能装.**
>
> 中期看, 它是每个认真做决策的人, 个人语境里的认知进化协议.
>
> 长期看 — 当每个人都有自己的 Council, **议会之间可以互相借调**.
>
> 我的议会可以请教你的议会. 那时候, 我们讨论的就不是 AI 网络, 是**思考网络**.
>
> *(停 2 秒)*
>
> 今天我只做了第一步.
>
> **Council. Your thinking, round-tabled.**
>
> 谢谢."

*(掌声起 → 鞠躬 → 走下台)*

---

# 🆘 Failure Recovery 速查

| 场景 | 立刻动作 | 怎么说 |
|---|---|---|
| **Web 加载失败** | 切 PPT Slide 3 | "我换 slide 讲架构, 同样能讲清楚" |
| **议会卡 30 秒+** | 打开预跑 `?run_id=...` URL | (不解释, 自然滚到 trace) |
| **Cursor 卡** | 跳过 Demo Step F | "这是 MCP 的承诺, 任何客户端都能调" |
| **API 限流 (429)** | 切预跑 run_id URL | (同上, 不解释) |
| **网络全断** | 切 PPT 全程 | "今天我把现场 demo 换成了图讲版, 更克制. Council 的本质..." |
| **PPT 翻不动** | 用键盘 ← → 而不是鼠标 | (静默, 操作即可) |
| **时间快超** | 砍 4:30 反预期段 | (直接到 5:00 战略) |
| **时间太富** | 加可选段 | "我多讲一点真实性守门员的设计..." |

---

# 💬 Q&A 弹药 (评委 30 秒回答)

| 问题 | 锚点 (1 句话) | 详细 (10 秒) |
|---|---|---|
| 和 Notion AI / GPT 自定义指令 区别? | **silo vs 跨 LLM** | 它们 lock-in 到一个客户端, Council 通过 MCP 在所有 LLM 客户端共享 |
| self persona 怎么不会被 LLM 灌输? | **真实性守门员** | P1 prompt 强制 user_quote 字段必须能在原对话找到逐字证据, 找不到不写入 |
| 数据存哪? 安全吗? | **你的资产你做主** | `~/.council/` 本地 markdown, git init 都行, 没有云依赖, 没有数据库 |
| 怎么商业化? | **协议层 + 生态** | 不靠卖工具, 靠成为 AI Native 时代的认知身份层标准 (类比 OAuth 在 web 时代) |
| 4 个 type 够用吗? | **MVP 脚手架** | 当前是默认, 长期会开放为用户可配置, 已识别但不在今天 scope |
| 和花叔 nuwa-skill 是不是竞品? | **协同, 不竞争** | 花叔的人物 skill 直接作为我的 mentor persona, 我消费他的组件 |
| Hermes/Second Me/Evolver 都是 AI 进化, 你这个区分会不会太抽象? | **三个具体证据** | (1) cross-exam 字面是 adversarial 不是 echo; (2) MCP 跨 LLM 是技术真实, 不是隐喻; (3) 真实性守门员强制原话引用 |
| 你一个人 4 天怎么做到的? | **Council 自己帮我做的** | 我用 Council 蒸馏自己过往思考, 形成 4 个 self persona, 每次决策都召开议会 (这是 dogfood 故事) |

---

# 📋 13:55 进场前最后 3 件事 check

```
[ ] PDF 全屏在 Slide 1
[ ] 浏览器 localhost:3737 资产 feed 加载好
[ ] Cursor 窗口已打开, /as_me 已预试过一次
[ ] 屏幕亮度 100%
[ ] 通知关闭
[ ] 心率 < 100 (深呼吸 3 次)
[ ] 微笑

Go.
```
