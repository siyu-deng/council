import { defineConfig } from "tsdown";

/**
 * Council 的 npm 分发构建配置。
 *
 * 输出: dist/council.mjs (单一 bin 入口)
 *   - 内部包含全部 CLI 子命令 (capture / convene / live / persona / serve / ...)
 *   - v0.3 起 live server 已迁到纯 Node (node:http + ws), 不再依赖 Bun
 *
 * 旧版本里有 `neverBundle: ["bun", /server\/live/]` 的特殊排除, 现在全部移除。
 * 唯一的运行时依赖是 npm 包里声明的 dependencies (含 ws)。
 */
export default defineConfig({
  entry: { council: "bin/council.ts" },
  outDir: "dist",
  format: "esm",
  target: "node20",
  platform: "node",
  // 禁用 chunk splitting—— rolldown 默认会把 dynamic import 切独立 chunk,
  // 但跨 chunk 的 const 引用会 TDZ; 单 bundle 简单可靠。
  unbundle: false,
  clean: true,
  shims: true, // 给 __dirname / __filename 等 CJS 全局打 ESM 兼容垫片
  dts: false, // 这是个 CLI 应用而非库, 不需要 .d.ts
  sourcemap: false,
});
