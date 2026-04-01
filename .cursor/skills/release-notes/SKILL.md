---
name: release-notes
description: >-
  为 TweetQuote 项目编写版本发布说明（Release Notes）。遵循项目已有的行文风格、
  章节结构与命名规范。当用户提到 release、release notes、发布说明、写 release、
  打 tag、发版 时触发。
---

# TweetQuote Release Notes

为 TweetQuote 项目编写风格一致的 Release Notes。

## 工作流程

1. **收集变更**：运行 `git log --oneline <上一个tag/基线>..HEAD` 获取所有 commit
2. **分类整理**：按 feat / fix / chore / refactor / docs 分组
3. **读取上一版本 release notes**：从 `docs/releases/` 读取最近一版作为风格参照
4. **撰写新版 release notes**：严格遵循下方模板与风格规范
5. **写入文件**：保存到 `docs/releases/EXTENSION_v{VERSION}.md`

## 文件命名

```
docs/releases/EXTENSION_v{MAJOR}.{MINOR}.{PATCH}.md
```

示例：`EXTENSION_v0.3.0.md`

## 风格规范

| 规则 | 正确 | 错误 |
|------|------|------|
| 标题格式 | `# Tweet Quote Extension 0.3.0` | `# Tweet Quote v0.3.0` |
| 章节标题 | `## 功能` | `## ✨ 新功能`（不加 emoji） |
| 版本号 | `0.3.0`（无 v 前缀） | `v0.3.0` |
| 语言 | 中文为主，技术术语保留英文 | — |
| 粗体强调 | 功能名和关键术语用 `**粗体**` | — |
| 分隔线 | 每个 `##` 章节之间用 `---` 分隔 | — |

## 章节模板

```markdown
# Tweet Quote Extension {VERSION}

> Chrome / Edge / Firefox 浏览器扩展发布说明。可整段复制到 [GitHub Releases](https://github.com/yangwenmai/tweetquote/releases) 的说明框中。

**引用链，一键成图** · {一句话概括本版本亮点}

---

## 功能

### 继承自 {PREV_VERSION}

- {从上一版 release 继承的功能列表，保持简洁}

### {VERSION} 新增与改进

- **{功能名}**：{描述}
- ...

---

## 安装方式

### 使用 Release 附件（推荐）

1. 下载本 Release 中的 `tweetquote-extension-{VERSION}.zip`（或对应附件）
2. 解压到本地目录
3. **Chrome / Edge**：打开 `chrome://extensions/` → 开启「开发者模式」→「加载已解压的扩展程序」→ 选择解压后的文件夹
4. **Firefox**：打开 `about:debugging#/runtime/this-firefox` →「临时载入附加组件」→ 选择解压目录中的 `manifest.json`

### 从源码构建（Monorepo）

在仓库根目录执行（以 `package.json` 为准）：

\`\`\`bash
pnpm --filter @tweetquote/extension build
\`\`\`

随后在 `apps/extension` 的构建输出目录按上述「加载已解压的扩展程序」加载。

---

## 技术说明

- Manifest V3
- **permissions**：`storage`
- **host_permissions**（生产清单 `apps/extension/public/manifest.json`）：
  - `https://x.com/*`
  - `https://twitter.com/*`
  - `https://tweetquote.app/*`
- {本版本新增的技术要点}

> **自托管 API**：若 API 域名与上述 `host_permissions` 不一致，请按项目文档调整构建或清单。

---

## 从 {PREV_VERSION} 升级

1. {升级注意事项}
2. ...

---

## 注意事项

- 首次使用需确保能访问 Tweet Quote 线上服务（或你配置的自托管端点）
- 问题与建议欢迎在 [Issues](https://github.com/yangwenmai/tweetquote/issues) 反馈

---

## 相关链接

- 扩展包版本：`apps/extension/package.json` → `"version": "{VERSION}"`
- 清单版本：`apps/extension/public/manifest.json` → `"version": "{VERSION}"`
```

## 写作要点

- **继承自 X** 小节：从上一版 release notes 合并继承功能，不要逐版罗列，只保留一层
- **新增与改进** 小节：feat 和有用户感知的 fix/refactor 放在这里；纯 chore/docs 不单列
- **安装方式** 和 **注意事项**：保持固定模板，仅替换版本号
- **技术说明**：permissions 等固定部分保留，仅追加本版本新增的技术变化
- 参考文件：`docs/releases/EXTENSION_v0.2.0.md`
