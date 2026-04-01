# Tweet Quote Extension 0.3.0

> Chrome / Edge / Firefox 浏览器扩展发布说明。可整段复制到 [GitHub Releases](https://github.com/yangwenmai/tweetquote/releases) 的说明框中。

**引用链，一键成图** · 在 X/Twitter 一键打开侧栏使用 Tweet Quote；本版本最大亮点是 **推文媒体图片支持**——引用链中的图片自动提取并渲染到预览卡片，同时支持手动编辑媒体 URL；此外还包含自托管额度配置、日志安全加固与工程构建改进。

---

## 功能

### 继承自 0.2.0

- **推文页快捷入口**：在推文详情页（`/status/...`）右下角显示「TQ」悬浮按钮
- **侧边面板**：右侧滑出，内嵌 Tweet Quote 并自动带入当前推文链接
- **支持站点**：`x.com`、`twitter.com`
- **快捷键**：面板打开时按 `Esc` 关闭
- **国际化（i18n）**：界面语言与输出/生成语言可分别设置
- **模型与配置**：可选择 Provider（模型服务商），并提供重置等操作
- **额度与限流**：展示额度/配额；用尽时明确提示，并展示重置/恢复时间
- **后台 API 代理**：通过 Service Worker（background）转发 API 请求，缓解 CORS 等问题
- **图片导出**：集成 html-to-image，支持将编辑器/预览区域导出为图片

### 0.3.0 新增与改进

- **推文媒体图片**：抓取推文时自动识别并提取媒体 URL，同时清理 `t.co` 短链；QuotePreview 组件渲染推文附带的媒体图片，通过代理解决跨域问题
- **媒体 URL 编辑**：编辑器新增 `updateNodeMediaFromText` 命令，可在编辑器中手动修改媒体 URL；Web 编辑器与扩展面板同步提供媒体编辑字段
- **自托管额度可关闭**：支持通过配置禁用 Hosted Quota，方便本地开发和自建部署场景
- **日志脱敏**：新增 `redact` 工具，自动对日志中的敏感数据（API Key、Token 等）进行脱敏处理
- **randomUUID 兼容**：新增 `randomUUID` 函数，在非安全上下文（如扩展环境）下自动回退，统一 API / Web / Extension 调用
- **Source Exports**：内部包切换为源码直接导出，移除 dist 构建依赖，开发迭代更快
- **错误处理增强**：扩展面板改善错误提示与异常捕获

---

## 安装方式

### 使用 Release 附件（推荐）

1. 下载本 Release 中的 `tweetquote-extension-0.3.0.zip`（或对应附件）
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
- 内部包已切换为 **source exports**，无需预先构建 dist

> **自托管 API**：若 API 域名与上述 `host_permissions` 不一致，请按项目文档调整构建或清单。

---

## 从 0.2.0 升级

1. 内部包已切换为 source exports，运行 `npm install` 即可，**无需** 再执行 `npm run build` 来编译共享包。
2. 媒体图片功能开箱即用，无需额外配置。
3. 若使用自托管部署，可在 `.env.local` 中设置相应变量关闭 Hosted Quota。
4. 建议删除旧版扩展后重新加载 0.3.0 构建，以确保获取完整功能。

---

## 注意事项

- 首次使用需确保能访问 Tweet Quote 线上服务（或你配置的自托管端点）
- 问题与建议欢迎在 [Issues](https://github.com/yangwenmai/tweetquote/issues) 反馈

---

## 相关链接

- 扩展包版本：`apps/extension/package.json` → `"version": "0.3.0"`
- 清单版本：`apps/extension/public/manifest.json` → `"version": "0.3.0"`
