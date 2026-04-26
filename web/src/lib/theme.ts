// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 主题管理 — system / light / dark 三档
// 持久化到 localStorage; 监听系统色调变化
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { useEffect, useState } from "react";

export type ThemePref = "system" | "light" | "dark";
export type ResolvedTheme = "light" | "dark";

const STORAGE_KEY = "council:theme";

function readPref(): ThemePref {
  if (typeof window === "undefined") return "system";
  const v = window.localStorage.getItem(STORAGE_KEY);
  if (v === "light" || v === "dark" || v === "system") return v;
  return "system";
}

function systemPrefersDark(): boolean {
  if (typeof window === "undefined") return true;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function resolve(pref: ThemePref): ResolvedTheme {
  if (pref === "system") return systemPrefersDark() ? "dark" : "light";
  return pref;
}

function apply(resolved: ResolvedTheme) {
  if (typeof document === "undefined") return;
  const html = document.documentElement;
  if (resolved === "light") {
    html.classList.add("theme-light");
    html.classList.remove("dark");
  } else {
    html.classList.remove("theme-light");
    html.classList.add("dark");
  }
}

// 在模块加载时立刻 apply 一次, 避免页面闪烁 (FOUC)
if (typeof document !== "undefined") {
  apply(resolve(readPref()));
}

export function useTheme(): {
  pref: ThemePref;
  resolved: ResolvedTheme;
  setPref: (p: ThemePref) => void;
  cycle: () => void;
} {
  const [pref, setPrefState] = useState<ThemePref>(() => readPref());
  const [resolved, setResolved] = useState<ResolvedTheme>(() => resolve(readPref()));

  function setPref(p: ThemePref) {
    setPrefState(p);
    try {
      window.localStorage.setItem(STORAGE_KEY, p);
    } catch {
      /* ignore */
    }
    const r = resolve(p);
    setResolved(r);
    apply(r);
  }

  // 系统主题变化监听
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    function onChange() {
      if (pref === "system") {
        const r = systemPrefersDark() ? "dark" : "light";
        setResolved(r);
        apply(r);
      }
    }
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [pref]);

  // 三态循环: system → light → dark → system
  function cycle() {
    setPref(pref === "system" ? "light" : pref === "light" ? "dark" : "system");
  }

  return { pref, resolved, setPref, cycle };
}
