import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { TweetQuoteApiClient } from "@tweetquote/sdk";
import { designTokens } from "@tweetquote/config";
import { Button, QuotePreview } from "@tweetquote/ui";
import {
  type AppLanguage,
  type QuoteDocument,
  type QuotaSnapshot,
  type TranslationDisplay,
  type TranslationProvider,
  randomUUID,
} from "@tweetquote/domain";
import {
  applyNodeTranslation,
  collectBatchItems,
  resetDocumentDraft,
  storageKeys,
  updateDocumentLanguage,
  updateDocumentScale,
  updateDocumentTranslationDisplay,
  updateNodeMediaFromText,
} from "@tweetquote/editor-core";
import { getDocumentSummary } from "@tweetquote/render-core";

const apiBaseUrl =
  import.meta.env.VITE_TWEETQUOTE_API_BASE_URL?.trim() ||
  (import.meta.env.MODE === "development" ? "http://localhost:8787" : "https://tweetquote.app");

function resolveMediaProxySrc(originalUrl: string): string {
  const base = apiBaseUrl.replace(/\/$/, "");
  return `${base}/api/v1/assets/image?url=${encodeURIComponent(originalUrl)}`;
}

function waitForImages(container: HTMLElement): Promise<void> {
  const images = Array.from(container.querySelectorAll("img"));
  return Promise.all(
    images.map((img) => {
      if (img.complete && img.naturalWidth > 0) return Promise.resolve();
      return new Promise<void>((resolve) => {
        const done = () => resolve();
        img.addEventListener("load", done, { once: true });
        img.addEventListener("error", done, { once: true });
      });
    }),
  ).then(() => undefined);
}

/**
 * Fetch an image through the background service worker to bypass Mixed Content
 * restrictions (the panel iframe lives on https://x.com but the API may be HTTP).
 * Returns a self-contained data:image/… URL.
 */
function fetchImageViaBackground(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ type: "tweetquote.image-proxy", url }, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message ?? "image proxy failed"));
        return;
      }
      if (!response || response.error) {
        reject(new Error(response?.error || "image proxy failed"));
        return;
      }
      resolve(response.dataUrl);
    });
  });
}

/**
 * Resolves all media URLs in the document to data URLs via the background proxy.
 * Returns a Map<originalUrl, dataUrl> that updates as images finish loading.
 */
function useResolvedMediaUrls(doc: QuoteDocument): Map<string, string> {
  const cacheRef = useRef(new Map<string, string>());
  const pendingRef = useRef(new Set<string>());
  const [, bump] = useState(0);

  useEffect(() => {
    if (!useBackgroundProxy) return;
    const allUrls = [...new Set(doc.nodes.flatMap((n) => n.media ?? []).filter(Boolean))];
    for (const url of allUrls) {
      if (cacheRef.current.has(url) || pendingRef.current.has(url)) continue;
      pendingRef.current.add(url);
      fetchImageViaBackground(resolveMediaProxySrc(url))
        .then((dataUrl) => {
          cacheRef.current.set(url, dataUrl);
          bump((n) => n + 1);
        })
        .catch(() => {})
        .finally(() => {
          pendingRef.current.delete(url);
        });
    }
  }, [doc.nodes]);

  return cacheRef.current;
}

const runtimeEnv = globalThis as typeof globalThis & { __TQ_ENV__?: Record<string, string | undefined> };
runtimeEnv.__TQ_ENV__ = {
  ...(runtimeEnv.__TQ_ENV__ || {}),
  NEXT_PUBLIC_API_BASE_URL: apiBaseUrl,
};

const PROVIDER_STORAGE_KEY = "tq_v2_extension_provider";

const webEditorBaseUrl = (() => {
  try {
    const u = new URL(apiBaseUrl);
    if (u.port === "8787") {
      u.port = "3000";
      return u.origin;
    }
    return u.origin;
  } catch {
    return apiBaseUrl;
  }
})();

function createBackgroundFetch(): typeof globalThis.fetch {
  return ((input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    return new Promise((resolve, reject) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      const headers: Record<string, string> | undefined = init?.headers
        ? Object.fromEntries(new Headers(init.headers as HeadersInit).entries())
        : undefined;
      chrome.runtime.sendMessage(
        {
          type: "tweetquote.api-proxy",
          url,
          init: { method: init?.method ?? "GET", headers, body: typeof init?.body === "string" ? init.body : undefined },
        },
        (response) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message ?? "Extension message failed"));
            return;
          }
          if (!response) {
            reject(new Error("No response from background script"));
            return;
          }
          if (response.error || !response.status) {
            reject(new Error(response.error || `Background fetch failed for ${url}`));
            return;
          }
          const status = response.status >= 200 && response.status <= 599 ? response.status : 502;
          resolve(new Response(response.body, { status, headers: { "Content-Type": "application/json" } }));
        },
      );
    });
  }) as typeof globalThis.fetch;
}

