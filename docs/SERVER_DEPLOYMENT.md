# TweetQuote 服务器部署指南

> **占位符**：文中统一使用 `YOUR_PUBLIC_HOST` 表示公网 **IP 或域名**（仅主机名，不含 `http://`）。部署前请全文替换为你的实际地址，例如 `203.0.113.10` 或 `api.example.com`。
>
> 示例 API：`http://YOUR_PUBLIC_HOST:8787`  
> 示例 Web：`http://YOUR_PUBLIC_HOST:3000`

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
PUBLIC_API_BASE_URL=http://YOUR_PUBLIC_HOST:8787
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
| `PUBLIC_API_BASE_URL` | **推荐** | 服务器公网 API 地址，设为 `http://YOUR_PUBLIC_HOST:8787` |

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

API 依赖 workspace 包 `@tweetquote/domain`、`@tweetquote/telemetry`（运行时读其 `dist/`），需**先于或与 API 一并**构建。

```bash
# 推荐：在仓库根目录一次性构建全部 workspace（含依赖顺序）
npm run build

# 或仅构建 API 及其直接依赖
npm run build -w @tweetquote/domain -w @tweetquote/telemetry -w @tweetquote/api
```

编译 TypeScript，入口产物为 `apps/api/dist/server.js`（与 `npm run start` 一致）。

### 5.2 构建 Web

```bash
NEXT_PUBLIC_API_BASE_URL=http://YOUR_PUBLIC_HOST:8787 npm run build -w @tweetquote/web
```

> **重要**：`NEXT_PUBLIC_API_BASE_URL` 必须在 **build 阶段** 传入！  
> Next.js 会在构建时将 `NEXT_PUBLIC_*` 变量内联到客户端 JS 中，运行时设置无效。

构建失败（内存、OOM、`Bus error`、小内存 VPS、standalone 部署）见 **「十一、常见问题 → Web 构建与 VPS」**。

### 5.3 构建 Chrome 扩展

```bash
npm run build:test -w @tweetquote/extension
```

使用 `--mode test`，读取 `apps/extension/.env.test`：

```
VITE_TWEETQUOTE_API_BASE_URL=http://YOUR_PUBLIC_HOST:8787
```

产物在 `apps/extension/dist/`，下载到本地后在 Chrome 中加载即可。

### 5.4 一键构建全部

```bash
# API + Web 一起构建（Extension 需单独用 build:test）
NEXT_PUBLIC_API_BASE_URL=http://YOUR_PUBLIC_HOST:8787 npm run build -w @tweetquote/api -w @tweetquote/web

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

若 Web 使用 **standalone** 包部署（见「十一、Web 构建与 VPS」），则不要在仓库根目录执行 `next start`，改为在解压后的 **`…/apps/web`** 目录执行 `node server.js`，并设置 `HOSTNAME=0.0.0.0`、`PORT`、`NODE_ENV=production`。

### 方式 B：使用 pm2（推荐）

pm2 会在后台管理进程，崩溃自动重启，且支持开机自启。

> **必须先构建 API**：`start:api` 会运行 `node apps/api/dist/server.js`。若未执行过「五、构建」中的 `npm run build -w @tweetquote/api`，会出现 `Cannot find module '.../dist/server.js'`。从 git 拉代码后 `dist/` 默认不存在，每次部署或换机都要先 build。

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
curl http://YOUR_PUBLIC_HOST:8787/api/v1/health
# 预期返回：{"ok":true,"service":"tweetquote-api","port":8787}

# 运行时信息
curl http://YOUR_PUBLIC_HOST:8787/api/v1/runtime
# 预期包含：apiBaseUrl: "http://YOUR_PUBLIC_HOST:8787"

# Twitter 抓取配置检查
curl http://YOUR_PUBLIC_HOST:8787/api/twitter-config
# configured: true 表示 TWITTERAPI_KEY 已生效

# AI 翻译配置检查
curl http://YOUR_PUBLIC_HOST:8787/api/ai-config
# configured: true 表示 AI 相关 Key 已生效
```

### 7.2 验证 Web

浏览器访问 `http://YOUR_PUBLIC_HOST:3000`，能正常打开编辑器界面。

