import kleur from "kleur";
import ora, { type Ora } from "ora";

const debugEnabled = !!process.env.COUNCIL_DEBUG;

// MCP stdio transport 要求 stdout 只承载 JSON-RPC。
// 所有人类可读日志统一走 stderr, CLI 终端展示不受影响, MCP 场景不会污染协议。
// 设置 COUNCIL_QUIET=1 可以彻底静默日志 (ora spinner 默认也写 stderr)。
const quiet = !!process.env.COUNCIL_QUIET;

function write(line: string): void {
  if (quiet) return;
  process.stderr.write(line + "\n");
}

export const log = {
  info: (msg: string) => write(`${kleur.cyan("ℹ")} ${msg}`),
  success: (msg: string) => write(`${kleur.green("✓")} ${msg}`),
  warn: (msg: string) => write(`${kleur.yellow("⚠")} ${msg}`),
  error: (msg: string) => process.stderr.write(`${kleur.red("✗")} ${msg}\n`),
  muted: (msg: string) => write(kleur.gray(msg)),
  plain: (msg: string) => write(msg),
  debug: (msg: string) => {
    if (debugEnabled) write(`${kleur.magenta("debug")} ${msg}`);
  },
  heading: (msg: string) => write("\n" + kleur.bold().underline(msg)),
  section: (msg: string) => write("\n" + kleur.bold(msg)),
};

export function spinner(text: string): Ora {
  // ora 默认写 stderr; quiet 模式下用 isSilent 关闭
  return ora({ text, spinner: "dots", isSilent: quiet }).start();
}

export const c = kleur;