const useBackgroundProxy = typeof chrome !== "undefined" && !!chrome.runtime?.sendMessage;
const api = new TweetQuoteApiClient({ baseUrl: apiBaseUrl, fetchFn: useBackgroundProxy ? createBackgroundFetch() : undefined });

type BusyState =
  | { kind: "idle" }
  | { kind: "fetch" }
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

function getUiStrings(language: AppLanguage, quota: QuotaSnapshot | null) {
  return language === "en"
    ? {
        switchLanguage: "中文",
        resetButton: "New",
        currentTweetLink: "Current Tweet",
        fetchHint: "The tweet URL is auto-filled from the current page. Click Fetch to start.",
        noTweetUrl: "No tweet URL detected",
        fetchButton: "Fetch",
        fetchBusy: "Fetching...",
        syncQuota: "Syncing quota...",
        quotaExhaustedShort: "Quota exhausted",
        quotaLabel: (q: QuotaSnapshot) => `Today ${q.dailyRemaining}/${q.dailyTotal} · Week ${q.weeklyRemaining}/${q.weeklyTotal}`,
        quotaExhaustedHint: "Hosted fetch quota reached. You can still use your own Key.",
        quotaResetWeekly: (time: string) => `Weekly quota exhausted, resets at ${time}.`,
        quotaResetDaily: (time: string) => `Daily quota exhausted, resets at ${time}.`,
        quotaResetPending: "Quota reset time syncing, please refresh later.",
        quotaExhaustedFull: (q: QuotaSnapshot) => `Hosted fetch quota reached: ${q.dailyTotal}/day, ${q.weeklyTotal}/week.`,
        providerGoogle: "Google Translate (after fetch)",
        providerAi: "AI Translate (after fetch)",
        providerNone: "No auto-translate",
        translationSection: "Optional Translation",
        displayReplace: "Show translation",
        displayBilingual: "Bilingual",
        displayOriginal: "Original only",
        batchGoogle: "Batch Translate",
        batchAi: "Batch AI Translate",
        saveDraft: "Save Draft",
        saveBusy: "Saving...",
        exportPng: "Export PNG",
        exportBusy: "Exporting...",
        translationHintReady: "Original text preserved by default. Translate only when needed.",
        translationHintIdle: "Fetch the tweet first, then translate if needed.",
        activityTitle: "Activity Log",
        activityEmpty: "No activity yet",
        exportScale: "Export Scale",
        exportScaleLabel: (s: number) => `Current scale: ${s}x`,
        previewEmpty: "Waiting to fetch the current tweet...",
        webEditorLink: "Need more editing? Open in Web Editor",
        settingsHosted: "Hosted mode",
        settingsTwitterOk: "Twitter API ✓",
        settingsAiOk: "AI ✓",
        messageFetchStart: "Started fetching quote chain",
        messageFetchSent: (url: string) => `Fetch request sent, waiting for server (${url})`,
        messageFetchDone: (n: number) => `Fetch finished, ${n} layers total`,
        messageFetchFailed: "Fetch failed",
        messageFetchQuotaExhausted: "Hosted fetch quota reached, please try again later.",
        messageTranslateStart: (provider: string, count: number) => `Starting ${provider} batch translate, ${count} items`,
        messageTranslateProgress: (done: number, total: number) => `Translating ${done}/${total}`,
        messageTranslateDone: (count: number) => `Translated ${count} items`,
        messageTranslateFailed: "Translation failed",
        messageTranslateEmpty: "No translatable content",
        messageSaveStart: "Saving draft",
        messageSaveDone: "Draft saved",
        messageSaveFailed: "Save failed",
        messageExportStart: "Preparing PNG export",
        messageExportDone: "PNG exported",
        messageExportFailed: "Export failed",
        messageExportNoPreview: "Preview area unavailable",
        messageReset: "Reset to a new blank draft",
        layerLog: (index: number, relation: string, author: string) => {
          const rel = relation === "root" ? "Root" : relation === "reply" ? "Reply" : "Quote";
          return `Layer ${index + 1}: ${rel} · ${author}`;
        },
        mediaSectionTitle: "Images (preview & export)",
        mediaLayerLabel: (index: number) => `Layer ${index + 1}`,
        mediaPlaceholder: "https://… (one per line)",
      }
    : {
        switchLanguage: "EN",
        resetButton: "新建",
        currentTweetLink: "当前推文链接",
        fetchHint: "当前推文链接会自动带入；确认无误后，点击「一键抓取」开始处理。",
        noTweetUrl: "未获取到 tweetUrl",
        fetchButton: "一键抓取",
        fetchBusy: "抓取中...",
        syncQuota: "正在同步额度…",
        quotaExhaustedShort: "额度已达上限",
        quotaLabel: (q: QuotaSnapshot) => `今日 ${q.dailyRemaining}/${q.dailyTotal} · 本周 ${q.weeklyRemaining}/${q.weeklyTotal}`,
        quotaExhaustedHint: "托管抓取额度已达上限，你仍可自带 Key 继续使用。",
        quotaResetWeekly: (time: string) => `本周额度已用完，预计在 ${time} 恢复。`,
        quotaResetDaily: (time: string) => `今日额度已用完，预计在 ${time} 恢复。`,
        quotaResetPending: "额度恢复时间同步中，请稍后刷新查看。",
        quotaExhaustedFull: (q: QuotaSnapshot) => `托管抓取额度已达上限：每天最多 ${q.dailyTotal} 次、每周最多 ${q.weeklyTotal} 次。`,
        providerGoogle: "Google 翻译（抓取后）",
        providerAi: "AI 翻译（抓取后）",
        providerNone: "不自动翻译",
        translationSection: "按需翻译（可选）",
        displayReplace: "显示翻译内容",
        displayBilingual: "双语显示",
        displayOriginal: "仅显示原文",
        batchGoogle: "🌐 批量翻译",
        batchAi: "🤖 批量 AI 翻译",
        saveDraft: "保存草稿",
        saveBusy: "保存中...",
        exportPng: "导出 PNG",
        exportBusy: "导出中...",
        translationHintReady: "默认保留原文；只有你确实需要中英互译时，再手动触发翻译。",
        translationHintIdle: "先抓取原文；如需中英互译，再手动展开使用翻译。",
        activityTitle: "进度日志",
        activityEmpty: "暂无操作日志",
        exportScale: "导出倍率",
        exportScaleLabel: (s: number) => `当前导出清晰度 ${s}x`,
        previewEmpty: "等待抓取当前推文…",
        webEditorLink: "需要更多编辑？去网页版",
        settingsHosted: "托管模式",
        settingsTwitterOk: "Twitter API ✓",
        settingsAiOk: "AI ✓",
        messageFetchStart: "开始抓取当前推文引用链",
        messageFetchSent: (url: string) => `抓取请求已发出，等待服务端返回 (${url})`,
        messageFetchDone: (n: number) => `抓取完成，共 ${n} 层`,
        messageFetchFailed: "抓取失败",
        messageFetchQuotaExhausted: "托管抓取额度已达上限，请稍后再试。",
        messageTranslateStart: (provider: string, count: number) => `开始 ${provider} 批量翻译，共 ${count} 条`,
        messageTranslateProgress: (done: number, total: number) => `正在翻译 ${done}/${total}`,
        messageTranslateDone: (count: number) => `已完成 ${count} 条翻译`,
        messageTranslateFailed: "翻译失败",
        messageTranslateEmpty: "当前没有可翻译内容",
        messageSaveStart: "正在保存插件草稿",
        messageSaveDone: "插件草稿已保存",
        messageSaveFailed: "保存失败",
        messageExportStart: "开始导出 PNG",
        messageExportDone: "PNG 已导出",
        messageExportFailed: "导出失败",
        messageExportNoPreview: "预览区域不可用",
        messageReset: "已重置为新的空白草稿",
        layerLog: (index: number, relation: string, author: string) => {
          const rel = relation === "root" ? "主推文" : relation === "reply" ? "回复" : "引用";
          return `第 ${index + 1} 层：${rel} · ${author}`;
        },
        mediaSectionTitle: "图片（预览与导出）",
        mediaLayerLabel: (index: number) => `第 ${index + 1} 层`,
        mediaPlaceholder: "每行一条 https://…",
      };
}

