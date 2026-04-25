# Contributing to Council

> 这一份给**想改代码 / 跑 live server / 修引擎**的人看。
> 普通使用者通过 `npm i -g @moyu-build/council` 即可, 不需要这一份.

---

## 为什么源码级要 Bun

引擎用了 TypeScript parameter properties 等语法, Node 不直接支持。但发布的 `dist/council.mjs` 是经 [tsdown](https://tsdown.dev) 打包后的纯 Node bundle —— 这就是 `npm install` 出去的版本只要 Node ≥ 20 就能跑的原因。

所以:
- **使用者** (装 npm 包用): Node ≥ 20, 不要 Bun
- **贡献者** (clone repo 改代码): Bun ≥ 1.1
- **`council live` 网页圆桌直播**: Bun (用了 `Bun.serve()` 做低延迟 SSE)

---

## 从源码起步

```bash
# 1. Bun (如果没有)
curl -fsSL https://bun.sh/install | bash

# 2. 依赖
git clone https://github.com/siyu-deng/council.git && cd council
bun install
(cd web && bun install)

# 3. API Key
echo 'ANTHROPIC_API_KEY=sk-ant-...' > .env

# 4. 初始化沙箱 (避免污染你真实的 ~/.council/)
COUNCIL_HOME=/tmp/.council-dev bun run bin/council.ts init

# 5. (可选) demo 前预检
bun preflight              # 全绿 = 可以上场
```

---

## 开发工作流

### 后端 + 前端同时跑

```bash
bun run bin/council.ts live                # 后端 HTTP/WS on :3737
# 在另一个 terminal:
cd web && bun run dev                      # Vite dev server on :5173, 代理到 3737
```

### 沙箱测试

```bash
COUNCIL_HOME=/tmp/.council-test bun run bin/council.ts init
COUNCIL_HOME=/tmp/.council-test bun run bin/council.ts convene "..."
```

### Mock 模式 (不调真实 API)

```bash
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

## 构建发布版

```bash
bun run build              # tsdown 打包 → dist/council.mjs (单文件 Node bundle)
node dist/council.mjs --version    # 验证 dist 在纯 Node 下能跑

# 发布前完整预检
npm run prepublishOnly     # = build + version check

# 发布
npm publish --access public --otp=<otp>
```

---

## 代码结构速查

```
src/
├── core/           skill-md / paths / config / claude SDK 封装
├── prompts/        P1 ~ P11 蒸馏 / 议会用的 prompt 文件
├── engine/         convene / distill / event bus 核心引擎
├── commands/       每个 CLI 命令一个文件 (init / capture / convene ...)
├── server/live.ts  Bun.serve() 实现的网页 live server
└── mcp/server.ts   MCP stdio server (13 tools + 3 prompts)

web/                Vite + React + Tailwind 前端
seeds/              首次 init 拷贝过去的 mentor / role persona 模板
docs/               所有演讲 / 设计 / 架构文档
```

---

## 提交规范

- Commit message 用中英混合, 按 conventional commits 风格 (`feat: ...` / `fix: ...` / `docs: ...` / `chore: ...`)
- PR 描述要说: 什么问题 / 怎么修 / 怎么验证
- 用户可见行为变化必须更新 README

---

更多: 看 [`docs/architecture/architecture.md`](docs/architecture/architecture.md) 完整产品架构 + [`docs/README.md`](docs/README.md) 其它文档.
