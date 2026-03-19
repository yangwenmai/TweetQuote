#!/usr/bin/env bash
# 在已完成 `npm run build -w @tweetquote/web` 的机器上执行：
# 将 `.next/static`（及可选 `public`）合并进 standalone，便于整目录打包上传到小内存 VPS。
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WEB="$ROOT/apps/web"
STAND="$WEB/.next/standalone/apps/web"

if [[ ! -f "$STAND/server.js" ]]; then
  echo "未找到 $STAND/server.js，请先在仓库根目录执行："
  echo "  NEXT_PUBLIC_API_BASE_URL=https://你的API npm run build -w @tweetquote/web"
  exit 1
fi

mkdir -p "$STAND/.next"
rm -rf "$STAND/.next/static"
cp -R "$WEB/.next/static" "$STAND/.next/static"

if [[ -d "$WEB/public" ]] && [[ -n "$(ls -A "$WEB/public" 2>/dev/null)" ]]; then
  rm -rf "$STAND/public"
  cp -R "$WEB/public" "$STAND/public"
fi

echo "已就绪: $STAND"
echo "本地试跑: cd \"$STAND\" && HOSTNAME=0.0.0.0 PORT=3000 NODE_ENV=production node server.js"
echo "打包示例: (cd \"$WEB/.next/standalone\" && tar czf /tmp/tweetquote-web-standalone.tar.gz .)"