type UiStrings = ReturnType<typeof getUiStrings>;

function formatQuotaResetTime(epochSeconds: number): string {
  if (!epochSeconds) return "";
  const date = new Date(epochSeconds * 1000);
  if (Number.isNaN(date.getTime())) return "";
  try {
    return new Intl.DateTimeFormat("zh-CN", {
      month: "numeric",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(date);
  } catch {
    return date.toLocaleString();
  }
}

function getQuotaResetText(quota: QuotaSnapshot, ui: UiStrings): string {
  if (!quota.requiresUpgrade) return "";
  if (quota.exhaustedReason === "weekly" && quota.nextWeeklyResetAt) {
    const time = formatQuotaResetTime(quota.nextWeeklyResetAt);
    return time ? ui.quotaResetWeekly(time) : ui.quotaResetPending;
  }
  if (quota.nextDailyResetAt) {
    const time = formatQuotaResetTime(quota.nextDailyResetAt);
    return time ? ui.quotaResetDaily(time) : ui.quotaResetPending;
  }
  return ui.quotaResetPending;
}

function getQuotaExhaustedMessage(quota: QuotaSnapshot, ui: UiStrings): string {
  const base = ui.quotaExhaustedFull(quota);
  const reset = getQuotaResetText(quota, ui);
  return reset ? `${base} ${reset}` : base;
}

function QuotaBadge({ quota, ui }: { quota: QuotaSnapshot | null; ui: UiStrings }) {
  if (!quota) return null;
  const exhausted = quota.requiresUpgrade;
  const label = exhausted ? ui.quotaExhaustedShort : ui.quotaLabel(quota);
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "3px 10px",
        borderRadius: 999,
        fontSize: 12,
        fontWeight: 800,
        background: exhausted ? "#fff1f3" : "#e8f5fd",
        color: exhausted ? "#c81e4d" : "#1d9bf0",
      }}
    >
      {label}
    </span>
  );
}

