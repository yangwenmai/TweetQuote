#!/usr/bin/env bash
#
# TweetQuote 服务器一键更新部署
#
# 在仓库根目录执行（或任意位置调用本脚本均可）：
#   ./scripts/deploy.sh
#   PUBLIC_HOST=203.0.113.10 ./scripts/deploy.sh
#   ./scripts/deploy.sh --skip-pull --web-only
#
# 流程：git pull → npm install → db:push → build → pm2 restart/start → 健康检查
# Extension 不在此脚本内打包（与 docs/SERVER_DEPLOYMENT.md 一致）。
#
# 公网主机名解析顺序：
#   1) 环境变量 PUBLIC_HOST
#   2) scripts/deploy.local 中的 PUBLIC_HOST=...
#   3) 根目录 .env.local 中 PUBLIC_API_BASE_URL 的 host 部分

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT"

# --- 默认选项 ---
DO_PULL=1
DO_INSTALL=1
DO_DB=1
BUILD_API=1
BUILD_WEB=1
DO_PM2=1
DO_HEALTH=1
# 环境变量优先于 deploy.local；先记下再加载本地配置
ENV_PUBLIC_HOST="${PUBLIC_HOST:-}"

usage() {
  cat <<'EOF'
Usage: ./scripts/deploy.sh [options]

Options:
  --skip-pull       跳过 git pull
  --skip-install    跳过 npm install
  --skip-db         跳过 prisma db:push
  --skip-pm2        构建后不重启/启动 pm2
  --skip-health     跳过健康检查
  --api-only        只构建并重启 API
  --web-only        只构建并重启 Web
  -h, --help        显示帮助

Environment / config:
  PUBLIC_HOST       公网 IP 或域名（不含 http://），用于 Web 构建时的
                    NEXT_PUBLIC_API_BASE_URL=http://$PUBLIC_HOST:8787
  也可写入 scripts/deploy.local（参考 scripts/deploy.local.example）
EOF
}

while [ $# -gt 0 ]; do
  case "$1" in
    --skip-pull) DO_PULL=0 ;;
    --skip-install) DO_INSTALL=0 ;;
    --skip-db) DO_DB=0 ;;
    --skip-pm2) DO_PM2=0 ;;
    --skip-health) DO_HEALTH=0 ;;
    --api-only) BUILD_WEB=0 ;;
    --web-only) BUILD_API=0; DO_DB=0 ;;
    -h|--help) usage; exit 0 ;;
    *)
      echo "Unknown option: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
  shift
done

log() { echo "[deploy $(date '+%H:%M:%S')] $*"; }
die() { echo "[deploy ERROR] $*" >&2; exit 1; }

# --- 加载可选本地配置（PUBLIC_HOST 环境变量优先）---
PUBLIC_HOST=""
if [ -f "$SCRIPT_DIR/deploy.local" ]; then
  # shellcheck disable=SC1091
  . "$SCRIPT_DIR/deploy.local"
fi
if [ -n "$ENV_PUBLIC_HOST" ]; then
  PUBLIC_HOST="$ENV_PUBLIC_HOST"
fi

# --- 从 .env.local 的 PUBLIC_API_BASE_URL 推断 PUBLIC_HOST ---
if [ -z "$PUBLIC_HOST" ] && [ -f "$REPO_ROOT/.env.local" ]; then
  _base="$(grep -E '^[[:space:]]*PUBLIC_API_BASE_URL=' "$REPO_ROOT/.env.local" | head -1 | cut -d= -f2- | tr -d '"' | tr -d "'")"
  if [ -n "$_base" ]; then
    PUBLIC_HOST="$(printf '%s' "$_base" | sed -E 's|^https?://||; s|[:/].*$||')"
  fi
fi

[ -n "$PUBLIC_HOST" ] || die "未设置 PUBLIC_HOST。请 export PUBLIC_HOST=你的公网IP或域名，或写入 scripts/deploy.local / .env.local 的 PUBLIC_API_BASE_URL"

command -v npm >/dev/null 2>&1 || die "未找到 npm"
command -v node >/dev/null 2>&1 || die "未找到 node"
if [ "$DO_PM2" -eq 1 ]; then
  command -v pm2 >/dev/null 2>&1 || die "未找到 pm2（npm i -g pm2）"
fi

WEB_API_BASE="http://${PUBLIC_HOST}:8787"
log "REPO_ROOT=$REPO_ROOT"
log "PUBLIC_HOST=$PUBLIC_HOST"
log "NEXT_PUBLIC_API_BASE_URL=$WEB_API_BASE"
log "build api=$BUILD_API web=$BUILD_WEB pull=$DO_PULL install=$DO_INSTALL db=$DO_DB pm2=$DO_PM2"

