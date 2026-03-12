---
name: 翻译质量与批量方案
overview: 为 TweetQuote 设计一套兼顾翻译质量、批量处理、token 成本、速度和交互体验的改造方案。方案以最小改动接入现有数据结构与界面，同时为后续优化留出扩展点。
todos:
  - id: design-batch-contract
    content: 定义批量 AI 翻译接口的请求/响应结构、分批规则和部分成功语义
    status: completed
  - id: frontend-batch-state
    content: 设计并接入前端批量翻译状态、入口按钮、进度与失败汇总交互
    status: completed
  - id: quality-prompt-upgrade
    content: 重构 AI prompt 为共享上下文逐条输出模式，提升整链术语一致性
    status: completed
  - id: cost-control-rules
    content: 实现跳过未变更项、仅重试可重试错误、保留译文丢弃坏注释等节流策略
    status: completed
  - id: phase-validation
    content: 制定单条、批量、失败回退、长文本和多语言场景的验证清单
    status: completed
isProject: false
---

# 翻译质量与批量优化计划

## 目标

- 提升单条与整条引用链的翻译质量与术语一致性。
- 提供批量 AI 翻译能力，减少重复点击与重复 prompt 开销。
- 控制无效调用与 token 浪费，保持响应速度和界面反馈可预期。
- 在现有结构上渐进式改造，避免一次性引入过多复杂度。

## 现状与关键约束

- 前端当前是逐条触发翻译：`renderInputs()` 为每条内容渲染 `aiTranslateContent(idx)` 与 `translateContent(idx)`，位于 [index.html](/Users/w.yang/develop/yangwenmai/tweetquote/index.html)。
- 后端当前只有单条 AI 翻译接口：`/api/ai-translate` -> `proxy_ai_translate()`，位于 [server.py](/Users/w.yang/develop/yangwenmai/tweetquote/server.py)。
- 现有 prompt 固定且每条重复发送，重复消耗主要来自规则说明与 JSON 输出要求，而不是原文本身。
- 服务端当前使用 `HTTPServer` 单线程处理请求；即使前端并发提交，多条请求也会排队，位于 [server.py](/Users/w.yang/develop/yangwenmai/tweetquote/server.py)。
- 前端翻译状态主要通过直接改按钮文案实现，不适合批量进度、失败汇总、停止与重试。

## 总体方案

采用“双模式 + 分层优化”方案：

- 保留现有单条翻译，继续支持逐条精修。
- 新增“批量 AI 翻译”能力，面向整条引用链和“仅翻译未翻译项”。
- 批量接口使用“共享上下文、逐条输出”的结构，而不是把所有文本拼成一个大段结果。
- 服务端按批处理输入，但每条结果独立返回，支持部分成功、部分失败、定向重试。
- 质量优化优先通过 prompt 结构、目标语言控制、上下文传递和术语一致性来实现；性能优化优先通过跳过规则、合理分批、减少重绘和失败降级来实现。

## 架构设计

```mermaid
flowchart LR
  userAction[UserAction] --> batchEntry[batchTranslateEntry]
  batchEntry --> selectItems[selectEligibleItems]
  selectItems --> batchApi[/api/ai-translate-batch]
  batchApi --> planner[batchPlanner]
  planner --> llmCall[sharedContextLLMCall]
  llmCall --> validate[validateAndFilterAnnotations]
  validate --> mergeResults[mergeResultsIntoTweets]
  mergeResults --> uiState[renderProgressAndSummary]
```



## 具体改造点

### 1. 前端交互与状态层

目标文件：[index.html](/Users/w.yang/develop/yangwenmai/tweetquote/index.html)

在现有 `tweets` 数据结构上补充最小必要状态：

- 每条增加翻译任务状态字段，如 `translateStatus`、`translateError`、`lastTranslatedAt`、`dirty`。
- 新增全局批量状态，如 `batchRunning`、`batchTotal`、`batchDone`、`batchFailed`、`batchSkipped`、`batchMode`。

交互入口建议：

- 在输入区工具栏新增 `AI 翻译全部`。
- 增加 `仅翻译未翻译项` 作为默认批量模式，避免覆盖已有人工修订与重复调用。
- 批量运行时提供进度展示与 `停止批量`，结束后显示失败汇总，而不是逐条弹窗。
- 保留现有单条 `AI 翻译` 按钮，作为精修与重试入口。

前端行为策略：

- 批量只选择 `content` 非空且满足条件的项。
- 默认跳过已有 `translatedContent` 且未标记 `dirty` 的项。
- 原文修改后标记 `dirty`，而不是立即把用户可见状态变成“完全丢失”；在视觉上提示“译文已过期，建议重新翻译”。
- 将错误提示从 `alert()` 改为批量摘要或每条轻量状态提示，避免批量时连续弹窗。

### 2. 目标语言与质量控制

