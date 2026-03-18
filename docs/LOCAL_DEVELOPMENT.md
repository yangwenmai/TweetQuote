# TweetQuote 本地运行操作指引

本文档说明如何在本地克隆、安装并运行 TweetQuote 的 API、Web 编辑器和浏览器插件。

---

## 一、前置要求

| 项目 | 要求 |
|------|------|
| Node.js | **18+**（推荐 LTS） |
| npm | 9+（随 Node.js 安装） |
| Git | 用于克隆仓库 |

检查版本：

```bash
node --version   # 应 >= v18
npm --version    # 应 >= 9
```

---

## 二、克隆与安装

```bash
# 1. 克隆仓库
git clone https://github.com/yangwenmai/tweetquote.git
cd tweetquote

# 2. 安装依赖（monorepo 会安装所有 apps 与 packages）
npm install
```

---

## 三、环境变量（可选）

API 从**项目根目录**的 `.env.local` 读取配置。不创建该文件也可运行，但部分功能需要配置后才有：

- **链接自动抓取**：需 `TWITTERAPI_KEY`
- **AI 翻译 / 智能注释**：需 `LLM_PROVIDER`、`OPENAI_API_KEY` 等

### 创建 .env.local

若仓库中有 `.env.local.example`，可复制后按需修改：

```bash
cp .env.local.example .env.local
```

若无该示例文件，在项目根目录新建 `.env.local`，按需添加（以下为示例，未列出的项可不写）：

```env
# 可选：AI 翻译 / 注释（OpenAI 兼容）
LLM_PROVIDER=openai
OPENAI_API_KEY=sk-your-key
OPENAI_BASE_URL=https://api.openai.com/v1
OPENAI_MODEL=gpt-4o-mini

# 可选：推文链接自动抓取
TWITTERAPI_KEY=your-twitterapi-key

# 可选：生产/代理场景下 API 对外地址（本地开发一般不需要）
# PUBLIC_API_BASE_URL=https://your-api.example.com
```

说明：

- 支持 Aiberm、Ollama 等 OpenAI 兼容服务，修改 `OPENAI_BASE_URL` 即可。
- TwitterAPI.io 的 Key 也可在 Web 界面「高级设置」中填写，不必写进 `.env.local`。

---

## 四、数据库（可选）

API 使用 SQLite 存储部分数据。若需使用依赖数据库的功能，需先初始化：

```bash
npm run db:push -w @tweetquote/api
```

会在 `apps/api/prisma/dev.db` 创建/更新数据库。若暂时不用相关功能，可跳过此步。

---

## 五、启动服务

项目为 monorepo，**API** 与 **Web** 需分别启动（两个终端）。

### 5.1 启动 API（必选）

```bash
npm run dev:api
```

- 默认地址：**http://localhost:8787**
- 看到类似 `Listening at http://0.0.0.0:8787` 即表示成功。

### 5.2 启动 Web 编辑器（必选）

```bash
npm run dev:web
```

- 默认地址：**http://localhost:3000**
- 浏览器打开该地址即可使用编辑器；本地会默认请求 `http://localhost:8787` 的 API。

### 5.3 启动浏览器插件开发（可选）

若需开发或调试 Chrome 插件：

```bash
npm run dev:extension
```

- 会监听源码变更并持续构建到 `apps/extension/dist/`。
- 在 Chrome 中加载「解压的扩展」并选择 `apps/extension/dist` 目录即可；开发时 API 会使用 `http://localhost:8787`。

---

## 六、验证

1. **API**：浏览器访问 http://localhost:8787 ，应看到 API 的欢迎或健康信息（视实现而定）。
2. **Web**：访问 http://localhost:3000 ，能打开编辑器并手工录入/编辑推文即表示前后端联通正常。
3. **无 API Key**：不配置任何 Key 也可使用「手工录入 + Google 翻译」；只有「链接自动抓取」和「AI 翻译/注释」需要对应 Key。

---

## 七、常用命令速查

| 命令 | 说明 |
|------|------|
| `npm install` | 安装全部依赖 |
| `npm run dev:api` | 启动 API（端口 8787） |
| `npm run dev:web` | 启动 Web 编辑器（端口 3000） |
| `npm run dev:extension` | 监听并构建浏览器插件 |
| `npm run build` | 构建全部应用与包 |
| `npm run typecheck` | 全工作区 TypeScript 类型检查 |
| `npm run db:push -w @tweetquote/api` | 初始化/同步 API 的 SQLite |
| `npm run start -w @tweetquote/api` | 运行 API 生产构建 |
| `npm run start -w @tweetquote/web` | 运行 Web 生产构建 |

