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
- **使用**：html2canvas 将 DOM 转为 canvas 再导出

### 6. 国际化

- **语言**：中文 / 英文切换
- **存储**：语言偏好保存在 localStorage

---

## API 接口

| 接口 | 方法 | 说明 |
|------|------|------|
| `/api/ai-config` | GET | 获取服务端 AI 配置状态（不暴露 Key） |
| `/api/twitter-config` | GET | 获取服务端 Twitter API 配置状态（不暴露 Key） |
| `/api/tweets` | GET | 代理 TwitterAPI.io 获取推文（需 `tweet_ids`，`api_key` 可选，缺省时用 `.env.local` 的 `TWITTERAPI_KEY`） |
| `/api/ai-translate` | POST | 代理 AI 翻译（含智能标注） |
| `/api/translate` | POST | 代理 Google 翻译 |

---

## 技术栈

- **前端**：纯 HTML + CSS + JavaScript，无框架
- **后端**：Python 3 标准库 `http.server`
- **依赖**：html2canvas（CDN）

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
```

---

## 文件结构

```
tweetquote/
├── server.py          # 本地服务器
├── index.html         # 主界面
├── .env.local         # 环境变量（不提交）
├── docs/
│   └── FEATURES.md    # 功能文档
└── history/           # 历史版本
```