目标文件：[index.html](/Users/w.yang/develop/yangwenmai/tweetquote/index.html)、[server.py](/Users/w.yang/develop/yangwenmai/tweetquote/server.py)

当前翻译目标语言绑定 `currentLang`，这会让“切换界面语言”隐式改变翻译方向。计划改为：

- 单独引入翻译目标语言状态，例如 `translationTargetLang`。
- UI 允许明确选择翻译目标，而界面语言继续只负责界面文案。

质量优化重点：

- 批量时将整条引用链按顺序作为上下文传给模型，但要求模型逐条返回对应结果，避免上下文丢失。
- 在 prompt 中强调术语一致性、代词消解、上下文承接和“按 item id 对齐输出”。
- 保留“注释必须是译文中的精确子串”的约束，继续沿用前后端双重过滤，保证渲染稳定。
- 对简单句允许 0 注释，避免为了“显得智能”而产生噪声解释。

### 3. 批量接口与分批策略

目标文件：[server.py](/Users/w.yang/develop/yangwenmai/tweetquote/server.py)

新增接口：

- `POST /api/ai-translate-batch`

建议请求结构：

- `to`
- `items: [{ id, text, contextRole }]`
- 可选 `ai_api_key`、`ai_base_url`、`ai_model`
- 可选 `mode: all | untranslatedOnly | dirtyOnly`

建议返回结构：

- `items: [{ id, status, translation, annotations, error, usageHint }]`
- 支持部分成功；单条失败不拖垮整批。

分批与调度策略：

- 以“每批条数 + 总字符数”双阈值切分，而不是只按条数。
- 第一版建议每批 3 到 5 条，且总字符数保守控制，避免单次 prompt 过大拖慢延迟或拉高失败率。
- 服务端内部按批调用模型，但输出必须带 `id`，前端才能稳定写回原数组。
- 因当前服务端是单线程，第一版不要追求高并发；优先做稳定串行批次与部分成功。

### 4. 避免浪费调用与 token

目标文件：[index.html](/Users/w.yang/develop/yangwenmai/tweetquote/index.html)、[server.py](/Users/w.yang/develop/yangwenmai/tweetquote/server.py)

控制策略：

- 前端跳过空文本、已有译文且未失效项、已成功项，避免重复请求。
- 批量 prompt 共享一份规则说明，减少每条重复发送的 system/user 规则文本。
- 服务端对非常长的单条文本做保护，必要时拒绝或拆分，避免一次请求吞噬整批预算。
- 失败重试只针对可重试错误：超时、429、5xx、连接中断；4xx 和结构错误默认不重试。
- 当模型返回译文有效但注释结构不合法时，保留译文、丢弃注释，避免整条重试。
- 保留单条接口作为兜底，批量失败后可定向重试失败项，不需要整批重来。

### 5. 性能与体验优化

目标文件：[index.html](/Users/w.yang/develop/yangwenmai/tweetquote/index.html)、[server.py](/Users/w.yang/develop/yangwenmai/tweetquote/server.py)

体验优化：

- 批量过程中减少 `renderInputs()` 的全量频繁重绘，优先按批次或按阶段刷新。
- 批量完成后一次性汇总结果，并保留每条的成功/失败标记。
- 增加“重试失败项”和“停止当前批量”能力。

后端性能优化：

- 第一阶段先在现有 `HTTPServer` 上实现稳定批处理。
- 第二阶段可评估切换为 `ThreadingHTTPServer`，让单条与批量请求不互相完全阻塞，但这属于性能增强项，不作为第一版必需。

## 分阶段实施

### Phase 1：最小可用批量能力

- 前端新增 `AI 翻译全部` 与 `仅翻译未翻译项`。
- 后端新增 `/api/ai-translate-batch`。
- 批量使用共享上下文、逐条输出 JSON。
- 增加基础进度、跳过逻辑、失败汇总。

### Phase 2：质量与成本控制增强

- 解耦界面语言和翻译目标语言。
- 引入 `dirty` 状态与“译文已过期”提示。
- 完善 prompt，强化术语一致性与上下文处理。
- 增加可重试错误的有限重试与退避。

### Phase 3：性能与细节打磨

- 评估是否切换 `ThreadingHTTPServer`。
- 降低批量期间的 UI 重绘成本。
- 增加失败项定向重试和更清晰的结果摘要。

## 验收标准

- 单条翻译流程保持可用，不因批量改造退化。
- 批量可一键翻译整条引用链，并且默认跳过不需要重译的项。
- 同一引用链中的术语、称谓和代词译法更一致。
- 批量过程中不会出现连续弹窗轰炸或明显 UI 抖动。
- 单条失败不会导致整批失败，失败项可识别、可重试。
- token 浪费相较“逐条重复点 AI 翻译”明显下降，尤其是在 3 条以上引用链中。

