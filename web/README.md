# Council · Web

单页 React 前端，用于把 Council CLI 的议会辩论实时可视化成一张圆桌。

## 开发

```bash
cd web
bun install
bun run dev
```

Dev server 跑在 http://localhost:5173 。 `/api` 和 `/ws` 会代理到 `http://localhost:3737`（Bun 后端）。

### Mock 模式

如果后端还没启动，用 `?mock=1` 跑一次完整的 fixtures：

```
http://localhost:5173/?mock=1
```

也可以用 `?q=` 预填议题：

```
http://localhost:5173/?q=我应该全职做AI吗
```

## 构建

```bash
bun run build
```

产物在 `dist/`，Bun 后端会把它作为 static assets serve 在 `http://localhost:3737/`。

## 目录

```
src/
├── App.tsx                    # 顶层路由 & WS 接入
├── main.tsx
├── components/
│   ├── RoundTable.tsx         # 圆桌布局 + 争论连线
│   ├── PersonaSeat.tsx        # 单个 persona 的座椅
│   ├── CenterStage.tsx        # 中心舞台（问题 / 决议卡片）
│   ├── ChunkBubble.tsx        # synthesis 流式 bubble
│   └── ui/                    # shadcn 风格基础组件
├── lib/
│   ├── types.ts               # CouncilEvent schema
│   ├── store.ts               # Zustand store
│   ├── ws.ts                  # WebSocket 客户端 + convene 启动
│   └── fixtures.ts            # Mock 事件流
└── styles/globals.css         # Tailwind + 烛光调色板
```

## 视觉语言

- 深黑底 (#0E0D0C) + 暖琥珀辅色 (#E8B563)
- Cormorant Garamond（衬线）用于议题和决议
- 用户是议长，坐在屏幕底部，personas 围坐上半圆
- 陈述阶段：发言者座椅发光
- 交锋阶段：发言者之间出现带标签的虚线箭头
- 综合阶段：一张羊皮纸感的决议卡片从中心缓缓浮现

## 约束

- Tailwind + CSS custom properties，不用 icon library
- Zustand 做状态（不用 Redux）
- TypeScript strict
- 所有用户可见文本用中文，代码注释用英文

## Events

前端消费的事件 schema 对齐 `src/engine/events.ts` 的 `CouncilEvent`。
WS server 应该：
- 连接时重放该 run 的历史事件（按顺序）
- 新事件到达时 broadcast

消息体可以是单个事件对象，也可以是事件数组（回放时批量发送）。
