# Changelog

记录每个 minor 版本的实质变化. 格式参考 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/), 版本号遵循 [Semantic Versioning](https://semver.org/lang/zh-CN/).

---

## [0.4.1] — 2026-04-28

### 🐛 Bug Fix — Backend 选路反转 (sampling-first)

v0.4.0 设计的"BYOK 优先"是个错误的默认值. 实际场景里:

- 用户的 `ANTHROPIC_API_KEY` 经常是**从全局环境变量泄露**到 MCP 进程的, 不是用户主动想给 Council 用的算力来源
- 用户在 Claude Desktop / Claude Code 已经付订阅, 真实意图是"用宿主 LLM, 不消耗我的 API 钱"
- v0.4.0 检测到 env 里有 Key 字符串就走 BYOK, 即使 Key 已被禁用 — 用户面对的是 401 错误而不是优雅 fallback

**新优先级 (反转)**:

```
1. 客户端支持 sampling → SamplingBackend (默认意图: 借宿主 LLM)
2. 客户端不支持 sampling 但有 ANTHROPIC_API_KEY → AnthropicBackend 兜底
   (Cursor 等不支持 sampling 协议的客户端走这条路径)
3. 都没有 → 报错 + 提示
```

**Override**: 设 `COUNCIL_PREFER_BYOK=1` 强制 BYOK (高级用户想要流式 + 不弹窗)

### 📊 客户端 Sampling 兼容性 (基于实测校正)

| 客户端 | Sampling | 修订后默认行为 |
|--------|---------|---------------|
| Claude Code | ✅ | 走 sampling, 借订阅 |
| Claude Desktop | ✅ | 走 sampling, 借订阅 |
| **Cursor** | ❌ **实测不支持** | 必须 BYOK |
| Cherry Studio / 其他 | ❓ 未实测 | 必须 BYOK |

v0.4.0 文档里 Cursor 标"部分支持"是错的——实测**不支持**.

---

## [0.4.0] — 2026-04-27

### ✨ 新增 — MCP Sampling 模式 (零配置使用)

用户在 **Claude Code / Claude Desktop / Cursor** 等支持 MCP Sampling 的客户端里调用 Council 时, **不再需要配置 `ANTHROPIC_API_KEY`**. Council 会自动通过 MCP 协议的 `sampling/createMessage` 反向请求宿主客户端跑 LLM, 用户已付的订阅就是 Council 的算力来源.

```bash
# v0.4 起, 接入 Claude Code 一行就够 (不需要 -e ANTHROPIC_API_KEY=...)
claude mcp add council -- npx -y @moyu-build/council@latest serve
```

#### Backend 选路矩阵 (运行时自动判定)

| 场景 | 自动选择 | 行为 |
|------|---------|------|
| 有 `ANTHROPIC_API_KEY` (任何场景) | **BYOK** (Anthropic API) | 流式, 不弹窗, 用你的 API 账单 |
| 无 Key + 客户端声明 sampling capability | **MCP Sampling** | 借宿主 LLM, 客户端订阅付费 |
| 无 Key + 客户端不支持 sampling | 警告 + BYOK 兜底 | 调 LLM 时报 `ApiKeyMissingError` |
| `COUNCIL_MOCK=1` | **Mock** | 永远走打桩, 不被 resolver 干扰 |
| CLI 模式 / `council live` | **BYOK** (强制) | 没"宿主"可借, 必须 Key |

#### Sampling 模式的硬约束 (不是 bug, 是协议)

- **不流式**: `sampling/createMessage` 是一次性 request/response, 议会会失去逐字现场感. 想要流式必须走 BYOK.
- **可能弹 approve**: Claude Desktop / Code 可能让用户批准每次调用. 一些客户端有 "Approve always for this server" 选项可以一次性免除.
- **JSON 输出走 prompt-engineering**: 协议虽然支持 sampling-with-tools, 但客户端实现不一. SamplingBackend 改用在 systemPrompt 里嵌入 schema 让 LLM 输出 raw JSON 再解析, 兼容性最大.

### ✨ 新增 — `council doctor` 命令

```bash
council doctor
```

一次性体检以下 6 项, 红的修, 黄的看, 绿的不管:

1. `~/.council` 是否初始化
2. `identity.md` 是否手写过 (还是模板)
3. Persona 库构成 (self / mentor / role 各几个)
4. `ANTHROPIC_API_KEY` 是否配
5. **LLM 连通性** (跑一个 10-token 的最小 ping, ~1 秒, 验证 Key 真能用)
6. 数据资产规模 (sessions / skills / transcripts)

跟 `brew doctor` 一脉相承——不堆参数, 一眼看清"我能不能用".

### 🏗 架构 — LLMBackend 抽象层

`src/core/claude.ts` 从直调 Anthropic SDK 改成路由层. 三个公开函数 (`callText` / `callJSON` / `streamText`) **签名不变**, 11 个 prompt 文件 + commands 完全不感知改造.

新增 4 个 backend:
- `AnthropicBackend` — BYOK, 历来逻辑搬出来
- `SamplingBackend` — 走 MCP `sampling/createMessage`
- `MockBackend` — `COUNCIL_MOCK=1` 用
- `llm-backend.ts` — interface + `setBackend` / `setBackendResolver`

MCP server 用 **lazy resolver** 注册, 第一次 LLM 调用时才决定 backend——不依赖 SDK 的 `oninitialized` 事件 (实测 oninitialized 触发时 client capabilities 仍可能 undefined).

### 📚 文档

- README 加 "LLM 调用模式" 段, 说明 BYOK vs Sampling 的取舍
- MCP 接入示例改成"零配置 / BYOK 二选一"
- CHANGELOG.md 首版

### 🧪 验证

四种 backend 选路场景已端到端验证 (stdin 注入 initialize + initialized + tools/call):
- ✓ 有 Key → BYOK
- ✓ 无 Key + 客户端 sampling → SamplingBackend
- ✓ 无 Key + 客户端不支持 → 警告 + fallback
- ✓ `COUNCIL_MOCK=1` → 强制 MockBackend (resolver 不干扰)

### ⚠️ Breaking? 没有

所有 v0.3.x 的用法保持兼容. 已有 BYOK 用户感知不到任何变化——除了启动 MCP server 时 stderr 多一行 `[council mcp] backend=anthropic-api (BYOK, ...)` 的提示.

---

## [0.3.x] — 2026-04 早期

- v0.3.0: live server 从 `Bun.serve()` 迁到纯 Node (`node:http` + `ws`), npm 用户开箱即用
- v0.3.1: web 端输入框加 `/capture` / `/refine` 斜杠指令
- v0.3.2: 修若干 web 端 trace view + persona 可视化细节

---

## [0.2.0] — 黑客松交付版

- 完整事件总线 + 结构化 synthesis + persona 视觉元数据
- Bun HTTP/WS server + Vite/React 圆桌页面 + `--watch` 直播
- 网页端 capture/distill 流程

## [0.1.0] — MVP

- CLI 链路: `init` / `capture` / `distill` / `convene` / `persona`
- MCP server (stdio): 5 个核心工具
- `~/.council/` 数据目录约定