### 7.3 验证 Extension

1. 将服务器上 `apps/extension/dist/` 目录下载到本地
2. Chrome → 扩展程序 → 开启「开发者模式」→ 加载已解压的扩展程序 → 选择 `dist` 目录
3. 在 Twitter/X 页面使用插件，请求应发往 `http://YOUR_PUBLIC_HOST:8787`

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
NEXT_PUBLIC_API_BASE_URL=http://YOUR_PUBLIC_HOST:8787 npm run build -w @tweetquote/web

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
curl http://YOUR_PUBLIC_HOST:8787/api/v1/admin/session/{deviceId} \
  -H "x-admin-token: 你的ADMIN_TOKEN"
```

### 赠送额度

```bash
curl -X POST http://YOUR_PUBLIC_HOST:8787/api/v1/admin/quota/override \
  -H "x-admin-token: 你的ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"deviceId":"tq_xxx","bonusCredits":10,"note":"手动赠送"}'
```

### 设置 VIP 限额

```bash
curl -X POST http://YOUR_PUBLIC_HOST:8787/api/v1/admin/quota/override \
  -H "x-admin-token: 你的ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"deviceId":"tq_xxx","dailyLimit":50,"weeklyLimit":200,"note":"VIP 用户"}'
```

### 清空设备用量

```bash
curl -X DELETE http://YOUR_PUBLIC_HOST:8787/api/v1/admin/session/{deviceId}/usage \
  -H "x-admin-token: 你的ADMIN_TOKEN"
```

---

## 十、端口与地址汇总

| 组件 | 地址 | 用途 |
|------|------|------|
| API | `http://YOUR_PUBLIC_HOST:8787` | 后端接口（Fastify） |
| Web | `http://YOUR_PUBLIC_HOST:3000` | 前端编辑器（Next.js） |
| Extension | 本地安装，请求指向 API | Chrome 浏览器插件 |

### 各组件如何找到 API

| 组件 | 配置方式 | 配置位置 |
|------|----------|---------|
| API 自身 | `PUBLIC_API_BASE_URL` | 根目录 `.env.local` |
| Web | `NEXT_PUBLIC_API_BASE_URL`（构建时传入） | 构建命令的环境变量 |
| Extension（test） | `VITE_TWEETQUOTE_API_BASE_URL` | `apps/extension/.env.test` |

---

## 十一、常见问题

以下按主题分组；**与 VPS 资源、Web 构建相关**的说明集中在第一节，避免与正文「五、构建」重复。

### Web 构建与 VPS（内存、OOM、`Bus error`）

**推荐环境**：在 VPS 上完整执行根目录 `npm install` + `next build` 时，建议 **≥ 2GB 内存**，并保留 **1～2GB Swap** 作为缓冲；Node 建议 **20.x LTS**。Ubuntu / Debian 等与 **amd64** 或 **arm64** 搭配即可（VPS 常见为 Ubuntu，无兼容性问题）。

**如何判断是内存问题**：

- `dmesg | tail` 出现 **`oom-kill`**、`Killed process … (npm|node)` → 整机内存不足；
- `free -h` 显示可用内存长期接近于 0。

全仓库 monorepo 的 **`npm install` 峰值**与 **`next build`** 都较重；**512MB～1GB 级机器**即使加 Swap，仍可能不稳定。

**总体对策（按优先级）**

| 优先级 | 做法 | 说明 |
|--------|------|------|
| 1 | **升级 VPS 内存**（如 ≥ 2GB） | 最直接，同一台机上可继续 `npm install` + 构建 |
| 2 | **异地构建 + 仅部署 Web 产物** | 本仓库 Web 已启用 **`output: 'standalone'`**；在大内存环境构建后，将 standalone 打成包上传到 VPS，**VPS 上可不跑完整 `npm install`** 即可跑前端（仅需 Node） |
| 3 | **Docker 多阶段构建** | 在 CI/本机构镜像，VPS 只拉镜像运行 |

**`Bus error (core dumped)` / npm exit code 约 135**（构建阶段崩溃，未必在 dmesg 里先出现 OOM）：

