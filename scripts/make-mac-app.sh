#!/usr/bin/env bash
# 生成 Council.app (mac 原生可双击应用)
# ────────────────────────────────────
# 两条路:
#   1. 如果 pake + Cargo >= 1.78 可用, 用 Pake 打一个真正的 Tauri 应用 (10MB, 原生窗口)
#   2. 否则 fallback 到 .app bundle + shell launcher (500KB, 自动启动 Bun server + 开浏览器)
#
# 两条路都产出同样路径: dist-app/Council.app
#
# 用法:
#   bash scripts/make-mac-app.sh          # 自动检测最佳路径
#   bash scripts/make-mac-app.sh --force-fallback   # 跳过 Pake, 直接做 fallback
#   bash scripts/make-mac-app.sh --force-pake       # 只用 Pake, 失败就失败

set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT="$REPO/dist-app"
APP="$OUT/Council.app"
ICON="$REPO/web/public-icon.png"

MODE="auto"
for arg in "$@"; do
  case "$arg" in
    --force-fallback) MODE="fallback" ;;
    --force-pake) MODE="pake" ;;
  esac
done

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
REPO="$REPO"
PORT=\${COUNCIL_LIVE_PORT:-3737}

# 1. 确保 bun 可用
BUN="\$HOME/.bun/bin/bun"
if [[ ! -x "\$BUN" ]]; then
  BUN="\$(command -v bun 2>/dev/null || true)"
fi
if [[ -z "\$BUN" ]]; then
  osascript -e 'display alert "Bun 未安装" message "请先安装 Bun: https://bun.sh\nthen reopen Council.app"'
  exit 1
fi

# 2. 如果端口被占 (server 已在跑) 直接开浏览器
if nc -z 127.0.0.1 \$PORT 2>/dev/null; then
  open "http://127.0.0.1:\$PORT/"
  exit 0
fi

# 3. 否则启动 server, 等就绪, 再开浏览器
cd "\$REPO"
nohup "\$BUN" run src/server/live.ts >/tmp/council.live.log 2>&1 &
SERVER_PID=\$!
for i in {1..30}; do
  if nc -z 127.0.0.1 \$PORT 2>/dev/null; then break; fi
  sleep 0.15
done
open "http://127.0.0.1:\$PORT/"

# 4. 保持前台运行 (否则 LaunchServices 会认为 app 已退出)
trap "kill \$SERVER_PID 2>/dev/null" EXIT TERM
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