function getSettingsIndicator(twitterApiKey: string, aiApiKey: string, ui: UiStrings): string {
  const hasTwitter = Boolean(twitterApiKey.trim());
  const hasAi = Boolean(aiApiKey.trim());
  if (hasTwitter && hasAi) return `${ui.settingsTwitterOk} · ${ui.settingsAiOk}`;
  if (hasTwitter) return ui.settingsTwitterOk;
  if (hasAi) return ui.settingsAiOk;
  return ui.settingsHosted;
}

function PanelApp() {
  const previewRef = useRef<HTMLDivElement | null>(null);
  const [tweetUrl, setTweetUrl] = useState("");
  const [document, setDocument] = useState<QuoteDocument>(() => resetDocumentDraft());
  const [busy, setBusy] = useState<BusyState>({ kind: "idle" });
  const [deviceId, setDeviceId] = useState("");
  const [language, setLanguage] = useState<AppLanguage>("zh-CN");
  const [provider, setProvider] = useState<TranslationProvider>(() => {
    const cached = window.localStorage.getItem(PROVIDER_STORAGE_KEY);
    if (cached === "google" || cached === "ai" || cached === "none") return cached;
    return "google";
  });
  const [aiBaseUrl, setAiBaseUrl] = useState("");
  const [aiApiKey, setAiApiKey] = useState("");
  const [aiModel, setAiModel] = useState("");
  const [twitterApiKey, setTwitterApiKey] = useState("");
  const [quota, setQuota] = useState<QuotaSnapshot | null>(null);
  const [sessionReady, setSessionReady] = useState(false);
  const [activities, setActivities] = useState<ActivityItem[]>([]);

  const ui = useMemo(() => getUiStrings(language, quota), [language, quota]);
  const [message, setMessage] = useState("");

  const mediaCache = useResolvedMediaUrls(document);
  const displayDocument = useMemo<QuoteDocument>(() => {
    if (mediaCache.size === 0) return document;
    return {
      ...document,
      nodes: document.nodes.map((node) => ({
        ...node,
        media: (node.media ?? []).map((url) => mediaCache.get(url) ?? url),
      })),
    };
  }, [document, mediaCache]);

  const documentSummary = useMemo(() => getDocumentSummary(document), [document]);
  const hasContent = document.nodes.some(
    (node) => node.content.trim() || node.translation.text.trim() || (node.media && node.media.length > 0),
  );
  const translationTotal = document.nodes.filter((node) => node.content.trim()).length;
  const translationDone = document.nodes.filter((node) => node.translation.text.trim()).length;
  const hasTranslatableContent = translationTotal > 0;
  const hasTranslations = translationDone > 0;
  const previewSummary = hasTranslations ? `${translationDone}/${translationTotal}` : documentSummary.subtitle;
  const isFetchBusy = busy.kind === "fetch";
  const isSaveBusy = busy.kind === "save";
  const isExportBusy = busy.kind === "export";
  const isBatchBusy = busy.kind === "translate-batch";
  const anyBusy = busy.kind !== "idle";

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setTweetUrl(params.get("tweetUrl") || "");
    const cached = window.localStorage.getItem(storageKeys.extensionDeviceId) || "";
    const cachedLanguage = window.localStorage.getItem(storageKeys.translationTargetLanguage);
    const initialLanguage: AppLanguage =
      cachedLanguage === "zh-CN" || cachedLanguage === "en" ? cachedLanguage : "zh-CN";
    setLanguage(initialLanguage);
    setTwitterApiKey(window.localStorage.getItem(storageKeys.twitterApiKey) || "");
    setAiBaseUrl(window.localStorage.getItem(storageKeys.aiBaseUrl) || "");
    setAiApiKey(window.localStorage.getItem(storageKeys.aiApiKey) || "");
    setAiModel(window.localStorage.getItem(storageKeys.aiModel) || "");
    setMessage(initialLanguage === "en" ? "Waiting to fetch the current tweet..." : "等待抓取当前推文…");
    api.createAnonymousSession(cached).then((session) => {
      setDeviceId(session.deviceId);
      setQuota(session.quota);
      setSessionReady(true);
      window.localStorage.setItem(storageKeys.extensionDeviceId, session.deviceId);
    }).catch((err: Error) => {
      setMessage(initialLanguage === "en"
        ? `Cannot reach API server (${err.message}). Make sure the API is running.`
        : `无法连接 API 服务 (${err.message})，请确认 API 已启动。`);
    });
  }, []);

  function pushActivity(text: string) {
    setActivities((current) => [{ id: randomUUID(), text: formatActivity(text) }, ...current].slice(0, 12));
  }

  function updatePreviewLanguage(nextLanguage: AppLanguage) {
    setLanguage(nextLanguage);
    setDocument((current) => updateDocumentLanguage(current, nextLanguage));
    window.localStorage.setItem(storageKeys.translationTargetLanguage, nextLanguage);
  }

  function updateTranslationDisplay(nextDisplay: TranslationDisplay) {
    setDocument((current) => updateDocumentTranslationDisplay(current, nextDisplay));
  }

  function updateExportScale(scale: number) {
    setDocument((current) => updateDocumentScale(current, scale));
  }

  function updateProvider(next: TranslationProvider) {
    setProvider(next);
    window.localStorage.setItem(PROVIDER_STORAGE_KEY, next);
  }

  function handleReset() {
    setDocument(resetDocumentDraft());
    setMessage(ui.messageReset);
    setActivities([]);
    setProvider("google");
    window.localStorage.removeItem(PROVIDER_STORAGE_KEY);
  }

  async function fetchCurrentTweet() {
    if (!tweetUrl || anyBusy || !sessionReady) return;
    setBusy({ kind: "fetch" });
    setMessage(ui.fetchBusy);
    pushActivity(ui.messageFetchStart);
    try {
      pushActivity(ui.messageFetchSent(`${apiBaseUrl}/api/v1/quote/fetch`));
      const response = await api.fetchQuoteDocument({
        tweetUrl,
        targetLanguage: language,
        translationProvider: provider,
        includeAnnotations: provider === "ai",
        apiKey: twitterApiKey || undefined,
        aiApiKey: aiApiKey || undefined,
        aiBaseUrl: aiBaseUrl || undefined,
        aiModel: aiModel || undefined,
        source: "extension",
        deviceId,
      });
      setDocument(response.document);
      setQuota(response.quota);
      setMessage(ui.messageFetchDone(response.document.nodes.length));
      response.meta.layers.forEach((layer) => {
        const author =
          layer.authorName || layer.authorHandle
            ? `${layer.authorName || "?"}${layer.authorHandle ? ` (@${layer.authorHandle.replace(/^@/, "")})` : ""}`
            : "?";
        pushActivity(ui.layerLog(layer.index, layer.relation, author));
      });
      pushActivity(ui.messageFetchDone(response.document.nodes.length));
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : ui.messageFetchFailed;
      if (errMsg.includes("Free trial exhausted") || errMsg.includes("402")) {
        if (quota) {
          const refreshedQuota = await api.getQuota(deviceId).catch(() => quota);
          setQuota(refreshedQuota);
          setMessage(getQuotaExhaustedMessage(refreshedQuota, ui));
        } else {
          setMessage(ui.messageFetchQuotaExhausted);
        }
      } else {
        setMessage(errMsg);
      }
      pushActivity(ui.messageFetchFailed);
    } finally {
      setBusy({ kind: "idle" });
    }
  }

  async function translateAll(batchProvider: TranslationProvider) {
    const items = collectBatchItems(document);
    if (!items.length) {
      setMessage(ui.messageTranslateEmpty);
      return;
    }
    const batchStart = Date.now();
    if (import.meta.env.DEV) console.log(`[TweetQuote] 批量翻译开始: provider=${batchProvider}, items=${items.length}`);
    setBusy({ kind: "translate-batch", provider: batchProvider, completed: 0, total: items.length });
    setMessage(ui.messageTranslateProgress(0, items.length));
    const providerLabel = batchProvider === "ai" ? "AI" : "Google";
    pushActivity(ui.messageTranslateStart(providerLabel, items.length));
    try {
      for (const [index, item] of items.entries()) {
        setBusy({ kind: "translate-batch", provider: batchProvider, completed: index, total: items.length });
        setMessage(ui.messageTranslateProgress(index, items.length));
        if (import.meta.env.DEV) console.log(`[TweetQuote]   翻译 ${index + 1}/${items.length}: id=${item.id}, textLen=${item.text.length}`);
        const itemStart = Date.now();
        const response = await api.translateText({
          text: item.text,
          provider: batchProvider,
          targetLanguage: language,
          aiApiKey: aiApiKey || undefined,
          aiBaseUrl: aiBaseUrl || undefined,
          aiModel: aiModel || undefined,
        });
        if (import.meta.env.DEV) console.log(`[TweetQuote]   翻译 ${index + 1}/${items.length} 完成 (${Date.now() - itemStart}ms)`);
        setDocument((current) => applyNodeTranslation(current, item.id, response.artifact));
        setBusy({ kind: "translate-batch", provider: batchProvider, completed: index + 1, total: items.length });
        setMessage(ui.messageTranslateProgress(index + 1, items.length));
        pushActivity(`${index + 1}/${items.length}`);
      }
      if (import.meta.env.DEV) console.log(`[TweetQuote] 批量翻译完成: ${items.length} items, 总耗时 ${Date.now() - batchStart}ms`);
      setMessage(ui.messageTranslateDone(items.length));
      pushActivity(ui.messageTranslateDone(items.length));
    } catch (error) {
      if (import.meta.env.DEV) console.error(`[TweetQuote] 批量翻译失败:`, error);
      setMessage(error instanceof Error ? error.message : ui.messageTranslateFailed);
      pushActivity(ui.messageTranslateFailed);
    } finally {
      setBusy({ kind: "idle" });
    }
  }

  async function saveDraft() {
    setBusy({ kind: "save" });
    pushActivity(ui.messageSaveStart);
    try {
      const saved = await api.saveDocument(document);
      setDocument(saved);
      setMessage(ui.messageSaveDone);
      pushActivity(ui.messageSaveDone);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : ui.messageSaveFailed);
      pushActivity(ui.messageSaveFailed);
    } finally {
      setBusy({ kind: "idle" });
    }
  }

  async function exportDocument() {
    setBusy({ kind: "export" });
    setMessage(ui.exportBusy);
    pushActivity(ui.messageExportStart);
    try {
      if (!previewRef.current) {
        throw new Error(ui.messageExportNoPreview);
      }
      await waitForImages(previewRef.current);
      const { toBlob } = await import("html-to-image");
      const blob = await toBlob(previewRef.current, {
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
      setMessage(ui.messageExportDone);
      pushActivity(ui.messageExportDone);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : ui.messageExportFailed);
      pushActivity(ui.messageExportFailed);
    } finally {
      setBusy({ kind: "idle" });
    }
  }

  const settingsLabel = getSettingsIndicator(twitterApiKey, aiApiKey, ui);

  return (
    <div
      style={{
        minHeight: "100vh",
        background: designTokens.colors.background,
        color: designTokens.colors.foreground,
        fontFamily: "Inter, system-ui, sans-serif",
      }}
    >
      {/* Header */}
      <div
        style={{
          background: "#fff",
          borderBottom: `1px solid ${designTokens.colors.border}`,
          padding: "12px 16px",
          display: "flex",
          alignItems: "center",
          gap: 10,
        }}
      >
        <img
          src="https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTiHIZuDb--IJ-q5d97gWm1W2eyLj7BePcWnQ&s"
          height={32}
          width={32}
          alt="Tweet Quote"
          style={{ borderRadius: 999 }}
        />
        <strong>Tweet Quote</strong>
        <Button
          tone="ghost"
          onClick={() => updatePreviewLanguage(language === "zh-CN" ? "en" : "zh-CN")}
          style={{ padding: "4px 8px", fontSize: 12 }}
        >
          {ui.switchLanguage}
        </Button>
        <Button
          tone="ghost"
          onClick={handleReset}
          disabled={anyBusy}
          style={{ padding: "4px 8px", fontSize: 12 }}
        >
          {ui.resetButton}
        </Button>
        <div style={{ marginLeft: "auto" }}>
          <QuotaBadge quota={quota} ui={ui} />
        </div>
      </div>

      <div style={{ display: "grid", gap: 12, padding: 16 }}>
        {/* Fetch Card */}
        <div
          style={{
            background: designTokens.colors.accentSoft,
            border: `1px solid rgba(29, 155, 240, 0.26)`,
            borderRadius: 16,
            padding: 14,
            display: "grid",
            gap: 10,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ color: designTokens.colors.accent, fontSize: 13, fontWeight: 700 }}>{ui.currentTweetLink}</div>
            <div style={{ fontSize: 11, color: designTokens.colors.muted }}>{settingsLabel}</div>
          </div>
          <div
            style={{
              fontSize: 13,
              color: designTokens.colors.muted,
              lineBreak: "anywhere",
              background: "#fff",
              border: `1px solid rgba(29, 155, 240, 0.2)`,
              borderRadius: 10,
              padding: "10px 12px",
            }}
          >
            {tweetUrl || ui.noTweetUrl}
          </div>
          <div style={{ color: designTokens.colors.muted, fontSize: 13, lineHeight: 1.6 }}>
            {ui.fetchHint}
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <select
              value={provider}
              onChange={(event) => updateProvider(event.target.value as TranslationProvider)}
              style={{ border: `1px solid ${designTokens.colors.border}`, borderRadius: 8, padding: "8px 10px", background: "#fff", fontSize: 13 }}
            >
              <option value="google">{ui.providerGoogle}</option>
              <option value="ai">{ui.providerAi}</option>
              <option value="none">{ui.providerNone}</option>
            </select>
          </div>
          <Button
            onClick={fetchCurrentTweet}
            disabled={!tweetUrl || anyBusy || !sessionReady}
            style={{ background: designTokens.colors.accent, border: "none", color: "#fff" }}
          >
            {!sessionReady ? ui.syncQuota : isFetchBusy ? ui.fetchBusy : ui.fetchButton}
          </Button>
          {quota?.requiresUpgrade && (
            <div
              style={{
                background: "#fff7f8",
                border: "1px solid #f0c7d1",
                borderRadius: 10,
                padding: "10px 12px",
                fontSize: 13,
                lineHeight: 1.6,
                color: "#c81e4d",
              }}
            >
              {getQuotaResetText(quota, ui) || ui.quotaExhaustedHint}
            </div>
          )}
        </div>

        {/* Translation Card */}
        <div
          style={{
            background: "#fff",
            border: `1px solid ${designTokens.colors.border}`,
            borderRadius: 16,
            padding: 14,
            display: "grid",
            gap: 12,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: designTokens.colors.muted }}>{ui.translationSection}</span>
            <select
              value={language}
              onChange={(event) => updatePreviewLanguage(event.target.value as AppLanguage)}
              style={{ border: `1px solid ${designTokens.colors.border}`, borderRadius: 8, padding: "8px 10px", background: "#fff" }}
            >
              <option value="zh-CN">{language === "en" ? "Chinese" : "中文"}</option>
              <option value="en">English</option>
            </select>
            <select
              value={document.renderSpec.translationDisplay}
              onChange={(event) => updateTranslationDisplay(event.target.value as TranslationDisplay)}
              style={{ border: `1px solid ${designTokens.colors.border}`, borderRadius: 8, padding: "8px 10px", background: "#fff" }}
            >
              <option value="replace">{ui.displayReplace}</option>
              <option value="bilingual">{ui.displayBilingual}</option>
              <option value="original">{ui.displayOriginal}</option>
            </select>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Button tone="ghost" onClick={() => translateAll("google")} disabled={anyBusy || !hasTranslatableContent}>
              {isBatchBusy && busy.provider === "google" ? `Google ${busy.completed}/${busy.total}` : ui.batchGoogle}
            </Button>
            <Button tone="ghost" onClick={() => translateAll("ai")} disabled={anyBusy || !hasTranslatableContent}>
              {isBatchBusy && busy.provider === "ai" ? `AI ${busy.completed}/${busy.total}` : ui.batchAi}
            </Button>
            <Button tone="ghost" onClick={saveDraft} disabled={anyBusy}>
              {isSaveBusy ? ui.saveBusy : ui.saveDraft}
            </Button>
            <Button tone="ghost" onClick={exportDocument} disabled={anyBusy || !hasContent}>
              {isExportBusy ? ui.exportBusy : ui.exportPng}
            </Button>
          </div>
          <div
            style={{
              color: "#6a7683",
              fontSize: 13,
              border: `1px solid ${designTokens.colors.border}`,
              borderRadius: 12,
              padding: "12px 14px",
              background: "#fbfcfd",
            }}
          >
            {hasTranslatableContent ? ui.translationHintReady : ui.translationHintIdle}
          </div>
          <div style={{ color: designTokens.colors.muted, fontSize: 13 }}>{message}</div>
          <div
            style={{
              display: "grid",
              gap: 8,
              maxHeight: 160,
              overflow: "auto",
              border: `1px solid ${designTokens.colors.border}`,
              borderRadius: 12,
              padding: "12px 14px",
              background: "#fbfcfd",
            }}
          >
            <div style={{ fontSize: 13, fontWeight: 700, color: designTokens.colors.muted }}>{ui.activityTitle}</div>
            {activities.length ? (
              activities.map((activity) => (
                <div key={activity.id} style={{ color: designTokens.colors.muted, fontSize: 13, lineHeight: 1.5 }}>
                  {activity.text}
                </div>
              ))
            ) : (
              <div style={{ color: designTokens.colors.muted, fontSize: 13 }}>{ui.activityEmpty}</div>
            )}
          </div>
        </div>

        {document.nodes.length > 0 ? (
          <div
            style={{
              background: "#fff",
              border: `1px solid ${designTokens.colors.border}`,
              borderRadius: 16,
              padding: 14,
              display: "grid",
              gap: 10,
            }}
          >
            <div style={{ fontSize: 13, fontWeight: 700, color: designTokens.colors.muted }}>{ui.mediaSectionTitle}</div>
            {document.nodes.map((node, index) => (
              <div key={node.id} style={{ display: "grid", gap: 6 }}>
                <span style={{ fontSize: 12, color: designTokens.colors.muted }}>{ui.mediaLayerLabel(index)}</span>
                <textarea
                  value={(node.media ?? []).join("\n")}
                  onChange={(event) => setDocument((current) => updateNodeMediaFromText(current, index, event.target.value))}
                  rows={2}
                  placeholder={ui.mediaPlaceholder}
                  spellCheck={false}
                  style={{
                    width: "100%",
                    boxSizing: "border-box",
                    fontSize: 12,
                    lineHeight: 1.4,
                    padding: "8px 10px",
                    borderRadius: 10,
                    border: `1px solid ${designTokens.colors.border}`,
                    fontFamily: "ui-monospace, monospace",
                    resize: "vertical",
                  }}
                />
                {(node.media ?? []).length > 0 && (
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {node.media.map((url, idx) => {
                      const resolved = mediaCache.get(url);
                      if (!resolved) return null;
                      return (
                        <img
                          key={`thumb-${node.id}-${idx}`}
                          src={resolved}
                          alt=""
                          style={{
                            width: 80,
                            height: 60,
                            objectFit: "cover",
                            borderRadius: 6,
                            border: `1px solid ${designTokens.colors.border}`,
                            background: designTokens.colors.accentSoft,
                          }}
                        />
                      );
                    })}
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : null}

        {/* Preview Card */}
        <div
          style={{
            background: "#fff",
            borderRadius: 16,
            border: `1px solid ${designTokens.colors.border}`,
            boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
            padding: 14,
            display: "grid",
            gap: 12,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <span style={{ color: designTokens.colors.muted, fontSize: 13, fontWeight: 700 }}>{ui.exportScale}</span>
              {[1, 2, 3].map((scale) => (
                <button
                  key={scale}
                  type="button"
                  onClick={() => updateExportScale(scale)}
                  style={{
                    border: `1px solid ${document.renderSpec.exportScale === scale ? designTokens.colors.accent : designTokens.colors.border}`,
                    background: document.renderSpec.exportScale === scale ? designTokens.colors.accentSoft : "#fff",
                    color: document.renderSpec.exportScale === scale ? designTokens.colors.accent : designTokens.colors.foreground,
                    borderRadius: 999,
                    padding: "6px 10px",
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  {scale}x
                </button>
              ))}
            </div>
            <div style={{ color: designTokens.colors.muted, fontSize: 12 }}>{ui.exportScaleLabel(document.renderSpec.exportScale)}</div>
          </div>
          <div style={{ marginBottom: 12, color: designTokens.colors.muted, fontSize: 13 }}>
            {hasContent ? previewSummary : ui.previewEmpty}
          </div>
          <div ref={previewRef}>
            <QuotePreview document={displayDocument} />
          </div>
          <a
            href={webEditorBaseUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: "block",
              textAlign: "center",
              color: designTokens.colors.accent,
              fontSize: 12,
              marginTop: 4,
              textDecoration: "none",
            }}
          >
            {ui.webEditorLink}
          </a>
        </div>
      </div>
    </div>
  );
}

const rootElement = document.getElementById("root");
if (rootElement) {
  createRoot(rootElement).render(
    <React.StrictMode>
      <PanelApp />
    </React.StrictMode>,
  );
}