1. 排除预加载库干扰，例如：  
   `env -u LD_PRELOAD NEXT_PUBLIC_API_BASE_URL=http://YOUR_PUBLIC_HOST:8787 npm run build -w @tweetquote/web`  
   或：`LD_PRELOAD="" NEXT_PUBLIC_API_BASE_URL=http://YOUR_PUBLIC_HOST:8787 npm run build -w @tweetquote/web`。
2. 确认内存与 Swap；可尝试：  
   `NODE_OPTIONS='--max-old-space-size=4096' NEXT_PUBLIC_API_BASE_URL=http://YOUR_PUBLIC_HOST:8787 npm run build -w @tweetquote/web`。
3. **勿将 macOS / Windows 上的 `node_modules` 整目录拷到 Linux**；应在目标 Linux 上执行 `npm install`，或改用 standalone/CI 在 **linux + 与 VPS 相同 CPU 架构** 下构建。
4. 核对 `uname -m` 与 Node 安装包架构一致；必要时在仓库根执行 `npm ls next @next/swc-linux-x64-gnu`（AMD64）或对应 ARM 包名排查。

**standalone 部署概要**（与 VPS 架构一致的前提下，在构建机执行）：

```bash
npm install
NEXT_PUBLIC_API_BASE_URL=http://YOUR_PUBLIC_HOST:8787 npm run build -w @tweetquote/web
./scripts/package-web-standalone.sh
cd apps/web/.next/standalone && tar czf ~/tweetquote-web-standalone.tar.gz .
```

上传到 VPS 解压后，在 **`…/apps/web`**（内含 `server.js`）执行：

```bash
HOSTNAME=0.0.0.0 PORT=3000 NODE_ENV=production node server.js
```

pm2 示例：`pm2 start server.js --name tweetquote-web --cwd /你的解压路径/apps/web`，并设置 `HOSTNAME`、`PORT`。

**构建机与 VPS 的关系**：standalone 须在 **与生产相同的 Linux 架构**（如均为 `x86_64`）上构建；可用另一台 Linux、**GitHub Actions（Ubuntu）** 或 `docker build --platform linux/amd64`。**不要在 macOS 上装好依赖后直接拷 `node_modules` 到 Ubuntu**——与「是否 Ubuntu」无关，是操作系统不同导致原生模块不匹配。

**API**：若同一台小内存机对 API 执行 `npm install` 仍 OOM，可改为 CI 产出 `apps/api/dist` 与镜像/同步策略，或随 Web 一并升级内存。

---

### API、pm2 与地址

**Q: pm2 报错 `Cannot find module '.../apps/api/dist/server.js'`？**  
说明 API 尚未编译。在 **monorepo 根目录**执行：

```bash
cd /path/to/tweetquote   # 例如 /root/tweetquote
npm install
npm run build   # 或见「五、构建」仅构建 domain、telemetry、api
test -f apps/api/dist/server.js || exit 1
pm2 restart tweetquote-api   # 或 delete 后按「六」重新 start
```

**Q: Web 能打开但请求不到 API？**  
构建 Web 时必须传入 `NEXT_PUBLIC_API_BASE_URL=http://YOUR_PUBLIC_HOST:8787`（构建时内联，运行时改环境变量无效）。修改后需重新 `npm run build -w @tweetquote/web` 并重启 Web。

**Q: 如何更换 API 端口？**  
启动时设置 `PORT`，并同步修改：`.env.local` 的 `PUBLIC_API_BASE_URL`、`apps/extension/.env.test` 的 `VITE_TWEETQUOTE_API_BASE_URL`，再重新构建 Web 与 Extension（`build:test`）。

---

### 运维与其它

**Q: 服务器重启后 pm2 进程没有恢复？**  
执行 `pm2 startup`，按终端提示再执行一条命令，然后 `pm2 save`。

**Q: 如何查看 API 日志？**  

```bash
pm2 logs tweetquote-api --lines 100
```

**Q: Extension 如何更新？**  
在服务器上 `npm run build:test -w @tweetquote/extension`，将 `apps/extension/dist/` 下载到本地，在 Chrome 扩展页点击「刷新」。
