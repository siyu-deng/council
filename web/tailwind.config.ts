import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Candlelight palette
        ink: {
          DEFAULT: "#0E0D0C",
          deep: "#0A0908",
          soft: "#1A1815",
        },
        amber: {
          glow: "#E8B563",
          warm: "#D89550",
          ember: "#B86D3A",
          dim: "#6B4A2B",
        },
        parchment: {
          DEFAULT: "#E8DCC4",
          warm: "#D4C4A0",
          dark: "#2A2521",
        },
      },
      fontFamily: {
        serif: ['"Cormorant Garamond"', '"Noto Serif SC"', "Georgia", "serif"],
        sans: ['"Inter"', '"Noto Sans SC"', "system-ui", "sans-serif"],
        mono: ['"JetBrains Mono"', "ui-monospace", "monospace"],
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
