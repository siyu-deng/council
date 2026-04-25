import { defineConfig } from "tsdown";

/**
 * Council 的 npm 分发构建配置。
 *
 * 输出: dist/council.js (单一 bin 入口)
 *   - 内部包含全部 CLI 子命令 (capture / convene / persona / serve 即 MCP server / ...)
 *   - `council live` 子命令依赖 Bun.serve(), Node 环境下被入口处的 if 守门拦截
 *
 * `external: ["bun"]`: 不把 bun 模块打进产物。Node 跑到 live chunk 才会
 * 报 "Cannot find package 'bun'", 而 live 命令前置守门已经 process.exit, 所以
 * 那段代码永远不会执行——这是有意的"软排除"。
 */
export default defineConfig({
  entry: { council: "bin/council.ts" },
  outDir: "dist",
  format: "esm",
  target: "node20",
  platform: "node",
  // 禁用 chunk splitting—— rolldown 默认会把 dynamic import 切独立 chunk,
  // 但跨 chunk 的 const 引用会 TDZ; 单 bundle 简单可靠 (产物 ~80KB, 不大)。
  unbundle: false,
  // tsdown 0.21+: external 已改名为 deps.neverBundle
  // - "bun": Bun runtime 模块 (live.ts 用 Bun.serve)
  // - /server\/live/: live.ts 整体不打包, 用户在 Node 上调 `council live` 时
  //   被代码里的 if (!Bun) 守门拦截, 永远不会到 dynamic import 这一行
  deps: {
    neverBundle: ["bun", /server\/live/],
  },
  clean: true,
  shims: true, // 给 __dirname / __filename 等 CJS 全局打 ESM 兼容垫片
  dts: false, // 这是个 CLI 应用而非库, 不需要 .d.ts
  sourcemap: false,
});
