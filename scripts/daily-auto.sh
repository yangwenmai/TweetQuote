#!/bin/bash
#
# TweetQuote 每日 Top 10 自动生成 —— 守卫 + 运行脚本
#
# 由 LaunchAgent（com.tweetquote.daily-top）频繁唤醒调用。它自己判断是否满足条件，
# 只有「当前连在公司 WiFi + 时间在窗口内 + 今天还没生成过」时才真正跑一次完整流程：
#   1) daily:discover  —— 用 Grok 找当天候选引用链，写 apps/api/scripts/daily-input.<date>.json
#   2) daily:generate  —— 抓取并按 essence 打分，写 apps/web/data/daily/<date>.json
#
# 配置：把 scripts/daily-auto.local.example 复制成 scripts/daily-auto.local 并填 OFFICE_SSID。
# 用输出文件是否存在做「今天已完成」标记，天然保证一天只跑一次、失败可在窗口内自动重试。

set -u

# --- 定位仓库根目录（脚本在 <repo>/scripts/ 下）---
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# --- 基础 PATH（LaunchAgent 环境非常精简，必须自己补齐）---
export PATH="/usr/bin:/bin:/usr/sbin:/sbin:$PATH"
export PATH="$HOME/.grok/bin:$PATH"
# 加载 nvm 以拿到 node/npm（如果你不用 nvm，可删掉这几行，改用系统 node）
export NVM_DIR="$HOME/.nvm"
if [ -s "$NVM_DIR/nvm.sh" ]; then
  # shellcheck disable=SC1090
  . "$NVM_DIR/nvm.sh" >/dev/null 2>&1
fi
# 兜底：显式补上当前 node 版本目录
if ! command -v node >/dev/null 2>&1; then
  export PATH="$HOME/.nvm/versions/node/v23.6.0/bin:$PATH"
fi

# --- 默认配置，可被 daily-auto.local 覆盖 ---
OFFICE_SSID=""          # 公司 WiFi 名，多个用英文逗号分隔，例如 "Office-5G,Office"
START_HOUR=8            # 生效起始小时（含）
END_HOUR=10             # 生效结束小时（不含），即 8:00–9:59
AUTO_PUSH=0             # 设为 1 时，生成后自动 git add/commit/push（默认关闭）
DISCOVER_COUNT=12       # 让 Grok 找多少个候选
TOP_N=10               # 榜单保留前 N 名

CONFIG_FILE="$SCRIPT_DIR/daily-auto.local"
if [ -f "$CONFIG_FILE" ]; then
  # shellcheck disable=SC1090
  . "$CONFIG_FILE"
fi

LOG_DIR="$SCRIPT_DIR/logs"
mkdir -p "$LOG_DIR"
LOG_FILE="$LOG_DIR/daily-auto.log"

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" >>"$LOG_FILE"; }

# --- 取当前 WiFi SSID（此 macOS 版本上 networksetup 不可靠，用 ipconfig）---
current_ssid() {
  local dev
  dev="$(networksetup -listallhardwareports 2>/dev/null \
    | awk '/Wi-Fi|AirPort/{getline; print $2; exit}')"
  [ -z "$dev" ] && dev="en0"
  ipconfig getsummary "$dev" 2>/dev/null | sed -n 's/^ *SSID : //p' | head -1
}

DATE="$(date +%F)"
OUT_FILE="$REPO_ROOT/apps/web/data/daily/$DATE.json"

# --- 守卫 1：时间窗口 ---
HOUR=$(date +%H)
HOUR=$((10#$HOUR))
if [ "$HOUR" -lt "$START_HOUR" ] || [ "$HOUR" -ge "$END_HOUR" ]; then
  exit 0
fi

# --- 守卫 2：今天已生成则跳过（天然的一天一次）---
if [ -f "$OUT_FILE" ]; then
  exit 0
fi

# --- 守卫 3：必须连在公司 WiFi ---
SSID="$(current_ssid)"
if [ -z "$OFFICE_SSID" ]; then
  log "跳过：未配置 OFFICE_SSID（编辑 $CONFIG_FILE）。当前 SSID=[$SSID]"
  exit 0
fi
matched=0
IFS=',' read -r -a _ssids <<<"$OFFICE_SSID"
for want in "${_ssids[@]}"; do
  want="$(echo "$want" | sed 's/^ *//;s/ *$//')"
  [ -n "$want" ] && [ "$SSID" = "$want" ] && matched=1
done
if [ "$matched" -ne 1 ]; then
  exit 0
fi

# --- 并发锁：防止多次唤醒重叠执行 ---
LOCK_DIR="$LOG_DIR/.daily-auto.lock"
if ! mkdir "$LOCK_DIR" 2>/dev/null; then
  log "跳过：已有一次运行在进行中（锁 $LOCK_DIR）"
  exit 0
fi
cleanup() { rmdir "$LOCK_DIR" 2>/dev/null; }
trap cleanup EXIT

cd "$REPO_ROOT" || { log "错误：无法进入仓库 $REPO_ROOT"; exit 1; }

log "===== 开始生成 $DATE（SSID=$SSID, node=$(command -v node)） ====="

INPUT_REL="scripts/daily-input.$DATE.json"

# --- 步骤 1：discover ---
log "步骤 1/2 discover..."
if ! npm run daily:discover -w @tweetquote/api -- \
      --date "$DATE" --count "$DISCOVER_COUNT" >>"$LOG_FILE" 2>&1; then
  log "discover 失败，本次退出（窗口内下次唤醒会重试）"
  exit 1
fi

# --- 步骤 2：generate ---
log "步骤 2/2 generate..."
if ! npm run daily:generate -w @tweetquote/api -- \
      --input "$INPUT_REL" --date "$DATE" --top "$TOP_N" >>"$LOG_FILE" 2>&1; then
  log "generate 失败，本次退出（窗口内下次唤醒会重试）"
  exit 1
fi

if [ ! -f "$OUT_FILE" ]; then
  log "generate 结束但未见输出文件 $OUT_FILE，判为失败"
  exit 1
fi

log "完成：已写入 $OUT_FILE"

# --- 可选：自动提交并推送，让部署环境的 /daily 更新 ---
if [ "$AUTO_PUSH" = "1" ]; then
  log "AUTO_PUSH=1，提交并推送..."
  git add "apps/web/data/daily/$DATE.json" >>"$LOG_FILE" 2>&1
  if git commit -m "chore(daily): add Daily Top for $DATE" >>"$LOG_FILE" 2>&1; then
    git push >>"$LOG_FILE" 2>&1 && log "已推送" || log "push 失败（可稍后手动 push）"
  else
    log "无改动可提交或 commit 失败"
  fi
fi

log "===== 结束 $DATE ====="
exit 0
