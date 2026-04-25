#!/usr/bin/env bash
# 生成 Council.app (mac 原生可双击应用)
# ────────────────────────────────────
# 两条路:
#   1. 如果 pake + Cargo >= 1.78 可用, 用 Pake 打一个真正的 Tauri 应用 (10MB, 原生窗口)
#   2. 否则 fallback 到 .app bundle + shell launcher (500KB, 自动启动 Bun server + 开浏览器)
#
# **重要**: 默认安装到 ~/Applications/Council.app
# macOS Mojave+ 的 TCC 沙盒会拦截放在 ~/Desktop / ~/Documents / ~/Downloads 下的 .app
# 访问外部文件 (比如读项目里的 web/dist 或调 Bun) — 表现是 Bun 启动时
# "An unknown error occurred (Unexpected)" silent error。
# 装到 ~/Applications/ 这个用户级 Applications 目录就完全不受限。
#
# 用法:
#   bash scripts/make-mac-app.sh                    # 自动检测最佳路径, 装到 ~/Applications/
#   bash scripts/make-mac-app.sh --force-fallback   # 跳过 Pake, 直接做 fallback
#   bash scripts/make-mac-app.sh --force-pake       # 只用 Pake, 失败就失败
#   bash scripts/make-mac-app.sh --out <dir>        # 自定义输出目录 (注意避开 ~/Desktop)

set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# 默认装到 ~/Applications (用户级 Applications, 创建该目录如不存在)
OUT="${HOME}/Applications"
ICON="$REPO/web/public-icon.png"

MODE="auto"
ARGS=("$@")
i=0
while [[ $i -lt ${#ARGS[@]} ]]; do
  arg="${ARGS[$i]}"
  case "$arg" in
    --force-fallback) MODE="fallback" ;;
    --force-pake) MODE="pake" ;;
    --out)
      i=$((i+1))
      OUT="${ARGS[$i]}"
      ;;
  esac
  i=$((i+1))
done
APP="$OUT/Council.app"
mkdir -p "$OUT"

# 警告: ~/Desktop / ~/Documents / ~/Downloads 受 TCC 沙盒限制, .app 在这里启动时
# 无法访问其他位置的文件 — 装这里几乎肯定不工作。
case "$OUT" in
  "$HOME/Desktop"*|"$HOME/Documents"*|"$HOME/Downloads"*)
    printf "\033[33m⚠ 警告: 输出目录 %s 在 macOS TCC 沙盒受限路径下\033[0m\n" "$OUT" >&2
    printf "\033[33m  Council.app 启动时可能因权限限制 silent fail (Bun 报 'Unexpected' error)\033[0m\n" >&2
    printf "\033[33m  推荐用 --out ~/Applications 或 /Applications\033[0m\n" >&2
    ;;
esac

mkdir -p "$OUT"
rm -rf "$APP"

G="\033[32m"; Y="\033[33m"; R="\033[31m"; D="\033[90m"; N="\033[0m"
say() { printf "$*\n"; }
ok() { printf "${G}✓${N} %s\n" "$*"; }
warn() { printf "${Y}⚠${N} %s\n" "$*"; }
die() { printf "${R}✗${N} %s\n" "$*" >&2; exit 1; }

# ──────────────────────────────────────────────────────────
# 路径 1: Pake (Tauri)
# ──────────────────────────────────────────────────────────
try_pake() {
  if ! command -v pake >/dev/null; then
    warn "pake 未安装 (npm install -g pake-cli)"
    return 1
  fi
  if ! command -v cargo >/dev/null; then
    warn "cargo 未安装"
    return 1
  fi
  CARGO_VER=$(cargo --version | awk '{print $2}')
  MAJOR=$(echo "$CARGO_VER" | cut -d. -f1)
  MINOR=$(echo "$CARGO_VER" | cut -d. -f2)
  if [[ "$MAJOR" -lt 1 || ( "$MAJOR" -eq 1 && "$MINOR" -lt 78 ) ]]; then
    warn "cargo $CARGO_VER < 1.78, Pake 需要更新版本 (brew upgrade rust 或 rustup)"
    return 1
  fi

  say "${D}使用 Pake 构建 (cargo $CARGO_VER)${N}"
  (
    cd "$OUT"
    pake http://localhost:3737 \
      --name Council \
      --icon "$ICON" \
      --width 1280 --height 800 \
      --hide-title-bar 2>&1
  ) | tail -10
  if [[ -d "$OUT/Council.app" ]]; then
    ok "Pake Council.app 生成完成"
    return 0
  fi
  warn "Pake 产出未在预期位置, 查找..."
  local found
  found=$(find "$OUT" ~/Desktop "$REPO" -maxdepth 3 -name "Council.app" -mmin -5 2>/dev/null | head -1)
  if [[ -n "$found" && "$found" != "$APP" ]]; then
    mv "$found" "$APP"
    ok "Pake Council.app 搬到 $APP"
    return 0
  fi
  return 1
}

