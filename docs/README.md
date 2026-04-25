# Council · 文档导览

这个目录是 Council 的所有**演讲材料、设计稿、架构图**的归档。源码在仓库根目录, 这里全是"给人看"的东西。

---

## 📣 演讲材料 (pitch)

| 文件 | 用途 | 长度 |
|---|---|---|
| [`pitch-3min.md`](pitch-3min.md) | 黑客松现场 3 分钟讲稿 (计时段落 + 备用段 + Q&A 弹药) | 180s |
| [`pitch-lines.md`](pitch-lines.md) | Demo 金句卡 — 每个 prompt 节点一句可上台直接念的话 | 速查 |
| [`demo-script.md`](demo-script.md) | 完整 demo 脚本, 含每帧讲解 + 备选路径 | 3 min |

**用法建议**: 上场前打开 `pitch-3min.md`, 桌面留 `pitch-lines.md` 当口袋卡。

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
| [`architecture/system.svg`](architecture/system.svg) | 系统总览: capture / distill / convene 三条链路 + CLI/MCP/Web 三种入口 |
| [`architecture/directory-tree.svg`](architecture/directory-tree.svg) | `~/.council/` 文件结构图 — 用户的认知资产长什么样 |
| [`architecture/prompt-chains.svg`](architecture/prompt-chains.svg) | 11 个 prompt (P1-P11) 的串联关系 — Council 的"思维流水线" |
| [`architecture/strategic-map.svg`](architecture/strategic-map.svg) | 战略地图: 在 PKM / Agent / Chatbot 的产品象限里 Council 的位置 |

---

## 📂 整体结构

```
docs/
├── README.md                              ← 你在这里
├── pitch-3min.md
├── pitch-lines.md
├── demo-script.md
├── architecture/
│   ├── system.svg
│   ├── directory-tree.svg
│   ├── prompt-chains.svg
│   └── strategic-map.svg
└── design/
    ├── web-layout-resting.svg
    └── web-layout-convening.svg
```

---

## 🔄 来源说明

- `pitch-3min.md` · 本次会话生成 (2026-04-25 晚上)
- `pitch-lines.md` · 原 `相关材料/council_pitch_lines.md`
- `demo-script.md` · 原 `相关材料/council-demo-script.md`
- `design/web-layout-*.svg` · 本次会话生成
- `architecture/*.svg` · 早期设计期生成 (从 `相关材料/` 整理过来)

旧的 `相关材料/council-readme.md` README 草稿已删 (本仓库 README.md 取代). git 历史可恢复.
