import { spawn } from "node:child_process";
import { networkInterfaces } from "node:os";
import { isInitialized } from "../core/paths.ts";
import { NotInitializedError } from "../core/errors.ts";
import { convene } from "../engine/convene.ts";
import { startLiveServer } from "../server/live.ts";
import { log, c } from "../core/logger.ts";
import { newRunId } from "../engine/events.ts";

export interface ConveneCmdOpts {
  with?: string;
  stream?: boolean;
  /** --watch: start live server + open browser to see the round-table live */
  watch?: boolean;
  /** --no-structured: 跳过结构化 synthesis, 走流式 Markdown 回退 */
  structured?: boolean;
}

export async function conveneCommand(
  question: string,
  opts: ConveneCmdOpts,
): Promise<void> {
  if (!isInitialized()) throw new NotInitializedError();
  if (!question.trim()) {
    throw new Error('需要提供问题: council convene "<你的问题>"');
  }

  if (opts.watch) {
    await conveneWithWatch(question, opts);
    return;
  }

  await convene(question, {
    with: opts.with,
    structuredSynthesis: opts.structured !== false,
  });
}

/**
 * --watch 模式: CLI + 浏览器圆桌同时在线
 *
 * 执行流:
 * 1. 启动 live server (端口 3737, 同进程)
 * 2. 生成 run_id, 打印 URL (localhost + LAN IP, 方便手机扫码试)
 * 3. 打开默认浏览器
 * 4. 立刻跑 convene (事件流同时推到 stderr 和 WS)
 * 5. convene 完成后保持 server 存活 3 秒让网页收完尾部事件, 然后退出
 */
async function conveneWithWatch(
  question: string,
  opts: ConveneCmdOpts,
): Promise<void> {
  const server = startLiveServer();
  const port = server.port;
  const runId = newRunId(
    "convene",
    question
      .toLowerCase()
      .replace(/[^\w\u4e00-\u9fa5-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 30) || "question",
  );

  const localUrl = `http://127.0.0.1:${port}/?run_id=${encodeURIComponent(runId)}&q=${encodeURIComponent(question)}`;
  const lanIp = firstLanIp();
  const lanUrl = lanIp
    ? `http://${lanIp}:${port}/?run_id=${encodeURIComponent(runId)}&q=${encodeURIComponent(question)}`
    : null;

  log.section("议会直播已开");
  log.plain(`  ${c.bold("本机")}: ${c.cyan(localUrl)}`);
  if (lanUrl)
    log.plain(
      `  ${c.bold("局域网")}: ${c.cyan(lanUrl)}  ${c.gray("(手机扫码召集)")}`,
    );
  log.muted("  按 Ctrl+C 结束");

  // 打开默认浏览器 (macOS)
  try {
    spawn("open", [localUrl], { stdio: "ignore", detached: true }).unref();
  } catch {
    /* 非 macOS 或无 GUI 时 silent */
  }

  // 跑议会
  try {
    await convene(question, {
      with: opts.with,
      runId,
      structuredSynthesis: opts.structured !== false,
    });
  } catch (err) {
    log.error(`议会失败: ${String(err)}`);
  }

  // 给网页 3 秒接收 tail events, 然后优雅停机
  log.muted("\n  网页 3 秒后关闭连接...");
  await new Promise((r) => setTimeout(r, 3000));
  server.stop();
  log.muted("  live server 已停");
}

function firstLanIp(): string | null {
  const nets = networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] ?? []) {
      if (net.family === "IPv4" && !net.internal) return net.address;
    }
  }
  return null;
}
