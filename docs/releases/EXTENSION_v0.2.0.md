# Tweet Quote Extension 0.2.0

> Chrome / Edge / Firefox 浏览器扩展发布说明。可整段复制到 [GitHub Releases](https://github.com/yangwenmai/tweetquote/releases) 的说明框中。

**引用链，一键成图** · 在 X/Twitter 一键打开侧栏使用 Tweet Quote；本版本在面板体验、国际化、模型与额度、后台 API 代理及构建配置上相对 0.1.0 全面升级。

---

## 功能

### 继承自 0.1.0

- **推文页快捷入口**：在推文详情页（`/status/...`）右下角显示「TQ」悬浮按钮
- **侧边面板**：右侧滑出，内嵌 Tweet Quote 并自动带入当前推文链接
- **支持站点**：`x.com`、`twitter.com`
- **快捷键**：面板打开时按 `Esc` 关闭

### 0.2.0 新增与改进

- **国际化（i18n）**：面板与文案支持多语言；**界面语言**与**输出/生成语言**可分别设置
- **模型与配置**：可在扩展内选择 **Provider（模型服务商）**，并提供 **重置** 等操作
- **额度与限流**：展示 **额度/配额**；用尽时明确提示，并尽可能展示 **重置/恢复时间**（依赖后端返回）
- **后台 API 代理**：通过 **Service Worker（background）** 转发 API 请求，缓解扩展场景下的 **CORS** 等问题（消息类型：`tweetquote.api-proxy`，实现见 `apps/extension/src/background` 与 panel 调用）
- **内容脚本与面板**：增强注入与交互；使用 **MutationObserver** 适配 X/Twitter 动态 DOM
- **图片导出**：集成 **html-to-image**，支持将编辑器/预览区域导出为图片

---

## 安装方式

### 使用 Release 附件（推荐）

1. 下载本 Release 中的 `tweetquote-extension-0.2.0.zip`（或对应附件）
2. 解压到本地目录
3. **Chrome / Edge**：打开 `chrome://extensions/` → 开启「开发者模式」→「加载已解压的扩展程序」→ 选择解压后的文件夹
4. **Firefox**：打开 `about:debugging#/runtime/this-firefox` →「临时载入附加组件」→ 选择解压目录中的 `manifest.json`

### 从源码构建（Monorepo）

在仓库根目录执行（以 `package.json` 为准）：

```bash
pnpm --filter @tweetquote/extension build
```

随后在 `apps/extension` 的构建输出目录按上述「加载已解压的扩展程序」加载。

---

## 技术说明

- Manifest V3
- **permissions**：`storage`
- **host_permissions**（生产清单 `apps/extension/public/manifest.json`）：
  - `https://x.com/*`
  - `https://twitter.com/*`
  - `https://tweetquote.app/*`
- 内容脚本仍仅在 X/Twitter 注入；API 优先经 **background 代理**访问
- 支持**开发 / 生产 / 测试**构建模式；API Base URL 通过环境文件配置；`build:test` 配合**环境变量白名单**，减少敏感信息误入扩展包
- 开发与生产 **manifest** 拆分，便于本地调试与正式发布；工程上与 monorepo 共享 **domain** 等包

> **自托管 API**：若 API 域名与上述 `host_permissions` 不一致，请按项目文档调整构建或清单。

---

## 从 0.1.0 升级

1. 若曾依赖面板内直连 API 的旧行为，请加载含 **background service worker** 的完整 0.2.0 构建；本版本优先通过 **background 代理**访问 API。
2. 若面板请求异常，请核对 **API Base URL** 是否与当前构建模式、环境文件一致。

---

## 注意事项

- 首次使用需确保能访问 Tweet Quote 线上服务（或你配置的自托管端点）
- 问题与建议欢迎在 [Issues](https://github.com/yangwenmai/tweetquote/issues) 反馈

---

## 相关链接

- 扩展包版本：`apps/extension/package.json` → `"version": "0.2.0"`
- 清单版本：`apps/extension/public/manifest.json` → `"version": "0.2.0"`
