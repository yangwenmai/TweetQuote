# Tweet Quote Extension 0.1.0

> Chrome / Edge / Firefox 浏览器扩展发布说明。可整段复制到 [GitHub Releases](https://github.com/yangwenmai/tweetquote/releases) 的说明框中。

**引用链，一键成图** · 在 X/Twitter 浏览推文时，一键打开 [Tweet Quote](https://tweetquote.app) 把当前推文的引用链做成可分享的高清图片。

---

## 功能

- **推文页快捷入口**：在 X/Twitter 的推文详情页（`/status/...`）右下角显示「TQ」悬浮按钮
- **侧边面板**：点击后右侧滑出面板，内嵌 Tweet Quote 网页并自动带上当前推文链接，无需复制粘贴
- **支持站点**：`x.com`、`twitter.com`
- **快捷键**：面板打开时按 `Esc` 关闭

---

## 安装方式

1. 下载本 Release 中的 `tweetquote-extension-0.1.0.zip`（或对应附件）
2. 解压到本地目录
3. **Chrome / Edge**：打开 `chrome://extensions/` → 开启「开发者模式」→「加载已解压的扩展程序」→ 选择解压后的文件夹
4. **Firefox**：打开 `about:debugging#/runtime/this-firefox` →「临时载入附加组件」→ 选择解压目录中的 `manifest.json`

---

## 技术说明

- Manifest V3
- 仅在有权限的 `https://x.com/*`、`https://twitter.com/*` 下注入内容脚本
- 面板内为 iframe 加载线上 Tweet Quote 服务，当前版本使用生产 API

---

## 注意事项

- 首次使用需确保能访问 Tweet Quote 线上服务
- 此为首个公开版本，欢迎在 [Issues](https://github.com/yangwenmai/tweetquote/issues) 反馈问题或建议
