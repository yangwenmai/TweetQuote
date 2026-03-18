# TweetQuote 功能文档

## 产品定位

**TweetQuote**（品牌名：TweetQuote，域名：tweetquote.app）

> **Slogan**：引用链，一键成图 · *One image, full context*

**核心定位**：把 Twitter 推文引用链变成一张可分享的高清图片。

**一句话介绍**：把 Twitter 推文引用链变成一张可分享的高清图片，支持翻译与 AI 智能注释。

---

## 概述

TweetQuote 是面向 Twitter/X 推文引用链（Quote Chain）的可视化与导出工具。支持从链接自动抓取完整引用链、手工录入、多语言翻译、AI 智能注释，以及导出为 PNG 图片。

---

## 核心功能

### 1. 链接自动抓取

- **功能**：粘贴任意一条推文链接，自动抓取完整引用链（最多 10 层）
- **依赖**：TwitterAPI.io API Key（可在界面配置，或在 `.env.local` 中配置 `TWITTERAPI_KEY` 作为默认）
- **支持链接格式**：`https://x.com/user/status/123456` 或 `https://twitter.com/user/status/123456`
- **流程**：从最外层推文开始，递归解析 `quoted_tweet` 直至引用链结束

### 2. 手工录入

- **功能**：手动添加多层级推文，每层可填写：
  - 显示名称、@用户名
  - 头像 URL
  - 日期、阅读量
  - 推文内容
- **操作**：支持添加层级、移除最后一层

### 3. 翻译

- **Google 翻译**：调用 Google Translate 免费接口，支持自动检测源语言
- **AI 翻译**：调用 OpenAI 兼容 API，支持：
  - 自然翻译
  - 智能标注：对术语、俚语、习语、文化背景等做解释说明
  - 标注类型：学术术语、技术术语、俚语/网络用语、习语、文化背景、引用/典故

### 4. AI 配置

- **服务端**：通过 `.env.local` 配置 API Key、Base URL、模型
- **客户端**：可在界面手动输入覆盖（存储在 localStorage）
- **配置项**：`LLM_PROVIDER`、`OPENAI_API_KEY`、`OPENAI_BASE_URL`、`OPENAI_MODEL`

### 5. 预览与导出

- **实时预览**：左侧编辑，右侧实时渲染 Twitter 风格卡片
- **导出**：支持 1x、2x、3x 倍率导出 PNG

### 6. 国际化

- **语言**：中文 / 英文切换
- **存储**：语言偏好保存在 localStorage

### 7. 浏览器插件

- **MV3 Chrome 插件**：在 Twitter/X 页面上直接触发引用链抓取
- **内置面板**：插件内嵌编辑器面板，支持完整的抓取、编辑、翻译、导出流程

---

## API 接口

### V1 端点（新版 SaaS 接口）

| 接口 | 方法 | 说明 |
|------|------|------|
| `/api/v1/health` | GET | 服务健康检查 |
| `/api/v1/runtime` | GET | 获取 feature flags 和运行时配置 |
| `/api/v1/session/anonymous` | POST | 创建匿名会话 |
| `/api/v1/quota/:deviceId` | GET | 获取配额快照 |
| `/api/v1/quote/fetch` | POST | 抓取推文引用链文档 |
| `/api/v1/translation/translate` | POST | 翻译单条文本 |
| `/api/v1/translation/batch` | POST | 批量翻译 |
| `/api/v1/document/save` | POST | 保存文档 |
| `/api/v1/document/:id` | GET | 获取已保存文档 |
| `/api/v1/export/jobs` | POST | 创建导出任务 |
| `/api/v1/assets/image` | GET | 图片代理 |

### 管理端点（Admin API，需 `ADMIN_TOKEN` 鉴权）

| 接口 | 方法 | 说明 |
|------|------|------|
| `/api/v1/admin/session/:deviceId` | GET | 查看设备会话详情和当前配额 |
| `/api/v1/admin/quota/override` | POST | 设置单设备配额覆盖（dailyLimit / weeklyLimit / bonusCredits / note） |
| `/api/v1/admin/session/:deviceId/usage` | DELETE | 清空指定设备的所有用量记录 |

### 兼容端点（过渡期保留）

| 接口 | 方法 | 说明 |
|------|------|------|
| `/api/session` | GET | 获取会话信息 |
| `/api/ai-config` | GET | 获取服务端 AI 配置状态（不暴露 Key） |
| `/api/twitter-config` | GET | 获取服务端 Twitter API 配置状态（不暴露 Key） |
| `/api/quote-chain/render` | POST | 抓取并渲染引用链 |
| `/api/translate` | POST | Google 翻译 |
| `/api/translate-batch` | POST | Google 批量翻译 |
| `/api/ai-translate` | POST | AI 翻译（含智能标注） |
| `/api/ai-translate-batch` | POST | AI 批量翻译（含智能标注） |

---

## 技术栈

- **前端**：Next.js + React + TypeScript
- **后端**：Fastify + Prisma（SQLite）
- **插件**：Chrome MV3 Extension
- **共享包**：Zod schema、SDK、UI 组件、编辑器核心、渲染核心
- **包管理**：npm workspaces（monorepo）

---

## 环境变量

`.env.local` 示例：

```env
LLM_PROVIDER=openai
OPENAI_API_KEY=sk-xxx
OPENAI_BASE_URL=https://api.openai.com/v1
OPENAI_MODEL=gpt-4o-mini

# 推文抓取（可选，配置后界面可不填 API Key）
TWITTERAPI_KEY=your-twitterapi-key

# 管理接口鉴权（配额管理 Admin API）
ADMIN_TOKEN=your-secret-admin-token
```

---

## 文件结构

```
tweetquote/
├── apps/
│   ├── api/             # Fastify API 服务
│   │   ├── src/
│   │   │   ├── server.ts        # 服务入口和路由
│   │   │   └── lib/             # 环境配置、存储、翻译等
│   │   └── prisma/
│   │       └── schema.prisma    # 数据库 schema
│   ├── web/             # Next.js Web 编辑器
│   │   ├── app/                 # 页面路由
│   │   └── components/editor/   # 编辑器组件
│   └── extension/       # MV3 浏览器插件
├── packages/
│   ├── domain/          # 共享 schema 和领域模型
│   ├── editor-core/     # 编辑命令和草稿工具
│   ├── render-core/     # 预览摘要和渲染选择器
│   ├── sdk/             # API 客户端和插件桥接类型
│   ├── ui/              # 共享 UI 组件
│   ├── config/          # 运行时配置和 feature flags
│   └── telemetry/       # 日志和性能钩子
├── landing/             # 营销落地页
├── legacy/              # V1 旧版归档
├── docs/                # 文档
├── .env.local           # 环境变量（不提交）
└── package.json         # Monorepo 根配置
```
