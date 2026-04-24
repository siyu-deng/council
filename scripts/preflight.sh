#!/usr/bin/env bash
# Council · demo 前 dry run 检查脚本
# 用法: bash scripts/preflight.sh [--mock] [--skip-convene]
#
#   --mock         不调真实 API, 用 COUNCIL_MOCK=1 走打桩 (快, 省钱)
#   --skip-convene 只跑 init/capture/distill, 跳过 convene (避免烧 API)
#
# 完整跑一次 (真实 API) 大约 2 分钟 + 几美分 Haiku 调用。

set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SANDBOX="/tmp/.council-preflight-$$"
FAKE_MATERIAL="$REPO/自我的材料/Claude-用第一性原理重构饮食系统.md"

MOCK=0
SKIP_CONVENE=0
for arg in "$@"; do
  case "$arg" in
    --mock) MOCK=1 ;;
    --skip-convene) SKIP_CONVENE=1 ;;
    *) echo "未知参数: $arg" >&2; exit 2 ;;
  esac
done

if [[ "$MOCK" == "1" ]]; then
  export COUNCIL_MOCK=1
fi

export COUNCIL_HOME="$SANDBOX"

# 颜色
R="\033[31m"; G="\033[32m"; Y="\033[33m"; B="\033[34m"; D="\033[90m"; N="\033[0m"
say() { printf "%b%s%b\n" "$B" "$1" "$N"; }
ok()  { printf "%b✓ %s%b\n" "$G" "$1" "$N"; }
warn() { printf "%b⚠ %s%b\n" "$Y" "$1" "$N"; }
die() { printf "%b✗ %s%b\n" "$R" "$1" "$N" >&2; exit 1; }

cleanup() { rm -rf "$SANDBOX" /tmp/council-preflight-*.txt 2>/dev/null || true; }
trap cleanup EXIT

cd "$REPO"

say "── 环境检查 ──"
command -v bun >/dev/null || die "bun 不在 PATH (装: curl -fsSL https://bun.sh/install | bash)"
ok "bun: $(bun --version)"

if [[ "$MOCK" == "0" ]]; then
  if [[ ! -f "$REPO/.env" ]]; then die ".env 不存在"; fi
  if ! grep -q "^ANTHROPIC_API_KEY=sk-" "$REPO/.env"; then
    die ".env 里没有合法的 ANTHROPIC_API_KEY (sk-*)"
  fi
  ok ".env 有 ANTHROPIC_API_KEY"
else
  warn "MOCK 模式: 不调真实 API"
fi

if [[ ! -f "$FAKE_MATERIAL" ]]; then
  die "找不到素材: $FAKE_MATERIAL"
fi
ok "素材就位: $(basename "$FAKE_MATERIAL")"

say ""
say "── TypeScript 编译检查 ──"
bun tsc --noEmit && ok "tsc 通过" || die "tsc 失败"

say ""
say "── 1) init ──"
t0=$(date +%s)
bun run bin/council.ts init >/dev/null 2>&1 || die "init 失败"
t1=$(date +%s)
ok "init ($(( t1 - t0 ))s)"

say ""
say "── 2) capture ──"
t0=$(date +%s)
bun run bin/council.ts capture --file "$FAKE_MATERIAL" \
  1>/tmp/council-preflight-capture.out 2>/tmp/council-preflight-capture.err || die "capture 失败"
t1=$(date +%s)
ok "capture ($(( t1 - t0 ))s)"

say ""
say "── 3) distill --auto ──"
t0=$(date +%s)
bun run bin/council.ts distill --auto \
  1>/tmp/council-preflight-distill.out 2>/tmp/council-preflight-distill.err || die "distill 失败"
t1=$(date +%s)
HIGHLIGHTS=$(ls "$SANDBOX/skills/"*.md 2>/dev/null | wc -l | tr -d ' ')
SELF_PERSONAS=$(ls "$SANDBOX/personas/self/"*.md 2>/dev/null | wc -l | tr -d ' ')
ok "distill ($(( t1 - t0 ))s) — ${HIGHLIGHTS} 高光, ${SELF_PERSONAS} self persona"
[[ "$HIGHLIGHTS" -gt 0 ]] || die "没产出任何高光 (可能 P1/mock bug 回归)"
[[ "$SELF_PERSONAS" -gt 0 ]] || die "没产出任何 self persona"

