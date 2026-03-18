# TweetQuote 服务器部署指南

> 服务器：`159.89.204.255`  
> API 地址：`http://159.89.204.255:8787`  
> Web 地址：`http://159.89.204.255:3000`

---

## 一、前置要求

| 项目 | 要求 |
|------|------|
| Node.js | **18+**（推荐 LTS） |
| npm | 9+（随 Node.js 安装） |
| Git | 用于克隆仓库 |
| pm2 | 推荐，用于进程守护 |

```bash
# 检查版本
node --version   # 应 >= v18
npm --version    # 应 >= 9

# 安装 pm2（如未安装）
npm install -g pm2
```

---

## 二、克隆与安装

```bash
# 1. 克隆仓库
git clone https://github.com/yangwenmai/tweetquote.git
cd tweetquote

# 2. 安装全部依赖（monorepo 会安装所有 apps 与 packages）
npm install
```

---

## 三、环境变量配置

在**项目根目录**创建 `.env.local`（与 `package.json` 同级），API 会在启动时自动读取此文件。

```bash
cat > .env.local << 'EOF'
# --- LLM Provider ---
LLM_PROVIDER=openai

# --- OpenAI / Aiberm (OpenAI-compatible) ---
OPENAI_API_KEY=sk-你的密钥
OPENAI_BASE_URL=https://aiberm.com/v1
OPENAI_MODEL=openai/gpt-5-nano

# --- Twitter 抓取 ---
TWITTERAPI_KEY=你的TwitterAPI密钥

# --- Admin ---
ADMIN_TOKEN=你的管理Token

# --- 重要：API 对外访问地址 ---
# 让 API 返回的 URL（如图片代理、分享链接等）使用正确的公网地址
PUBLIC_API_BASE_URL=http://159.89.204.255:8787
EOF
```

### 环境变量说明

| 变量 | 必需 | 说明 |
|------|------|------|
| `LLM_PROVIDER` | 可选 | AI 服务商类型，`openai` 兼容 Aiberm 等 |
| `OPENAI_API_KEY` | 可选 | AI 翻译/注释功能需要 |
| `OPENAI_BASE_URL` | 可选 | OpenAI 兼容服务的地址 |
| `OPENAI_MODEL` | 可选 | 使用的模型名称 |
| `TWITTERAPI_KEY` | 可选 | 推文链接自动抓取功能需要 |
| `ADMIN_TOKEN` | 可选 | Admin API 鉴权 Token |
| `PUBLIC_API_BASE_URL` | **推荐** | 服务器公网 API 地址，设为 `http://159.89.204.255:8787` |

---

## 四、初始化数据库

API 使用 SQLite（通过 Prisma）存储会话和配额数据，首次部署或 schema 变更后需执行：

```bash
npm run db:push -w @tweetquote/api
```

会在 `apps/api/prisma/dev.db` 创建/更新数据库文件。

---

## 五、构建

### 5.1 构建 API

```bash
npm run build -w @tweetquote/api
```

编译 TypeScript，产物输出到 `apps/api/dist/`。

### 5.2 构建 Web

```bash
NEXT_PUBLIC_API_BASE_URL=http://159.89.204.255:8787 npm run build -w @tweetquote/web
```

> **重要**：`NEXT_PUBLIC_API_BASE_URL` 必须在 **build 阶段** 传入！  
> Next.js 会在构建时将 `NEXT_PUBLIC_*` 变量内联到客户端 JS 中，运行时设置无效。

### 5.3 构建 Chrome 扩展

```bash
npm run build:test -w @tweetquote/extension
```

使用 `--mode test`，读取 `apps/extension/.env.test`：

```
VITE_TWEETQUOTE_API_BASE_URL=http://159.89.204.255:8787
```

产物在 `apps/extension/dist/`，下载到本地后在 Chrome 中加载即可。

### 5.4 一键构建全部

```bash
# API + Web 一起构建（Extension 需单独用 build:test）
NEXT_PUBLIC_API_BASE_URL=http://159.89.204.255:8787 npm run build -w @tweetquote/api -w @tweetquote/web

# Extension
npm run build:test -w @tweetquote/extension
```

---

## 六、启动服务

### 方式 A：直接启动（前台）

需要两个终端分别启动 API 和 Web。

**终端 1 — 启动 API：**

```bash
cd ~/tweetquote
npm run start:api
```

- 实际执行：`node dist/server.js`
- 监听地址：`http://0.0.0.0:8787`
- 默认端口 8787，可通过 `PORT` 环境变量覆盖

**终端 2 — 启动 Web：**

```bash
cd ~/tweetquote
npm run start:web
```

- 实际执行：`next start`
- 监听地址：`http://localhost:3000`
- 默认端口 3000，可通过 `PORT` 环境变量覆盖

### 方式 B：使用 pm2（推荐）

pm2 会在后台管理进程，崩溃自动重启，且支持开机自启。

```bash
cd ~/tweetquote

# 启动 API（端口 8787）
pm2 start npm --name "tweetquote-api" -- run start:api

# 启动 Web（端口 3000）
pm2 start npm --name "tweetquote-web" -- run start:web

# 保存进程列表（重启服务器后自动恢复）
pm2 save

# 设置开机自启
pm2 startup
```

#### pm2 常用命令