# ──────────────────────────────────────────────────────────
# 路径 2: Fallback .app bundle + shell launcher
# ──────────────────────────────────────────────────────────
build_fallback() {
  say "${D}使用 fallback .app bundle + shell launcher${N}"

  mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"

  # Info.plist
  cat > "$APP/Contents/Info.plist" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleName</key>
  <string>Council</string>
  <key>CFBundleDisplayName</key>
  <string>Council</string>
  <key>CFBundleIdentifier</key>
  <string>ai.council.hackathon</string>
  <key>CFBundleVersion</key>
  <string>0.2.0</string>
  <key>CFBundleShortVersionString</key>
  <string>0.2</string>
  <key>CFBundleExecutable</key>
  <string>Council</string>
  <key>CFBundleIconFile</key>
  <string>AppIcon</string>
  <key>CFBundlePackageType</key>
  <string>APPL</string>
  <key>LSMinimumSystemVersion</key>
  <string>11.0</string>
  <key>LSUIElement</key>
  <false/>
</dict>
</plist>
EOF

  # 图标: PNG → .icns (用 iconutil)
  local ICONSET="$OUT/AppIcon.iconset"
  rm -rf "$ICONSET"
  mkdir -p "$ICONSET"
  if [[ -f "$ICON" ]]; then
    # 生成不同尺寸
    for size in 16 32 64 128 256 512 1024; do
      sips -z $size $size "$ICON" --out "$ICONSET/icon_${size}x${size}.png" >/dev/null 2>&1 || true
    done
    # @2x 对应
    for size in 16 32 128 256 512; do
      double=$((size*2))
      [[ -f "$ICONSET/icon_${double}x${double}.png" ]] && \
        cp "$ICONSET/icon_${double}x${double}.png" "$ICONSET/icon_${size}x${size}@2x.png"
    done
    iconutil -c icns "$ICONSET" -o "$APP/Contents/Resources/AppIcon.icns" 2>/dev/null || \
      cp "$ICON" "$APP/Contents/Resources/AppIcon.png"
    rm -rf "$ICONSET"
  fi

  # 启动脚本
  cat > "$APP/Contents/MacOS/Council" <<EOF
#!/usr/bin/env bash
set -e
# 把所有输出重定向到日志文件 (用 exec 在脚本一开始就生效, 子进程自动继承)
# 实测: 用 'cmd >log 2>&1 &' 这种 per-command 重定向 + & 背景化, 在 .app launchd 上下文里
# 会让 Bun 出现 "Unexpected" silent error。用 exec 重定向就没问题。
exec >/tmp/council.live.log 2>&1
echo "=== Council.app launcher \$(date) ==="

REPO="$REPO"
PORT=\${COUNCIL_LIVE_PORT:-3737}

# macOS 通过 launchd 启动 .app 时, ulimit -n 默认是 256, Bun 在 fd 紧张时表现古怪。
# 提到 65536, 失败再降到 10240; 都失败也不致命。
ulimit -n 524288 2>/dev/null || ulimit -n 65536 2>/dev/null || ulimit -n 10240 2>/dev/null || true
echo "ulimit -n: \$(ulimit -Sn)"

# 1. 确保 bun 可用 (尝试 ~/.bun, /opt/homebrew, /usr/local 三个常见路径)
BUN=""
for cand in "\$HOME/.bun/bin/bun" "/opt/homebrew/bin/bun" "/usr/local/bin/bun"; do
  if [[ -x "\$cand" ]]; then BUN="\$cand"; break; fi
done
if [[ -z "\$BUN" ]]; then
  BUN="\$(command -v bun 2>/dev/null || true)"
fi
if [[ -z "\$BUN" ]]; then
  osascript -e 'display alert "Bun 未安装" message "请先安装 Bun: https://bun.sh\\n然后重新打开 Council.app"'
  exit 1
fi
echo "bun: \$BUN"

# 2. 如果端口被占 (server 已在跑) 直接开浏览器
if nc -z 127.0.0.1 \$PORT 2>/dev/null; then
  echo "port \$PORT in use, just opening browser"
  open "http://127.0.0.1:\$PORT/"
  exit 0
fi

# 3. 否则启动 server, 等就绪, 再开浏览器
cd "\$REPO"
echo "starting bun..."
"\$BUN" run src/server/live.ts &
SERVER_PID=\$!
echo "server pid=\$SERVER_PID"

# 等最多 5 秒
for i in {1..50}; do
  if nc -z 127.0.0.1 \$PORT 2>/dev/null; then break; fi
  sleep 0.1
done
if ! nc -z 127.0.0.1 \$PORT 2>/dev/null; then
  echo "server failed to bind \$PORT"
  osascript -e 'display alert "Council 启动失败" message "查看 /tmp/council.live.log 看错误信息"'
  exit 1
fi
echo "port up, opening browser"
open "http://127.0.0.1:\$PORT/"

# 4. 保持前台运行 (否则 LaunchServices 会认为 app 已退出)
trap "kill \$SERVER_PID 2>/dev/null" EXIT TERM INT
wait \$SERVER_PID
EOF
  chmod +x "$APP/Contents/MacOS/Council"

  ok "Fallback Council.app 生成完成"
  say "${D}  路径: $APP${N}"
  say "${D}  双击启动: 会自动跑 src/server/live.ts 并开浏览器${N}"
}

# ──────────────────────────────────────────────────────────
# Main
# ──────────────────────────────────────────────────────────
case "$MODE" in
  pake)
    try_pake || die "Pake 失败, 参考上面日志"
    ;;
  fallback)
    build_fallback
    ;;
  auto)
    if try_pake; then
      :
    else
      warn "回退到 fallback 方案"
      build_fallback
    fi
    ;;
esac

# 去掉隔离 attr, 让 macOS 不弹"未知来源"警告 (只对开发者自己机器有效)
xattr -cr "$APP" 2>/dev/null || true

ok "产物: $APP"
say ""
say "测试: open '$APP'"
