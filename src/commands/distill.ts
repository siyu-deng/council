import { log } from "../core/logger.ts";
import { isInitialized } from "../core/paths.ts";
import { NotInitializedError } from "../core/errors.ts";
import { distillAll, distillOne } from "../engine/distill.ts";

export async function distillCommand(
  sessionId: string | undefined,
  opts: { auto?: boolean },
): Promise<void> {
  if (!isInitialized()) throw new NotInitializedError();

  if (sessionId) {
    await distillOne(sessionId);
    return;
  }

  if (opts.auto) {
    await distillAll();
    return;
  }

  log.error("需要指定 sessionId 或 --auto");
  log.muted("  council distill 2026-04-23-xxx   # 单个 session");
  log.muted("  council distill --auto           # 全部未蒸馏的");
}