say ""
say "── 4) MCP server stdout 干净度检查 ──"
# 给 MCP server 发 initialize + tools/list, 确认 stdout 全是合法 JSON-RPC
cat <<EOF > /tmp/council-preflight-mcp.in
{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"preflight","version":"0"}}}
{"jsonrpc":"2.0","method":"notifications/initialized"}
{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}
EOF
bun run src/mcp/server.ts < /tmp/council-preflight-mcp.in \
  1>/tmp/council-preflight-mcp.out 2>/tmp/council-preflight-mcp.err &
MCP_PID=$!
sleep 2
kill $MCP_PID 2>/dev/null || true
wait $MCP_PID 2>/dev/null || true

# 所有 stdout 行必须是合法 JSON, 且 stderr 必须为 0 字节 (COUNCIL_QUIET 生效)
MCP_STDERR_SIZE=$(wc -c </tmp/council-preflight-mcp.err | tr -d ' ')
BAD_JSON=$(bun -e "
const lines = require('fs').readFileSync('/tmp/council-preflight-mcp.out','utf-8').trim().split('\n').filter(Boolean);
let bad = 0;
for (const line of lines) { try { JSON.parse(line); } catch { bad++; } }
console.log(bad + ':' + lines.length);
")
[[ "$BAD_JSON" =~ ^0:[0-9]+$ ]] || die "MCP stdout 不全是合法 JSON-RPC: $BAD_JSON"
[[ "$MCP_STDERR_SIZE" == "0" ]] || warn "MCP stderr 有 $MCP_STDERR_SIZE 字节 (不影响协议, 但 COUNCIL_QUIET 可能未全生效)"
TOOL_COUNT=$(bun -e "
const lines = require('fs').readFileSync('/tmp/council-preflight-mcp.out','utf-8').trim().split('\n').filter(Boolean);
for (const line of lines) { const j = JSON.parse(line); if (j.id === 2) { console.log((j.result?.tools ?? []).length); break; } }
")
ok "MCP 协议干净, ${TOOL_COUNT} 个 tool 注册 (stdout 全 JSON-RPC, stderr=${MCP_STDERR_SIZE}B)"

if [[ "$SKIP_CONVENE" == "1" ]]; then
  say ""
  warn "跳过 convene (--skip-convene)"
else
  say ""
  say "── 5) convene (真实/mock) ──"
  t0=$(date +%s)
  bun run bin/council.ts convene "我应该先做一个不完美的产品推出去吗" \
    1>/tmp/council-preflight-convene.out 2>/tmp/council-preflight-convene.err || die "convene 失败"
  t1=$(date +%s)
  STDOUT_SIZE=$(wc -c </tmp/council-preflight-convene.out | tr -d ' ')
  [[ "$STDOUT_SIZE" == "0" ]] || die "convene CLI 模式 stdout 应为 0 但得到 $STDOUT_SIZE 字节 (渲染器在往 stdout 写, 会污染 MCP)"
  TRANSCRIPT=$(ls "$SANDBOX/transcripts/"*.md 2>/dev/null | head -1)
  [[ -f "$TRANSCRIPT" ]] || die "没写出 transcript"
  # 检查 Synthesis 是否收尾 (末尾不是 "...")
  LAST_LINE=$(tail -1 "$TRANSCRIPT")
  if [[ ${#LAST_LINE} -lt 3 || "$LAST_LINE" =~ ^[[:space:]]*$ ]]; then
    LAST_LINE=$(tail -3 "$TRANSCRIPT" | grep -v '^[[:space:]]*$' | tail -1)
  fi
  ok "convene ($(( t1 - t0 ))s) — stdout 干净, transcript $(basename "$TRANSCRIPT")"
  printf "%b  末尾: %s%b\n" "$D" "${LAST_LINE:0:80}" "$N"
fi

say ""
printf "%b✓ 全部检查通过%b\n" "$G" "$N"
