"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  type AppLanguage,
  type QuotaSnapshot,
  type QuoteDocument,
  type TranslationDisplay,
  type TranslationProvider,
} from "@tweetquote/domain";
import {
  addLayer as appendLayer,
  applyNodeTranslation,
  collectBatchItems,
  removeLastLayer,
  resetDocumentDraft,
  restoreDraftDocument,
  storageKeys,
  updateDocumentLanguage,
  updateDocumentProvider,
  updateDocumentScale,
  updateDocumentTranslationDisplay,
  updateDocumentTitle,
  updateNodeField,
} from "@tweetquote/editor-core";
import { getDocumentSummary } from "@tweetquote/render-core";
import { TweetQuoteApiClient } from "@tweetquote/sdk";
import { Button, QuotePreview } from "@tweetquote/ui";

const apiBaseUrl =
  process.env.NEXT_PUBLIC_API_BASE_URL?.trim() || (process.env.NODE_ENV === "production" ? "https://tweetquote.app" : "http://localhost:8787");
const runtimeEnv = globalThis as typeof globalThis & { __TQ_ENV__?: Record<string, string | undefined> };
runtimeEnv.__TQ_ENV__ = {
  ...(runtimeEnv.__TQ_ENV__ || {}),
  NEXT_PUBLIC_API_BASE_URL: apiBaseUrl,
};
const api = new TweetQuoteApiClient({
  baseUrl: apiBaseUrl,
});

const DEFAULT_TWEET_URL = "https://x.com/MaiYangAI/status/2032647419339608574?s=20";

type BusyState =
  | { kind: "idle" }
  | { kind: "fetch" }
  | { kind: "translate-node"; index: number; provider: TranslationProvider }
  | { kind: "translate-batch"; provider: TranslationProvider; completed: number; total: number }
  | { kind: "save" }
  | { kind: "export" };

type ActivityItem = {
  id: string;
  text: string;
};

function formatActivity(text: string) {
  const time = new Date().toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  return `${time} ${text}`;
}

function getProviderLabel(provider: TranslationProvider) {
  return provider === "ai" ? "AI" : provider === "google" ? "Google" : "Manual";
}

function formatLayerLog(
  layer: { index: number; relation: "root" | "quote" | "reply"; authorName: string; authorHandle: string },
  language: AppLanguage,
) {
  const relationLabel =
    layer.relation === "root"
      ? language === "en"
        ? "Root Tweet"
        : "主推文"
      : layer.relation === "reply"
        ? language === "en"
          ? "Reply"
          : "回复"
        : language === "en"
          ? "Quote"
          : "引用";
  const author =
    layer.authorName || layer.authorHandle
      ? `${layer.authorName || "Unknown"}${layer.authorHandle ? ` (@${layer.authorHandle.replace(/^@/, "")})` : ""}`
      : language === "en"
        ? "Unknown author"
        : "未知作者";
  return language === "en" ? `Layer ${layer.index + 1}: ${relationLabel} by ${author}` : `第 ${layer.index + 1} 层：${relationLabel} · ${author}`;
}