# --- 1. git pull ---
if [ "$DO_PULL" -eq 1 ]; then
  log "git pull..."
  git pull --ff-only
fi

# --- 2. npm install ---
if [ "$DO_INSTALL" -eq 1 ]; then
  log "npm install..."
  npm install
fi

# --- 3. db:push ---
if [ "$DO_DB" -eq 1 ] && [ "$BUILD_API" -eq 1 ]; then
  log "db:push..."
  npm run db:push -w @tweetquote/api
fi

# --- 4. build ---
pm2_has() {
  pm2 describe "$1" >/dev/null 2>&1
}

# 构建 Web 前停掉旧进程，避免 next build 改写 .next 时旧进程占端口/读到半成品
if [ "$DO_PM2" -eq 1 ] && [ "$BUILD_WEB" -eq 1 ] && pm2_has tweetquote-web; then
  log "pm2 stop tweetquote-web (before web build)"
  pm2 stop tweetquote-web >/dev/null || true
fi

if [ "$BUILD_API" -eq 1 ]; then
  log "build API (+ domain/telemetry via workspace)..."
  # domain / telemetry 需先于或与 API 一并构建；与文档「五、构建」一致
  npm run build -w @tweetquote/domain -w @tweetquote/telemetry -w @tweetquote/api
fi

if [ "$BUILD_WEB" -eq 1 ]; then
  log "build Web (NEXT_PUBLIC_API_BASE_URL 必须在 build 阶段传入)..."
  NEXT_PUBLIC_API_BASE_URL="$WEB_API_BASE" npm run build -w @tweetquote/web
fi

# --- 5. pm2 ---
ensure_api() {
  if pm2_has tweetquote-api; then
    log "pm2 restart tweetquote-api"
    pm2 restart tweetquote-api
  else
    log "pm2 start tweetquote-api"
    pm2 start npm --name "tweetquote-api" --cwd "$REPO_ROOT" -- run start:api
  fi
}

ensure_web() {
  # 每次用固定 env 重建，避免旧 pm2 条目缺少 bind / cwd，或 Linux 系统 HOSTNAME 干扰 Next
  if pm2_has tweetquote-web; then
    log "pm2 delete tweetquote-web (recreate with PORT=3000)"
    pm2 delete tweetquote-web >/dev/null || true
  fi
  log "pm2 start tweetquote-web (PORT=3000, next --hostname 0.0.0.0)"
  PORT=3000 pm2 start npm --name "tweetquote-web" --cwd "$REPO_ROOT" -- run start:web
}

wait_http() {
  # usage: wait_http <name> <url> <attempts> <sleep_seconds>
  local name="$1" url="$2" attempts="$3" delay="$4" i=1
  log "health check $name ..."
  while [ "$i" -le "$attempts" ]; do
    if curl -fsS --max-time 5 -o /dev/null "$url"; then
      log "$name OK"
      return 0
    fi
    log "$name not ready (try $i/$attempts), sleep ${delay}s..."
    sleep "$delay"
    i=$((i + 1))
  done
  return 1
}

if [ "$DO_PM2" -eq 1 ]; then
  if [ "$BUILD_API" -eq 1 ]; then
    ensure_api
  fi
  if [ "$BUILD_WEB" -eq 1 ]; then
    ensure_web
  fi
  pm2 save >/dev/null || true
fi

# --- 6. 健康检查（Next 冷启动常需数秒，带重试）---
if [ "$DO_HEALTH" -eq 1 ]; then
  if [ "$BUILD_API" -eq 1 ]; then
    wait_http "API :8787" "http://127.0.0.1:8787/api/v1/health" 10 1 \
      || die "API 健康检查失败。查看: pm2 logs tweetquote-api --lines 50"
  fi
  if [ "$BUILD_WEB" -eq 1 ]; then
    wait_http "Web :3000" "http://127.0.0.1:3000/" 20 2 \
      || die "Web 健康检查失败。查看: pm2 status 与 pm2 logs tweetquote-web --lines 50"
  fi
fi

log "done."
log "API:  http://${PUBLIC_HOST}:8787"
log "Web:  http://${PUBLIC_HOST}:3000  (或 https://app.tweetquote.app)"
log "Daily: https://app.tweetquote.app/daily"
log "Extension 请在本地执行: npm run build:test -w @tweetquote/extension"