---

## 八、配额管理（Admin API）

TweetQuote 支持通过 Admin API 对单个设备的试用配额做灵活调整，无需修改代码或重启服务。

### 8.1 启用 Admin API

在 `.env.local` 中配置管理 Token：

```env
ADMIN_TOKEN=your-secret-admin-token
```

重启 API 后即可使用以下接口（所有请求需携带 `x-admin-token` 头）。

### 8.2 查看设备配额详情

```bash
curl http://localhost:8787/api/v1/admin/session/tq_02019b8468e044fb9b77b41c8a8c695d \
  -H "x-admin-token: your-secret-admin-token"
```

返回设备的会话信息（含 override 字段）和当前配额快照。

### 8.3 给设备增加额度

```bash
# 赠送 10 次 bonus（不受日/周窗口限制，用完即止）
curl -X POST http://localhost:8787/api/v1/admin/quota/override \
  -H "x-admin-token: your-secret-admin-token" \
  -H "Content-Type: application/json" \
  -d '{"deviceId":"tq_02019b8468e044fb9b77b41c8a8c695d","bonusCredits":10,"note":"手动赠送"}'
```

### 8.4 设置自定义日/周限额

```bash
# 给某设备设成 VIP：每天 50 次、每周 200 次
curl -X POST http://localhost:8787/api/v1/admin/quota/override \
  -H "x-admin-token: your-secret-admin-token" \
  -H "Content-Type: application/json" \
  -d '{"deviceId":"tq_02019b8468e044fb9b77b41c8a8c695d","dailyLimit":50,"weeklyLimit":200,"note":"VIP 用户"}'
```

恢复全局默认：把 `dailyLimit` / `weeklyLimit` 设为 `null`。

```bash
curl -X POST http://localhost:8787/api/v1/admin/quota/override \
  -H "x-admin-token: your-secret-admin-token" \
  -H "Content-Type: application/json" \
  -d '{"deviceId":"tq_02019b8468e044fb9b77b41c8a8c695d","dailyLimit":null,"weeklyLimit":null}'
```

### 8.5 清空设备用量

```bash
curl -X DELETE http://localhost:8787/api/v1/admin/session/tq_02019b8468e044fb9b77b41c8a8c695d/usage \
  -H "x-admin-token: your-secret-admin-token"
```

### 8.6 字段说明

| 字段 | 类型 | 说明 |
|------|------|------|
| `dailyLimit` | `number \| null` | 每日限额覆盖，`null` 表示跟随全局默认（3） |
| `weeklyLimit` | `number \| null` | 每周限额覆盖，`null` 表示跟随全局默认（20） |
| `bonusCredits` | `number` | 额外赠送次数，日/周配额耗尽后仍可使用，直到 bonus 也用完 |
| `note` | `string` | 管理备注，仅运营可见 |

---

## 九、常见问题

**Q: 报错 `Cannot find module`**  
先执行 `npm install`。若仍报错，可删除根目录及各子项目下的 `node_modules` 和 `package-lock.json`，再重新 `npm install`。

**Q: API 启动失败**  
确认 Node 版本 ≥ 18（`node --version`）。若使用到 Prisma/数据库，需先执行 `npm run db:push -w @tweetquote/api`。

**Q: Web 无法连接 API**  
确认 API 已用 `npm run dev:api` 启动，且运行在 8787 端口。Web 在开发模式下默认使用 `http://localhost:8787`。

**Q: 不配置 API Key 能否使用？**  
可以。仅「链接自动抓取」和「AI 翻译/注释」需要对应 Key；手工录入与 Google 翻译无需 Key。

**Q: `.env.local` 要放在哪里？**  
必须放在**项目根目录**（与 `package.json`、`apps/` 同级），API 会从这里读取。

---

## 十、相关文档

- [ARCHITECTURE.md](./ARCHITECTURE.md) — 架构设计  
- [FEATURES.md](./FEATURES.md) — 功能说明  
- [DESIGN_BASELINE.md](./DESIGN_BASELINE.md) — 产品与交互设计  
