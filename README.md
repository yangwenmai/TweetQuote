# TweetQuote

> **引用链，一键成图** · *One image, full context*

把 Twitter 推文引用链变成一张可分享的高清图片，支持翻译与 AI 智能注释。

🌐 [tweetquote.app](https://tweetquote.app)（规划中）

## 截图

| 主界面 | 导出预览 |
|--------|----------|
| ![主界面](screenshots/main.png) | ![导出](screenshots/export.png) |

## 快速开始

> 只需 Python 3（标准库即可，无需 pip install），3 步即可运行。

### 前置要求

- [Python 3.7+](https://www.python.org/downloads/)（macOS / Linux 通常已自带）
- 现代浏览器（Chrome / Edge / Safari / Firefox）

### 运行步骤

```bash
# 1. 克隆项目
git clone https://github.com/yangwenmai/tweetquote.git
cd tweetquote

# 2. （可选）复制并编辑环境变量
cp .env.local.example .env.local   # 如果有示例文件
# 或手动创建 .env.local，填入你的 API Key（见下方「配置」章节）

# 3. 启动本地服务
python3 server.py

# 4. 打开浏览器访问
#    http://localhost:8088/
```

启动成功后，终端会提示 `Serving on http://localhost:8088`，在浏览器打开即可使用。

## 功能特性

| 功能 | 说明 |
|------|------|
| 🔗 **链接自动抓取** | 粘贴推文链接，自动抓取完整引用链（需 [TwitterAPI.io](https://twitterapi.io) API Key） |
| ✏️ **手工录入** | 手动添加多层级推文，自由编辑 |
| 🌐 **翻译** | Google 翻译 / AI 翻译（OpenAI 兼容 API） |
| 🤖 **AI 智能注释** | 翻译时自动标注术语、俚语、文化背景等，悬停查看解释 |
| 📤 **导出 PNG** | 支持 1x/2x/3x 倍率导出高清图片 |
| 🌍 **中英切换** | 界面支持中文、英文 |

## 配置

### AI 翻译（可选）

在项目根目录创建 `.env.local`：

```env
LLM_PROVIDER=openai
OPENAI_API_KEY=sk-your-key
OPENAI_BASE_URL=https://api.openai.com/v1
OPENAI_MODEL=gpt-4o-mini
```

也支持 Aiberm、Ollama 等 OpenAI 兼容服务，只需修改 `OPENAI_BASE_URL`。

### TwitterAPI.io（可选）

用于链接自动抓取。可在 `.env.local` 中配置 `TWITTERAPI_KEY` 作为默认，或在界面顶部「TwitterAPI.io 配置」中填入 API Key。访问 [twitterapi.io](https://twitterapi.io) 获取 Key。

## 项目结构

```
tweetquote/
├── server.py          # 本地 HTTP 服务
├── index.html         # 主界面
├── screenshots/       # 项目截图
├── .env.local         # 环境变量（不提交）
├── docs/
│   └── FEATURES.md    # 详细功能文档
├── LICENSE            # MIT 开源协议
└── README.md
```

## 依赖

- **Python 3**：标准库，无需额外安装
- **html2canvas**：通过 CDN 加载，无需本地安装

## 常见问题

<details>
<summary><strong>Q: 启动报错 <code>python3: command not found</code></strong></summary>

请确认已安装 Python 3。运行 `python3 --version` 检查。如未安装，前往 [python.org](https://www.python.org/downloads/) 下载。macOS 也可用 `brew install python3`。
</details>

<details>
<summary><strong>Q: 页面空白 / 无法打开</strong></summary>

确认终端中 `server.py` 正在运行且无报错，然后在浏览器访问 `http://localhost:8088/`。如端口冲突，可在 `server.py` 中修改端口号。
</details>

<details>
<summary><strong>Q: 不配置 API Key 能用吗？</strong></summary>

可以。手动录入推文内容 + Google 翻译无需任何 Key。只有「链接自动抓取」和「AI 翻译/注释」需要对应的 API Key。
</details>

## 参与贡献

欢迎提交 Issue 和 Pull Request！

1. Fork 本仓库
2. 创建你的功能分支 (`git checkout -b feature/my-feature`)
3. 提交更改 (`git commit -m 'feat: add some feature'`)
4. 推送到分支 (`git push origin feature/my-feature`)
5. 提交 Pull Request

## 详细文档

更多功能说明、API 接口、技术栈等，请参阅：

- [docs/FEATURES.md](docs/FEATURES.md)
- [docs/DESIGN_BASELINE.md](docs/DESIGN_BASELINE.md) - 产品设计与交互基准

## License

[MIT](LICENSE) - 你可以自由使用、修改和分发本项目。
