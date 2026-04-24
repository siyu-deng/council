import { readFileSync, writeFileSync, existsSync, readdirSync, copyFileSync } from "node:fs";
import { join } from "node:path";
import { paths, seedPaths, ensureCouncilDirs, isInitialized } from "../core/paths.ts";
import { log, c } from "../core/logger.ts";

export async function initCommand(opts: { force?: boolean }): Promise<void> {
  if (isInitialized() && !opts.force) {
    log.warn("Council 已初始化 (~/.council/)");
    log.muted("  → 用 --force 覆盖, 或直接编辑 ~/.council/identity.md");
    return;
  }

  ensureCouncilDirs();
  log.success(`创建目录: ${paths.root()}`);

  // identity.md
  const now = new Date().toISOString().slice(0, 10);
  if (!existsSync(paths.identity()) || opts.force) {
    const tpl = readFileSync(seedPaths.identityTemplate(), "utf-8").replace(
      "__CREATED_AT__",
      now,
    );
    writeFileSync(paths.identity(), tpl, "utf-8");
    log.success(`写入 identity.md`);
  }

  // config.yml
  if (!existsSync(paths.config()) || opts.force) {
    const tpl = readFileSync(seedPaths.configTemplate(), "utf-8");
    writeFileSync(paths.config(), tpl, "utf-8");
    log.success(`写入 config.yml`);
  }

  // copy seed personas
  copySeedPersonas("mentors", seedPaths.personaMentors(), paths.personaMentors(), opts.force);
  copySeedPersonas("roles", seedPaths.personaRoles(), paths.personaRoles(), opts.force);

  log.section("Council 就绪。下一步:");
  log.plain(`  1. 编辑 ${c.bold(paths.identity())} 告诉 Council 你是谁`);
  log.plain(`  2. ${c.bold("council capture --file <你的对话.md>")} 捕获第一段对话`);
  log.plain(`  3. ${c.bold("council distill --auto")} 蒸馏出自己的 persona`);
  log.plain(`  4. ${c.bold('council convene "<你的问题>"')} 召开第一次议会`);
}

function copySeedPersonas(
  label: string,
  srcDir: string,
  dstDir: string,
  force?: boolean,
): void {
  if (!existsSync(srcDir)) return;
  let copied = 0;
  for (const file of readdirSync(srcDir)) {
    if (!file.endsWith(".md")) continue;
    const dst = join(dstDir, file);
    if (existsSync(dst) && !force) continue;
    copyFileSync(join(srcDir, file), dst);
    copied++;
  }
  if (copied > 0) log.success(`拷贝 ${copied} 个 ${label} persona`);
}
