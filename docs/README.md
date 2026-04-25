# Council · 文档导览

这个目录是 Council 的所有**演讲材料、设计稿、架构图**的归档。源码在仓库根目录, 这里全是"给人看"的东西。

---

## 📣 演讲 / Demo 材料

| 文件 | 用途 |
|---|---|
| [`pitch-3min.md`](pitch-3min.md) | 黑客松现场 **3 分钟讲稿** (计时段落 + 备用段 + Q&A 弹药) |
| [`pitch-lines.md`](pitch-lines.md) | **Demo 金句卡** — 每个 prompt 节点一句可上台直接念的话 (口袋卡) |
| [`demo-script.md`](demo-script.md) | 早期 demo 流脚本 (背景叙事版) |
| [`demo-runbook.md`](demo-runbook.md) | **上场前操作手册** — preflight、环境变量、剪贴板预备、剧本演练 |
| [`architecture/architecture.md`](architecture/architecture.md) | 完整产品架构思考文档 (384 行, 长篇说理) |

**上场前序列**:
1. 跑 `demo-runbook.md` 里的 preflight (验证全部 API 通)
2. 桌面留 `pitch-3min.md` 计时讲稿 + `pitch-lines.md` 金句卡
3. 浏览器预开两个 tab: `localhost:3737` web · 一个 Cursor 窗口准备演 MCP

---

## 🎨 UI 设计 (design)

Web 端布局的 SVG 草图. 直接浏览器或 Finder Quick Look 打开看. 按这两张直译就是 web 实现.

| 文件 | 状态 | 描述 |
|---|---|---|
| [`design/web-layout-resting.svg`](design/web-layout-resting.svg) | 默认态 | 资产 feed: 侧栏 5 图标 + 卡片流 + 底部输入框 |
| [`design/web-layout-convening.svg`](design/web-layout-convening.svg) | 议会态 | 可追溯 trace view + 折叠 phase + 右下 FAB |

配色硬约束 3 色: 黑曜石黑 `#0E0D0C` / 烛光金 `#E8B563` / 旧纸色 `#D8CFC4`.

---

## 🏗 系统架构 (architecture)

讲产品时用的图. 不是给开发者看 build 系统的 — 是给评委 / 投资人 / 朋友讲清楚 Council 在哪一层.

| 文件 | 描述 |
|---|---|
| [`architecture/architecture.md`](architecture/architecture.md) | **完整架构文档** — Why Council / 数据模型 / 三条链路细节 / 长期演进 |
| [`architecture/system.svg`](architecture/system.svg) | 系统总览: capture / distill / convene 三条链路 + CLI/MCP/Web 三种入口 |
| [`architecture/directory-tree.svg`](architecture/directory-tree.svg) | `~/.council/` 文件结构图 — 用户的认知资产长什么样 |
| [`architecture/prompt-chains.svg`](architecture/prompt-chains.svg) | 11 个 prompt (P1-P11) 的串联关系 — Council 的"思维流水线" |
| [`architecture/strategic-map.svg`](architecture/strategic-map.svg) | 战略地图: 在 PKM / Agent / Chatbot 的产品象限里 Council 的位置 |

---

## 📂 整体结构

```
docs/
├── README.md                              ← 你在这里
├── pitch-3min.md                          (现场讲稿)
├── pitch-lines.md                         (金句卡)
├── demo-script.md                         (背景叙事版 demo 脚本)
├── demo-runbook.md                        (上场操作手册 / preflight)
├── architecture/
│   ├── architecture.md                    (完整产品架构文档)
│   ├── system.svg
│   ├── directory-tree.svg
│   ├── prompt-chains.svg
│   └── strategic-map.svg
├── design/
│   ├── web-layout-resting.svg
│   └── web-layout-convening.svg
└── _archive/                              ← 历史 dev journal, 不上场用
    ├── BUILD_PLAN.md
    └── NIGHT-REPORT.md
```

仓库根目录现在只剩**用户必须看到**的: `README.md` · `LICENSE` · `package.json` · `bin/` · `dist/` · `src/` · `web/` · `seeds/` · `scripts/`. 其余全部进 `docs/`.

---

## 🔄 来源 (仅作记录)

- 演讲 / demo 材料: 本次会话整理 + 原 `相关材料/`
- `architecture/architecture.md` · 原根目录 `council-architecture.md`
- `demo-runbook.md` · 原根目录 `DEMO.md` (Demo 脚本 v2, 含 preflight)
- `_archive/*` · 早期 dev journal, git 历史保留, 不删但归档不显眼
- 旧 `相关材料/council-readme.md` README 草稿已删 (根 README.md 取代)