| 命令 | 说明 |
|------|------|
| `pm2 status` | 查看所有进程状态 |
| `pm2 logs` | 查看实时日志（所有进程） |
| `pm2 logs tweetquote-api` | 只看 API 日志 |
| `pm2 logs tweetquote-web` | 只看 Web 日志 |
| `pm2 restart all` | 重启全部 |
| `pm2 restart tweetquote-api` | 只重启 API |
| `pm2 stop all` | 停止全部 |
| `pm2 delete all` | 删除全部进程 |

---

## 七、验证部署

### 7.1 验证 API

```bash
# 健康检查
curl http://159.89.204.255:8787/api/v1/health
# 预期返回：{"ok":true,"service":"tweetquote-api","port":8787}

# 运行时信息
curl http://159.89.204.255:8787/api/v1/runtime
# 预期包含：apiBaseUrl: "http://159.89.204.255:8787"

# Twitter 抓取配置检查
curl http://159.89.204.255:8787/api/twitter-config
# configured: true 表示 TWITTERAPI_KEY 已生效

# AI 翻译配置检查
curl http://159.89.204.255:8787/api/ai-config
# configured: true 表示 AI 相关 Key 已生效
```

### 7.2 验证 Web

浏览器访问 `http://159.89.204.255:3000`，能正常打开编辑器界面。

### 7.3 验证 Extension

1. 将服务器上 `apps/extension/dist/` 目录下载到本地
2. Chrome → 扩展程序 → 开启「开发者模式」→ 加载已解压的扩展程序 → 选择 `dist` 目录
3. 在 Twitter/X 页面使用插件，请求应发往 `http://159.89.204.255:8787`

---

## 八、更新部署

代码更新后，按以下流程重新部署：

```bash
cd ~/tweetquote

# 1. 拉取最新代码
git pull

# 2. 安装依赖（有新依赖时必要）
npm install

# 3. 同步数据库（schema 有变更时）
npm run db:push -w @tweetquote/api

# 4. 重新构建
npm run build -w @tweetquote/api
NEXT_PUBLIC_API_BASE_URL=http://159.89.204.255:8787 npm run build -w @tweetquote/web

# 5. 重启服务
pm2 restart all

# 6.（可选）重新构建 Extension
npm run build:test -w @tweetquote/extension
```

---

## 九、Admin API 运维

所有 Admin 请求需携带 `x-admin-token` 头，值为 `.env.local` 中配置的 `ADMIN_TOKEN`。

### 查看设备配额

```bash
curl http://159.89.204.255:8787/api/v1/admin/session/{deviceId} \
  -H "x-admin-token: 你的ADMIN_TOKEN"
```

### 赠送额度

```bash
curl -X POST http://159.89.204.255:8787/api/v1/admin/quota/override \
  -H "x-admin-token: 你的ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"deviceId":"tq_xxx","bonusCredits":10,"note":"手动赠送"}'
```

### 设置 VIP 限额

```bash
curl -X POST http://159.89.204.255:8787/api/v1/admin/quota/override \
  -H "x-admin-token: 你的ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"deviceId":"tq_xxx","dailyLimit":50,"weeklyLimit":200,"note":"VIP 用户"}'
```

### 清空设备用量

```bash
curl -X DELETE http://159.89.204.255:8787/api/v1/admin/session/{deviceId}/usage \
  -H "x-admin-token: 你的ADMIN_TOKEN"
```

---

## 十、端口与地址汇总

| 组件 | 地址 | 用途 |
|------|------|------|
| API | `http://159.89.204.255:8787` | 后端接口（Fastify） |
| Web | `http://159.89.204.255:3000` | 前端编辑器（Next.js） |
| Extension | 本地安装，请求指向 API | Chrome 浏览器插件 |

### 各组件如何找到 API

| 组件 | 配置方式 | 配置位置 |
|------|----------|---------|
| API 自身 | `PUBLIC_API_BASE_URL` | 根目录 `.env.local` |
| Web | `NEXT_PUBLIC_API_BASE_URL`（构建时传入） | 构建命令的环境变量 |
| Extension（test） | `VITE_TWEETQUOTE_API_BASE_URL` | `apps/extension/.env.test` |

---

## 十一、常见问题

**Q: Web 页面打开但请求不到 API？**  
确认构建 Web 时是否传入了 `NEXT_PUBLIC_API_BASE_URL=http://159.89.204.255:8787`。此变量在构建时内联，运行时设置无效。需重新 build 后 restart。

**Q: 如何更换 API 端口？**  
启动时指定 `PORT` 环境变量即可，同时需更新：
1. `.env.local` 中的 `PUBLIC_API_BASE_URL`
2. `apps/extension/.env.test` 中的 `VITE_TWEETQUOTE_API_BASE_URL`
3. 重新构建 Web（传入新的 `NEXT_PUBLIC_API_BASE_URL`）
4. 重新构建 Extension（`npm run build:test`）

**Q: 服务器重启后服务没有自动恢复？**  
执行 `pm2 startup` 并按提示运行输出的命令，然后 `pm2 save`。

**Q: 如何查看 API 日志排查问题？**  
```bash
pm2 logs tweetquote-api --lines 100
```

**Q: Extension 如何更新？**  
服务器上重新 `npm run build:test -w @tweetquote/extension`，将 `dist/` 下载到本地，Chrome 扩展页面点击「刷新」。