export function EditorApp() {
  const previewRef = useRef<HTMLDivElement | null>(null);
  const [deviceId, setDeviceId] = useState("");
  const [language, setLanguage] = useState<AppLanguage>("zh-CN");
  const [provider, setProvider] = useState<TranslationProvider>("none");
  const [twitterApiKey, setTwitterApiKey] = useState("");
  const [aiBaseUrl, setAiBaseUrl] = useState("");
  const [aiApiKey, setAiApiKey] = useState("");
  const [aiModel, setAiModel] = useState("");
  const [tweetUrl, setTweetUrl] = useState(DEFAULT_TWEET_URL);
  const [mode, setMode] = useState<"auto" | "manual">("auto");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [document, setDocument] = useState<QuoteDocument>(() => resetDocumentDraft());
  const [quota, setQuota] = useState<QuotaSnapshot | null>(null);
  const [busy, setBusy] = useState<BusyState>({ kind: "idle" });
  const [message, setMessage] = useState("");
  const [activities, setActivities] = useState<ActivityItem[]>([]);

  useEffect(() => {
    const cachedDeviceId = window.localStorage.getItem(storageKeys.webDeviceId) || "";
    const restored = restoreDraftDocument(window.localStorage.getItem(storageKeys.webDraft));
    const cachedLanguage = window.localStorage.getItem(storageKeys.translationTargetLanguage);
    if (restored) {
      setDocument(restored);
      setLanguage(restored.renderSpec.language);
      setProvider(restored.renderSpec.translationProvider);
    } else if (cachedLanguage === "zh-CN" || cachedLanguage === "en") {
      setLanguage(cachedLanguage);
    } else {
      window.localStorage.removeItem(storageKeys.webDraft);
    }
    setTwitterApiKey(window.localStorage.getItem(storageKeys.twitterApiKey) || "");
    setAiBaseUrl(window.localStorage.getItem(storageKeys.aiBaseUrl) || "");
    setAiApiKey(window.localStorage.getItem(storageKeys.aiApiKey) || "");
    setAiModel(window.localStorage.getItem(storageKeys.aiModel) || "");
    api
      .createAnonymousSession(cachedDeviceId)
      .then((session) => {
        setDeviceId(session.deviceId);
        setQuota(session.quota);
        window.localStorage.setItem(storageKeys.webDeviceId, session.deviceId);
      })
      .catch((error: Error) => {
        setMessage(error.message);
      });
  }, []);

  useEffect(() => {
    window.localStorage.setItem(storageKeys.webDraft, JSON.stringify(document));
  }, [document]);

  useEffect(() => {
    window.localStorage.setItem(storageKeys.translationTargetLanguage, language);
  }, [language]);

  function pushActivity(text: string) {
    setActivities((current) => [{ id: crypto.randomUUID(), text: formatActivity(text) }, ...current].slice(0, 12));
  }

  const documentSummary = useMemo(() => getDocumentSummary(document), [document]);
  const hasContent = document.nodes.some(
    (node) => node.content.trim() || node.author.name.trim() || node.author.handle.trim() || node.translation.text.trim(),
  );
  const translationTotal = document.nodes.filter((node) => node.content.trim()).length;
  const translationDone = document.nodes.filter((node) => node.translation.text.trim()).length;
  const hasTranslatableContent = translationTotal > 0;
  const hasTranslations = translationDone > 0;
  const twitterApiReady = Boolean(twitterApiKey.trim());
  const aiReady = Boolean(aiApiKey.trim());
  const isFetchBusy = busy.kind === "fetch";
  const isSaveBusy = busy.kind === "save";
  const isExportBusy = busy.kind === "export";
  const isBatchBusy = busy.kind === "translate-batch";
  const activeNodeIndex = busy.kind === "translate-node" ? busy.index : -1;
  const activeNodeProvider = busy.kind === "translate-node" ? busy.provider : null;
  const ui =
    language === "en"
      ? {
          switchLanguage: "中文",
          loadExample: "Example",
          reset: "Reset",
          settings: "Settings",
          autoMode: "🔗 Auto Fetch",
          manualMode: "✏️ Manual Input",
          hostedTitle: "Use it directly without configuring keys",
          hostedDesc: `Hosted fetch quota: ${quota?.dailyTotal ?? 3}/day and ${quota?.weeklyTotal ?? 20}/week. Remaining today ${quota?.dailyRemaining ?? "-"}, this week ${quota?.weeklyRemaining ?? "-"}. Paste a tweet URL, confirm it, then click Fetch. Advanced users can still bring their own keys.`,
          hostedBadge: quota ? `Today ${quota.dailyRemaining}/${quota.dailyTotal}\nWeek ${quota.weeklyRemaining}` : "Loading",
          installExtension: "Install Chrome Extension",
          openAdvancedSettings: "Open Advanced Settings",
          autoHint: "Paste any tweet URL, confirm it, then fetch the full quote chain",
          autoFetch: isFetchBusy ? "Fetching..." : "Fetch",
          addLayer: "+ Add Layer",
          removeLayer: "- Remove Last Layer",
          translationSection: "Optional Translation",
          translationTarget: "Target Language",
          batchGoogle: "🌐 Batch Translate",
          batchAi: "🤖 Batch AI Translate",
          retryFailed: "Retry Failed",
          stopBatch: "Stop Batch",
          batchNote: "Keep the original text by default. Only translate when you really need EN/ZH conversion.",
          batchIdle: "Fetch or edit first, then translate only if the source language and target language differ.",
          authorName: "Display Name",
          authorHandle: "@Handle",
          avatarUrl: "Avatar URL",
          createdAt: "Date",
          viewCount: "Views",
          content: "Tweet Content",
          translateGoogle: "Google Translate",
          translateAi: "AI Translate",
          translationResult: "Translation Result",
          translationDisplay: "Translation Display",
          translationDisplayReplace: "Replace original by default",
          translationDisplayBilingual: "Show bilingual",
          exportScale: "Export Scale",
          exportPng: "Export as PNG",
          exportHintEmpty: "Fetch or fill content first, then export PNG.",
          saveDraft: "Save Draft",
          preview: "Preview",
          previewEmpty: "Paste a tweet URL on the left to fetch automatically, or switch to manual input",
          settingsSectionTwitter: "🧪 Advanced Mode: Your TwitterAPI Key",
          settingsSectionAi: "🧪 Advanced Mode: Your AI Key",
          settingsSectionDocument: "Document & Output",
          twitterApiKey: "TwitterAPI Key",
          twitterApiPlaceholder: "Enter your API Key...",
          twitterApiConfigured: "✓ Configured",
          twitterApiMissing: "Not configured - use hosted trial or manual editing by default",
          aiBaseUrl: "AI Base URL",
          aiApiKey: "AI API Key",
          aiModel: "AI Model",
          aiConfigured: "✓ Configured",
          aiMissing: "Not configured - rely on hosted AI or fetch original text only by default",
          outputLanguage: "Output Language",
          documentTitle: "Document Title",
          translationProvider: "Optional Auto-Translate After Fetch",
          clearSettings: "Clear Settings",
          settingsHint: "Leave advanced settings empty unless you want to use your own Twitter API or AI keys.",
          translationCoverage: translationTotal ? `Translated ${translationDone}/${translationTotal}` : "No translated content yet",
          close: "Close",
          themeMessageCleared: "Advanced settings cleared",
          messageSaveSuccess: "Draft saved",
          messageSaveFailed: "Save failed",
          messageExportSuccess: "PNG exported",
          messageExportFailed: "Export failed",
          messageReset: "Reset to a new blank draft",
          messageNoBatchItems: "No translatable content",
          messageBatchDone: (count: number) => `Batch translated ${count} items`,
          messageBatchFailed: "Batch translation failed",
          messageTranslateFailed: "Translation failed",
          messageFetchFailed: "Fetch failed",
          settingsTitle: "Settings",
          activityTitle: "Activity Log",
          activityEmpty: "No recent activity",
        }
      : {
          switchLanguage: "EN",
          loadExample: "载入示例",
          reset: "清空",
          settings: "设置",
          autoMode: "🔗 链接自动抓取",
          manualMode: "✏️ 手工录入",
          hostedTitle: "普通用户直接用，不用先配 Key",
          hostedDesc: `托管抓取额度为每天 ${quota?.dailyTotal ?? 3} 次、每周 ${quota?.weeklyTotal ?? 20} 次。当前今日剩余 ${quota?.dailyRemaining ?? "-"} 次，本周剩余 ${quota?.weeklyRemaining ?? "-"} 次。粘贴推文链接、确认无误后再点击「一键抓取」；高级用户也可以自带 Key。`,
          hostedBadge: quota ? `今日 ${quota.dailyRemaining}/${quota.dailyTotal}\n本周 ${quota.weeklyRemaining}` : "加载中",
          installExtension: "安装 Chrome 插件",
          openAdvancedSettings: "打开高级设置",
          autoHint: "粘贴任意一条推文链接，确认无误后点击「一键抓取」获取完整引用链",
          autoFetch: isFetchBusy ? "一键抓取中" : "一键抓取",
          addLayer: "+ 添加层级",
          removeLayer: "- 移除最后一层",
          translationSection: "按需翻译（可选）",
          translationTarget: "翻译目标",
          batchGoogle: "🌐 批量翻译",
          batchAi: "🤖 批量 AI 翻译",
          retryFailed: "重试失败项",
          stopBatch: "停止此批量",
          batchNote: "默认保留原文。只有在你确实需要中英互译时，再手动触发翻译。",
          batchIdle: "先抓取或编辑原文；只有原文和目标语言不一致时，才需要翻译。",
          authorName: "显示名称",
          authorHandle: "@用户名",
          avatarUrl: "头像 URL",
          createdAt: "日期",
          viewCount: "浏览量",
          content: "推文内容",
          translateGoogle: "Google 翻译",
          translateAi: "AI 翻译",
          translationResult: "翻译结果",
          translationDisplay: "译文显示",
          translationDisplayReplace: "默认用译文替换原文",
          translationDisplayBilingual: "双语显示",
          exportScale: "导出倍率",
          exportPng: "导出为 PNG",
          exportHintEmpty: "请先抓取或填写内容，再导出 PNG。",
          saveDraft: "保存草稿",
          preview: "预览",
          previewEmpty: "左侧可粘贴推文链接自动抓取，或切换到手工录入",
          settingsSectionTwitter: "🧪 高级模式：自带 TwitterAPI Key",
          settingsSectionAi: "🧪 高级模式：自带 AI Key",
          settingsSectionDocument: "文档与输出",
          twitterApiKey: "TwitterAPI Key",
          twitterApiPlaceholder: "输入你的 API Key...",
          twitterApiConfigured: "✓ 已配置",
          twitterApiMissing: "未配置 — 默认使用托管试用或手工录入",
          aiBaseUrl: "AI Base URL",
          aiApiKey: "AI API Key",
          aiModel: "AI 模型",
          aiConfigured: "✓ 已配置",
          aiMissing: "未配置 — 默认依赖服务端托管 AI 或仅抓取原文",
          outputLanguage: "输出语言",
          documentTitle: "文档标题",
          translationProvider: "抓取后自动翻译（可选）",
          clearSettings: "清空配置",
          settingsHint: "只有在你想使用自己的 Twitter API 或 AI Key 时，才需要填写高级设置。",
          translationCoverage: translationTotal ? `已翻译 ${translationDone}/${translationTotal}` : "当前还没有译文",
          close: "关闭",
          themeMessageCleared: "已清空高级配置",
          messageSaveSuccess: "草稿已保存",
          messageSaveFailed: "保存失败",
          messageExportSuccess: "PNG 已导出",
          messageExportFailed: "导出失败",
          messageReset: "已重置为新的空白草稿",
          messageNoBatchItems: "没有可翻译的推文内容",
          messageBatchDone: (count: number) => `已完成 ${count} 条批量翻译`,
          messageBatchFailed: "批量翻译失败",
          messageTranslateFailed: "翻译失败",
          messageFetchFailed: "抓取失败",
          settingsTitle: "设置",
          activityTitle: "进度日志",
          activityEmpty: "暂无操作日志",
        };
  const previewSummary = hasTranslations ? ui.translationCoverage : documentSummary.subtitle;

  function loadExample() {
    setMode("manual");
    setDocument({
      ...resetDocumentDraft(),
      title: language === "en" ? "OpenClaw Discussion Example" : "OpenClaw 讨论示例",
      nodes: [
        {
          id: "example-1",
          relation: "root",
          depth: 0,
          sourceTweetId: "example-1",
          author: {
            name: "Mai Yang",
            handle: "@MaiYangAI",
            avatarUrl: "https://pbs.twimg.com/profile_images/2027602364073709576/5L4TUTHt_400x400.jpg",
            isVerified: false,
          },
          content:
            "非常认同刘飞老师的观点。\n\n刚好今天中午跟朋友吃饭，我也表达了类似的观点。\n\n玩龙虾🦞可以，但是你去研究是为了挖掘你的副业还是为了玩而玩？我自己也玩了几天，确实能有一些价值，帮助你检索，完成对应任务，但是对于普通人来说，你没有场景何来现在有了龙虾🦞就有了场景？\n\n刘飞老师提炼的观点非常齐全，推荐大家自省。",
          createdAt: "Mar 9",
          viewCount: 194,
          media: [],
          translation: {
            provider: "none",
            status: "idle",
            language,
            text: "",
            annotations: [],
            error: "",
            version: 0,
          },
        },
        {
          id: "example-2",
          relation: "quote",
          depth: 1,
          sourceTweetId: "example-2",
          author: {
            name: "刘飞",
            handle: "@liufeilufy",
            avatarUrl: "https://pbs.twimg.com/profile_images/1497935790961139714/zrClIfkW_400x400.jpg",
            isVerified: false,
          },
          content:
            "调研了一阵子 OpenClaw 的使用案例（身边朋友，微信群，社交媒体等等），也体验了一下，感受跟之前的很类似：\n\n对于本来就有自己业务的，尤其是商业闭环的，才用得更好，也更愿意充值，因为真的能省事儿，带来生产力，很快就能正向循环。以开发者、自媒体、投资人和小企业老板为主。\n\n对于很多在创业或者作为牛马想搞副业的朋友，想从零开始用 OpenClaw 干拔一个有价值的生意，难度极大，概率极低。\n\n对于多数案例看起来，还是当玩具居多。充值都用免费渠道的 tokens，整天研究省钱，研究怎么让龙虾表演节目什么的，很快就觉得没劲了。\n\n新技术不等于产品价值。还是得有场景有工作流，才有价值。只会说「你自己去学习一下，帮我开发一个会火的 APP」是肯定一定没意义的。",
          createdAt: "9:15 AM · Mar 9, 2026",
          viewCount: 54500,
          media: [],
          translation: {
            provider: "none",
            status: "idle",
            language,
            text: "",
            annotations: [],
            error: "",
            version: 0,
          },
        },
      ],
      renderSpec: {
        ...resetDocumentDraft().renderSpec,
        language,
        translationProvider: provider,
      },
    });
    setMessage("");
  }

  async function handleFetch() {
    if (!tweetUrl.trim() || busy.kind !== "idle") return;
    setBusy({ kind: "fetch" });
    setMessage("");
    pushActivity(language === "en" ? "Started fetching the quote chain" : "开始抓取引用链");
    try {
      pushActivity(language === "en" ? "Request sent, waiting for server response" : "抓取请求已发出，等待服务端返回");
      const response = await api.fetchQuoteDocument({
        tweetUrl,
        targetLanguage: language,
        translationProvider: provider,
        includeAnnotations: true,
        apiKey: twitterApiKey || undefined,
        aiApiKey: aiApiKey || undefined,
        aiBaseUrl: aiBaseUrl || undefined,
        aiModel: aiModel || undefined,
        source: "web",
        deviceId,
      });
      setDocument(response.document);
      setLanguage(response.document.renderSpec.language);
      setProvider(response.document.renderSpec.translationProvider);
      setQuota(response.quota);
      setMode("manual");
      response.meta.layers.forEach((layer) => {
        pushActivity(formatLayerLog(layer, language));
      });
      pushActivity(
        language === "en" ? `Fetch finished with ${response.document.nodes.length} layers` : `抓取完成，共 ${response.document.nodes.length} 层`,
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : ui.messageFetchFailed);
      pushActivity(language === "en" ? "Fetch failed" : "抓取失败");
    } finally {
      setBusy({ kind: "idle" });
    }
  }

  async function translateNode(index: number, nextProvider: TranslationProvider) {
    const node = document.nodes[index];
    if (!node?.content) return;
    setBusy({ kind: "translate-node", index, provider: nextProvider });
    setMessage("");
    pushActivity(
      language === "en"
        ? `Started ${getProviderLabel(nextProvider)} translation for layer ${index + 1}`
        : `开始用 ${getProviderLabel(nextProvider)} 翻译第 ${index + 1} 层`,
    );
    try {
      const response = await api.translateText({
        text: node.content,
        targetLanguage: language,
        provider: nextProvider,
        aiApiKey: aiApiKey || undefined,
        aiBaseUrl: aiBaseUrl || undefined,
        aiModel: aiModel || undefined,
      });
      setDocument((current) => applyNodeTranslation(current, node.id, response.artifact));
      setMessage(
        language === "en"
          ? `${getProviderLabel(nextProvider)} translation finished for layer ${index + 1}`
          : `${getProviderLabel(nextProvider)} 已完成第 ${index + 1} 层翻译`,
      );
      pushActivity(
        language === "en"
          ? `Layer ${index + 1} translation finished`
          : `第 ${index + 1} 层翻译完成`,
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : ui.messageTranslateFailed);
      pushActivity(
        language === "en"
          ? `Layer ${index + 1} translation failed`
          : `第 ${index + 1} 层翻译失败`,
      );
    } finally {
      setBusy({ kind: "idle" });
    }
  }

  async function translateAll(nextProvider: TranslationProvider) {
    const items = collectBatchItems(document);
    if (!items.length) {
      setMessage(ui.messageNoBatchItems);
      return;
    }

    setBusy({ kind: "translate-batch", provider: nextProvider, completed: 0, total: items.length });
    setMessage(language === "en" ? `Translating 0/${items.length}` : `正在翻译 0/${items.length}`);
    pushActivity(
      language === "en"
        ? `Started ${getProviderLabel(nextProvider)} batch translation for ${items.length} items`
        : `开始用 ${getProviderLabel(nextProvider)} 批量翻译，共 ${items.length} 条`,
    );
    try {
      for (const [index, item] of items.entries()) {
        setBusy({ kind: "translate-batch", provider: nextProvider, completed: index, total: items.length });
        setMessage(language === "en" ? `Translating ${index}/${items.length}` : `正在翻译 ${index}/${items.length}`);
        const response = await api.translateText({
          text: item.text,
          targetLanguage: language,
          provider: nextProvider,
          aiApiKey: aiApiKey || undefined,
          aiBaseUrl: aiBaseUrl || undefined,
          aiModel: aiModel || undefined,
        });
        setDocument((current) => applyNodeTranslation(current, item.id, response.artifact));
        setBusy({ kind: "translate-batch", provider: nextProvider, completed: index + 1, total: items.length });
        setMessage(language === "en" ? `Translating ${index + 1}/${items.length}` : `正在翻译 ${index + 1}/${items.length}`);
        pushActivity(
          language === "en"
            ? `Translated ${index + 1}/${items.length}`
            : `已完成 ${index + 1}/${items.length} 条翻译`,
        );
      }
      setMessage(ui.messageBatchDone(items.length));
      pushActivity(language === "en" ? "Batch translation finished" : "批量翻译完成");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : ui.messageBatchFailed);
      pushActivity(language === "en" ? "Batch translation failed" : "批量翻译失败");
    } finally {
      setBusy({ kind: "idle" });
    }
  }

  function updateNode(index: number, key: "content" | "name" | "handle" | "avatarUrl" | "createdAt" | "viewCount", value: string) {
    setDocument((current) => updateNodeField(current, index, key, value));
  }

  function addLayer() {
    setDocument((current) => appendLayer(current));
  }

  function removeLayer() {
    setDocument((current) => removeLastLayer(current));
  }

  function resetDocument() {
    const fresh = resetDocumentDraft();
    setDocument(fresh);
    setTweetUrl(DEFAULT_TWEET_URL);
    setMode("auto");
    setMessage(ui.messageReset);
  }

  function updateTitle(value: string) {
    setDocument((current) => updateDocumentTitle(current, value));
  }

  function updateRenderLanguage(nextLanguage: AppLanguage) {
    setLanguage(nextLanguage);
    setDocument((current) => updateDocumentLanguage(current, nextLanguage));
  }

  function updateRenderScale(scale: number) {
    setDocument((current) => updateDocumentScale(current, scale));
  }

  function updateTranslationDisplay(translationDisplay: TranslationDisplay) {
    setDocument((current) => updateDocumentTranslationDisplay(current, translationDisplay));
  }

  function clearSettings() {
    setTwitterApiKey("");
    setAiBaseUrl("");
    setAiApiKey("");
    setAiModel("");
    setProvider("none");
    setDocument((current) => updateDocumentProvider(current, "none"));
    window.localStorage.removeItem(storageKeys.twitterApiKey);
    window.localStorage.removeItem(storageKeys.aiBaseUrl);
    window.localStorage.removeItem(storageKeys.aiApiKey);
    window.localStorage.removeItem(storageKeys.aiModel);
    setSettingsOpen(false);
    setMessage(ui.themeMessageCleared);
  }

  async function saveDocument() {
    setBusy({ kind: "save" });
    setMessage("");
    pushActivity(language === "en" ? "Saving draft" : "正在保存草稿");
    try {
      const saved = await api.saveDocument(document);
      setDocument(saved);
      setMessage(ui.messageSaveSuccess);
      pushActivity(language === "en" ? "Draft saved" : "草稿已保存");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : ui.messageSaveFailed);
      pushActivity(language === "en" ? "Save failed" : "保存失败");
    } finally {
      setBusy({ kind: "idle" });
    }
  }

  async function exportDocument() {
    setBusy({ kind: "export" });
    setMessage("");
    pushActivity(language === "en" ? "Preparing PNG export" : "开始准备导出 PNG");
    try {
      if (!previewRef.current) {
        throw new Error("预览区域不可用");
      }

      const { toBlob } = await import("html-to-image");
      const blob = await toBlob(previewRef.current, {
        cacheBust: true,
        pixelRatio: Math.max(1, document.renderSpec.exportScale),
        backgroundColor: "#ffffff",
        imagePlaceholder:
          "data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='40' height='40' viewBox='0 0 40 40'%3E%3Crect width='40' height='40' rx='20' fill='%23E1E8ED'/%3E%3C/svg%3E",
      });
      if (!blob) {
        throw new Error(ui.messageExportFailed);
      }
      const downloadUrl = window.URL.createObjectURL(blob);
      const link = window.document.createElement("a");
      link.download = `${document.title || "tweet-quote"}.png`;
      link.href = downloadUrl;
      window.document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(downloadUrl);
      setMessage(ui.messageExportSuccess);
      pushActivity(language === "en" ? "PNG exported" : "PNG 导出成功");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : ui.messageExportFailed);
      pushActivity(language === "en" ? "PNG export failed" : "PNG 导出失败");
    } finally {
      setBusy({ kind: "idle" });
    }
  }

  return (
    <>
      <div className="editor-main">
        <div className="app-header">
          <div className="app-header-left">
            <img
              src="https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTiHIZuDb--IJ-q5d97gWm1W2eyLj7BePcWnQ&s"
              height={40}
              width={40}
              alt="Tweet Quote"
            />
            <span>Tweet Quote</span>
          </div>
          <div className="app-header-actions">
            <Button tone="ghost" onClick={() => updateRenderLanguage(language === "zh-CN" ? "en" : "zh-CN")}>
              {ui.switchLanguage}
            </Button>
            <Button tone="ghost" onClick={loadExample} disabled={isFetchBusy || isBatchBusy || isSaveBusy || isExportBusy}>
              {ui.loadExample}
            </Button>
            <Button tone="ghost" onClick={resetDocument} disabled={isFetchBusy || isBatchBusy || isSaveBusy || isExportBusy}>
              {ui.reset}
            </Button>
            <Button tone="ghost" onClick={() => setSettingsOpen(true)}>
              {ui.settings}
            </Button>
          </div>
        </div>

        <div className="editor-grid">
          <div className="panel-left">
            <div className="mode-tabs">
              <button className={`mode-tab ${mode === "auto" ? "active" : ""}`} onClick={() => setMode("auto")}>
                {ui.autoMode}
              </button>
              <button className={`mode-tab ${mode === "manual" ? "active" : ""}`} onClick={() => setMode("manual")}>
                {ui.manualMode}
              </button>
            </div>

            {mode === "auto" ? (
              <>
                <div className="hosted-card">
                  <div className="hosted-card-header">
                    <div>
                      <div className="hosted-card-title">{ui.hostedTitle}</div>
                      <div className="hosted-card-desc">{ui.hostedDesc}</div>
                    </div>
                    <div className="hosted-card-badge" style={{ whiteSpace: "pre-line" }}>
                      {ui.hostedBadge}
                    </div>
                  </div>
                  <div className="hosted-card-actions">
                    <Button
                      onClick={() => window.open("https://chrome.google.com/webstore", "_blank", "noopener,noreferrer")}
                      style={{ background: "#1d9bf0", borderColor: "#1d9bf0", color: "#fff" }}
                    >
                      {ui.installExtension}
                    </Button>
                    <Button tone="ghost" onClick={() => setSettingsOpen(true)} style={{ color: "#1d9bf0", borderColor: "rgba(29, 155, 240, 0.26)" }}>
                      {ui.openAdvancedSettings}
                    </Button>
                  </div>
                </div>

                <div className="auto-section">
                  <div className="section-label">{ui.autoHint}</div>
                  <div className="auto-row">
                    <input
                      type="url"
                      autoComplete="off"
                      value={tweetUrl}
                      onChange={(event) => setTweetUrl(event.target.value)}
                      placeholder={DEFAULT_TWEET_URL}
                    />
                    <Button onClick={handleFetch} disabled={!tweetUrl.trim() || busy.kind !== "idle"}>
                      {ui.autoFetch}
                    </Button>
                  </div>
                </div>
              </>
            ) : (
              <div className="section-card" style={{ marginBottom: 16 }}>
                <div className="row">
                  <Button tone="ghost" onClick={addLayer} disabled={isFetchBusy || isBatchBusy || isSaveBusy || isExportBusy}>
                    {ui.addLayer}
                  </Button>
                  <Button
                    tone="ghost"
                    onClick={removeLayer}
                    disabled={document.nodes.length <= 1 || isFetchBusy || isBatchBusy || isSaveBusy || isExportBusy}
                  >
                    {ui.removeLayer}
                  </Button>
                </div>
              </div>
            )}

            {message ? (
              <div className="muted" style={{ marginBottom: 12, fontSize: 13 }}>
                {message}
              </div>
            ) : null}

            <div
              className="section-card"
              style={{ marginBottom: 16, display: "grid", gap: 8, maxHeight: 180, overflow: "auto" }}
            >
              <div className="section-label">{ui.activityTitle}</div>
              {activities.length ? (
                activities.map((activity) => (
                  <div key={activity.id} className="muted" style={{ fontSize: 13, lineHeight: 1.5 }}>
                    {activity.text}
                  </div>
                ))
              ) : (
                <div className="muted" style={{ fontSize: 13 }}>
                  {ui.activityEmpty}
                </div>
              )}
            </div>

            {(mode === "manual" || hasContent) && (
              <div className="input-area">
                {document.nodes.map((node, index) => (
                  <div className="tweet-block" key={node.id}>
                    <div className="block-title">{index === 0 ? "第 1 层 · 主推文" : `第 ${index + 1} 层 · 引用`}</div>
                    <div className="stack">
                      <div className="row">
                        <label className="field">
                          <span>{ui.authorName}</span>
                          <input value={node.author.name} onChange={(event) => updateNode(index, "name", event.target.value)} />
                        </label>
                        <label className="field">
                          <span>{ui.authorHandle}</span>
                          <input value={node.author.handle} onChange={(event) => updateNode(index, "handle", event.target.value)} />
                        </label>
                      </div>
                      <div className="row">
                        <label className="field">
                          <span>{ui.avatarUrl}</span>
                          <input value={node.author.avatarUrl || ""} onChange={(event) => updateNode(index, "avatarUrl", event.target.value)} />
                        </label>
                        <label className="field">
                          <span>{ui.createdAt}</span>
                          <input value={node.createdAt} onChange={(event) => updateNode(index, "createdAt", event.target.value)} />
                        </label>
                      </div>
                      <label className="field">
                        <span>{ui.viewCount}</span>
                        <input value={node.viewCount === null ? "" : String(node.viewCount)} onChange={(event) => updateNode(index, "viewCount", event.target.value)} />
                      </label>
                      <label className="field">
                        <span>{ui.content}</span>
                        <textarea value={node.content} onChange={(event) => updateNode(index, "content", event.target.value)} />
                      </label>
                      <div className="row">
                        <Button
                          tone="ghost"
                          onClick={() => translateNode(index, "google")}
                          disabled={busy.kind !== "idle" || !node.content.trim()}
                        >
                          {activeNodeIndex === index && activeNodeProvider === "google"
                            ? language === "en"
                              ? "Google Translating..."
                              : "Google 翻译中..."
                            : ui.translateGoogle}
                        </Button>
                        <Button
                          tone="ghost"
                          onClick={() => translateNode(index, "ai")}
                          disabled={busy.kind !== "idle" || !node.content.trim()}
                        >
                          {activeNodeIndex === index && activeNodeProvider === "ai"
                            ? language === "en"
                              ? "AI Translating..."
                              : "AI 翻译中..."
                            : ui.translateAi}
                        </Button>
                      </div>
                      {node.translation.text ? (
                        <label className="field">
                          <span>{ui.translationResult}</span>
                          <textarea value={node.translation.text} readOnly />
                        </label>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="translation-card">
              <div className="translation-head">
                <span>{ui.translationSection}</span>
                <div className="row" style={{ gap: 8 }}>
                  <select value={language} onChange={(event) => updateRenderLanguage(event.target.value as AppLanguage)}>
                    <option value="zh-CN">{language === "en" ? "Chinese" : "中文"}</option>
                    <option value="en">English</option>
                  </select>
                  <select
                    aria-label={ui.translationDisplay}
                    value={document.renderSpec.translationDisplay}
                    onChange={(event) => updateTranslationDisplay(event.target.value as TranslationDisplay)}
                  >
                    <option value="replace">{ui.translationDisplayReplace}</option>
                    <option value="bilingual">{ui.translationDisplayBilingual}</option>
                  </select>
                </div>
              </div>
              <div className="translation-actions">
                <Button tone="ghost" onClick={() => translateAll("google")} disabled={busy.kind !== "idle" || !hasTranslatableContent}>
                  {isBatchBusy && busy.provider === "google"
                    ? language === "en"
                      ? `Google ${busy.completed}/${busy.total}`
                      : `Google ${busy.completed}/${busy.total}`
                    : ui.batchGoogle}
                </Button>
                <Button tone="ghost" onClick={() => translateAll("ai")} disabled={busy.kind !== "idle" || !hasTranslatableContent}>
                  {isBatchBusy && busy.provider === "ai"
                    ? language === "en"
                      ? `AI ${busy.completed}/${busy.total}`
                      : `AI ${busy.completed}/${busy.total}`
                    : ui.batchAi}
                </Button>
                <Button tone="ghost" disabled>
                  {ui.retryFailed}
                </Button>
                <Button tone="ghost" disabled style={{ color: "#e0245e", borderColor: "#f0c7d1" }}>
                  {ui.stopBatch}
                </Button>
              </div>
              <div className="translation-note">{hasTranslatableContent ? ui.batchNote : ui.batchIdle}</div>
            </div>

            <div className="export-section">
              <div className="section-label">{ui.exportScale}</div>
              <div className="export-row">
                {[1, 2, 3].map((scale) => (
                  <button
                    key={scale}
                    type="button"
                    className={`scale-btn ${document.renderSpec.exportScale === scale ? "active" : ""}`}
                    onClick={() => updateRenderScale(scale)}
                  >
                    {scale}x
                  </button>
                ))}
              </div>
              <Button className="primary-export" onClick={exportDocument} disabled={busy.kind !== "idle" || !hasContent}>
                {isExportBusy ? (language === "en" ? "Exporting..." : "导出中...") : ui.exportPng}
              </Button>
              {!hasContent ? (
                <div className="muted" style={{ marginTop: 8, fontSize: 13 }}>
                  {ui.exportHintEmpty}
                </div>
              ) : null}
              <div className="secondary-actions">
                <Button tone="ghost" onClick={saveDocument} disabled={busy.kind !== "idle"}>
                  {isSaveBusy ? (language === "en" ? "Saving..." : "保存中...") : ui.saveDraft}
                </Button>
              </div>
            </div>
          </div>

          <div className="panel-right">
            <div className="preview-wrap">
              <div className="preview-label">{ui.preview}</div>
              <div className="preview-panel">
                <div className="muted" style={{ marginBottom: 12, fontSize: 13 }}>
                  {hasContent ? previewSummary : ui.previewEmpty}
                </div>
                {hasContent ? (
                  <div ref={previewRef}>
                    <QuotePreview document={document} />
                  </div>
                ) : (
                  <div
                    style={{
                      minHeight: 220,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      color: "#536471",
                      fontSize: 15,
                    }}
                  >
                    {ui.previewEmpty}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
      <div className={`settings-overlay ${settingsOpen ? "open" : ""}`} onClick={(event) => event.target === event.currentTarget && setSettingsOpen(false)}>
        <div className="settings-drawer">
          <div className="toolbar">
            <strong>{ui.settingsTitle}</strong>
            <Button tone="ghost" onClick={() => setSettingsOpen(false)}>
              {ui.close}
            </Button>
          </div>
          <div className="settings-section">
            <div className="settings-section-title">{ui.settingsSectionTwitter}</div>
            <label className="field">
              <span>{ui.twitterApiKey}</span>
              <input
                type="password"
                value={twitterApiKey}
                placeholder={ui.twitterApiPlaceholder}
                onChange={(event) => {
                  const value = event.target.value;
                  setTwitterApiKey(value);
                  if (value) {
                    window.localStorage.setItem(storageKeys.twitterApiKey, value);
                  } else {
                    window.localStorage.removeItem(storageKeys.twitterApiKey);
                  }
                }}
              />
            </label>
            <div className={`settings-status ${twitterApiReady ? "ok" : ""}`}>
              {twitterApiReady ? ui.twitterApiConfigured : ui.twitterApiMissing}
            </div>
          </div>
          <div className="settings-section">
            <div className="settings-section-title">{ui.settingsSectionAi}</div>
            <label className="field">
              <span>{ui.aiBaseUrl}</span>
              <input
                value={aiBaseUrl}
                placeholder="https://api.openai.com/v1"
                onChange={(event) => {
                  const value = event.target.value;
                  setAiBaseUrl(value);
                  if (value) {
                    window.localStorage.setItem(storageKeys.aiBaseUrl, value);
                  } else {
                    window.localStorage.removeItem(storageKeys.aiBaseUrl);
                  }
                }}
              />
            </label>
            <label className="field">
              <span>{ui.aiApiKey}</span>
              <input
                type="password"
                value={aiApiKey}
                placeholder="AI API Key"
                onChange={(event) => {
                  const value = event.target.value;
                  setAiApiKey(value);
                  if (value) {
                    window.localStorage.setItem(storageKeys.aiApiKey, value);
                  } else {
                    window.localStorage.removeItem(storageKeys.aiApiKey);
                  }
                }}
              />
            </label>
            <label className="field">
              <span>{ui.aiModel}</span>
              <input
                value={aiModel}
                placeholder="gpt-4o-mini"
                onChange={(event) => {
                  const value = event.target.value;
                  setAiModel(value);
                  if (value) {
                    window.localStorage.setItem(storageKeys.aiModel, value);
                  } else {
                    window.localStorage.removeItem(storageKeys.aiModel);
                  }
                }}
              />
            </label>
            <div className={`settings-status ${aiReady ? "ok" : ""}`}>
              {aiReady ? ui.aiConfigured : ui.aiMissing}
            </div>
          </div>
          <div className="settings-section">
            <div className="settings-section-title">{ui.settingsSectionDocument}</div>
            <label className="field">
              <span>{ui.outputLanguage}</span>
              <select value={language} onChange={(event) => updateRenderLanguage(event.target.value as AppLanguage)}>
                <option value="zh-CN">{language === "en" ? "Chinese" : "中文"}</option>
                <option value="en">English</option>
              </select>
            </label>
            <label className="field">
              <span>{ui.documentTitle}</span>
              <input value={document.title} onChange={(event) => updateTitle(event.target.value)} />
            </label>
            <label className="field">
              <span>{ui.translationProvider}</span>
              <select
                value={provider}
                onChange={(event) => {
                  const nextProvider = event.target.value as TranslationProvider;
                  setProvider(nextProvider);
                  setDocument((current) => updateDocumentProvider(current, nextProvider));
                }}
              >
                <option value="none">{language === "en" ? "No Translation" : "不翻译"}</option>
                <option value="google">Google</option>
                <option value="ai">AI</option>
              </select>
            </label>
          </div>
          <Button tone="ghost" onClick={clearSettings} style={{ justifyContent: "center", borderColor: "#e0245e", color: "#e0245e" }}>
            {ui.clearSettings}
          </Button>
          <div className="muted" style={{ fontSize: 13 }}>
            {ui.settingsHint}
          </div>
        </div>
      </div>
    </>
  );
}
