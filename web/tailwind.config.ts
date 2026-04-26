import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // 通过 CSS 变量定义, 主题切换时全局同时变化。
        // 用 rgb(... / <alpha-value>) 模板支持 Tailwind 的 /XX opacity 修饰符。
        ink: {
          DEFAULT: "rgb(var(--ink-rgb) / <alpha-value>)",
          deep: "rgb(var(--ink-deep-rgb) / <alpha-value>)",
          soft: "rgb(var(--ink-soft-rgb) / <alpha-value>)",
        },
        amber: {
          glow: "rgb(var(--amber-glow-rgb) / <alpha-value>)",
          warm: "rgb(var(--amber-warm-rgb) / <alpha-value>)",
          ember: "rgb(var(--amber-ember-rgb) / <alpha-value>)",
          dim: "rgb(var(--amber-dim-rgb) / <alpha-value>)",
        },
        parchment: {
          DEFAULT: "rgb(var(--parchment-rgb) / <alpha-value>)",
          warm: "rgb(var(--parchment-warm-rgb) / <alpha-value>)",
          dark: "rgb(var(--parchment-dark-rgb) / <alpha-value>)",
        },
      },
      fontFamily: {
        // Cormorant 自托管 (latin only); 中文回落到系统宋体
        serif: [
          '"Cormorant Garamond"',
          '"Songti SC"',
          '"Noto Serif SC"',
          "Georgia",
          "serif",
        ],
        // 全部系统字体, 不再下载
        sans: [
          "-apple-system",
          "BlinkMacSystemFont",
          '"Segoe UI"',
          '"PingFang SC"',
          '"Hiragino Sans GB"',
          '"Microsoft YaHei"',
          "system-ui",
          "sans-serif",
        ],
        mono: [
          "ui-monospace",
          "SFMono-Regular",
          '"SF Mono"',
          "Menlo",
          "Monaco",
          "monospace",
        ],
      },
      boxShadow: {
        candle:
          "0 0 32px 4px rgba(232, 181, 99, 0.25), 0 0 80px 16px rgba(232, 181, 99, 0.08)",
        seat: "0 4px 24px rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(232, 181, 99, 0.15)",
        decree:
          "0 20px 60px rgba(0, 0, 0, 0.6), 0 0 120px 24px rgba(232, 181, 99, 0.2)",
      },
      keyframes: {
        flicker: {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.85" },
        },
      },
      animation: {
        flicker: "flicker 2.4s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};

export default config;
