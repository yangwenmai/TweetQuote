import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { TweetQuoteApiClient } from "@tweetquote/sdk";
import { designTokens } from "@tweetquote/config";
import { Button, QuotePreview } from "@tweetquote/ui";
import { type AppLanguage, type QuoteDocument, type TranslationDisplay, type TranslationProvider } from "@tweetquote/domain";
import {
  applyNodeTranslation,
  collectBatchItems,
  resetDocumentDraft,
  storageKeys,
  updateDocumentLanguage,
  updateDocumentScale,
  updateDocumentTranslationDisplay,
} from "@tweetquote/editor-core";
import { getDocumentSummary } from "@tweetquote/render-core";

const apiBaseUrl =
  import.meta.env.VITE_TWEETQUOTE_API_BASE_URL?.trim() ||
  (import.meta.env.MODE === "development" ? "http://localhost:8787" : "https://tweetquote.app");
const runtimeEnv = globalThis as typeof globalThis & { __TQ_ENV__?: Record<string, string | undefined> };
runtimeEnv.__TQ_ENV__ = {
  ...(runtimeEnv.__TQ_ENV__ || {}),
  NEXT_PUBLIC_API_BASE_URL: apiBaseUrl,
};

const api = new TweetQuoteApiClient({ baseUrl: apiBaseUrl });

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

function formatLayerLog(layer: { index: number; relation: "root" | "quote" | "reply"; authorName: string; authorHandle: string }) {
  const relationLabel = layer.relation === "root" ? "主推文" : layer.relation === "reply" ? "回复" : "引用";
  const author =
    layer.authorName || layer.authorHandle
      ? `${layer.authorName || "未知作者"}${layer.authorHandle ? ` (@${layer.authorHandle.replace(/^@/, "")})` : ""}`
      : "未知作者";
  return `第 ${layer.index + 1} 层：${relationLabel} · ${author}`;
}

function PanelApp() {
  const previewRef = useRef<HTMLDivElement | null>(null);
  const [tweetUrl, setTweetUrl] = useState("");
  const [document, setDocument] = useState<QuoteDocument>(() => resetDocumentDraft());
  const [message, setMessage] = useState("等待抓取当前推文…");
  const [busy, setBusy] = useState<BusyState>({ kind: "idle" });
  const [deviceId, setDeviceId] = useState("");
  const [language, setLanguage] = useState<AppLanguage>("zh-CN");
  const [aiBaseUrl, setAiBaseUrl] = useState("");
  const [aiApiKey, setAiApiKey] = useState("");
  const [aiModel, setAiModel] = useState("");
  const [twitterApiKey, setTwitterApiKey] = useState("");
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const documentSummary = useMemo(() => getDocumentSummary(document), [document]);
  const hasContent = document.nodes.some((node) => node.content.trim() || node.translation.text.trim());
  const translationTotal = document.nodes.filter((node) => node.content.trim()).length;
  const translationDone = document.nodes.filter((node) => node.translation.text.trim()).length;
  const hasTranslatableContent = translationTotal > 0;
  const hasTranslations = translationDone > 0;
  const previewSummary = hasTranslations ? `已翻译 ${translationDone}/${translationTotal}` : documentSummary.subtitle;
  const isFetchBusy = busy.kind === "fetch";
  const isSaveBusy = busy.kind === "save";
  const isExportBusy = busy.kind === "export";
  const isBatchBusy = busy.kind === "translate-batch";

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setTweetUrl(params.get("tweetUrl") || "");
    const cached = window.localStorage.getItem(storageKeys.extensionDeviceId) || "";
    const cachedLanguage = window.localStorage.getItem(storageKeys.translationTargetLanguage);
    if (cachedLanguage === "zh-CN" || cachedLanguage === "en") {
      setLanguage(cachedLanguage);
    }
    setTwitterApiKey(window.localStorage.getItem(storageKeys.twitterApiKey) || "");
    setAiBaseUrl(window.localStorage.getItem(storageKeys.aiBaseUrl) || "");
    setAiApiKey(window.localStorage.getItem(storageKeys.aiApiKey) || "");
    setAiModel(window.localStorage.getItem(storageKeys.aiModel) || "");
    api.createAnonymousSession(cached).then((session) => {
      setDeviceId(session.deviceId);
      window.localStorage.setItem(storageKeys.extensionDeviceId, session.deviceId);
    });
  }, []);

  function pushActivity(text: string) {
    setActivities((current) => [{ id: crypto.randomUUID(), text: formatActivity(text) }, ...current].slice(0, 12));
  }

  async function fetchCurrentTweet() {
    if (!tweetUrl || busy.kind !== "idle") return;
    setBusy({ kind: "fetch" });
    setMessage("正在抓取引用链…");
    pushActivity("开始抓取当前推文引用链");
    try {
      pushActivity("抓取请求已发出，等待服务端返回");
      const response = await api.fetchQuoteDocument({
        tweetUrl,
        targetLanguage: language,
        translationProvider: "none",
        includeAnnotations: false,
        apiKey: twitterApiKey || undefined,
        aiApiKey: aiApiKey || undefined,
        aiBaseUrl: aiBaseUrl || undefined,
        aiModel: aiModel || undefined,
        source: "extension",
        deviceId: deviceId || `ext_${Date.now().toString(36)}`,
      });
      setDocument(response.document);
      setMessage(`抓取完成，共 ${response.document.nodes.length} 层。`);
      response.meta.layers.forEach((layer) => {
        pushActivity(formatLayerLog(layer));
      });
      pushActivity(`抓取完成，共 ${response.document.nodes.length} 层`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "抓取失败");
      pushActivity("抓取失败");
    } finally {
      setBusy({ kind: "idle" });
    }
  }

  async function translateAll(provider: TranslationProvider) {
    const items = collectBatchItems(document);
    if (!items.length) {
      setMessage("当前没有可翻译内容");
      return;
    }
    setBusy({ kind: "translate-batch", provider, completed: 0, total: items.length });
    setMessage(`正在翻译 0/${items.length}`);
    pushActivity(`开始 ${provider === "ai" ? "AI" : "Google"} 批量翻译，共 ${items.length} 条`);
    try {
      for (const [index, item] of items.entries()) {
        setBusy({ kind: "translate-batch", provider, completed: index, total: items.length });
        setMessage(`正在翻译 ${index}/${items.length}`);
        const response = await api.translateText({
          text: item.text,
          provider,
          targetLanguage: language,
          aiApiKey: aiApiKey || undefined,
          aiBaseUrl: aiBaseUrl || undefined,
          aiModel: aiModel || undefined,
        });
        setDocument((current) => applyNodeTranslation(current, item.id, response.artifact));
        setBusy({ kind: "translate-batch", provider, completed: index + 1, total: items.length });
        setMessage(`正在翻译 ${index + 1}/${items.length}`);
        pushActivity(`已完成 ${index + 1}/${items.length} 条翻译`);
      }
      setMessage(`已完成 ${items.length} 条翻译`);
      pushActivity("批量翻译完成");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "翻译失败");
      pushActivity("批量翻译失败");
    } finally {
      setBusy({ kind: "idle" });
    }
  }

  async function saveDraft() {
    setBusy({ kind: "save" });
    pushActivity("正在保存插件草稿");
    try {
      const saved = await api.saveDocument(document);
      setDocument(saved);
      setMessage("插件草稿已保存");
      pushActivity("插件草稿已保存");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "保存失败");
      pushActivity("保存失败");
    } finally {
      setBusy({ kind: "idle" });
    }
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

  async function exportDocument() {
    setBusy({ kind: "export" });
    setMessage("正在导出 PNG…");
    pushActivity("开始导出 PNG");
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
        throw new Error("导出失败");
      }
      const downloadUrl = window.URL.createObjectURL(blob);
      const link = window.document.createElement("a");
      link.download = `${document.title || "tweet-quote"}.png`;
      link.href = downloadUrl;
      window.document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(downloadUrl);
      setMessage("PNG 已导出");
      pushActivity("PNG 导出成功");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "导出失败");
      pushActivity("PNG 导出失败");
    } finally {
      setBusy({ kind: "idle" });
    }
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        background: designTokens.colors.background,
        color: designTokens.colors.foreground,
        fontFamily: "Inter, system-ui, sans-serif",
      }}
    >
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
      </div>
      <div style={{ display: "grid", gap: 12, padding: 16 }}>
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
          <div style={{ color: designTokens.colors.accent, fontSize: 13, fontWeight: 700 }}>当前推文链接</div>
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
            {tweetUrl || "未获取到 tweetUrl"}
          </div>
          <div style={{ color: designTokens.colors.muted, fontSize: 13, lineHeight: 1.6 }}>
            当前推文链接会自动带入；确认无误后，点击「一键抓取」开始处理。
          </div>
          <Button
            onClick={fetchCurrentTweet}
            disabled={!tweetUrl || busy.kind !== "idle"}
            style={{ background: designTokens.colors.accent, border: "none", color: "#fff" }}
          >
            {isFetchBusy ? "抓取中..." : "一键抓取"}
          </Button>
        </div>

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
            <span style={{ fontSize: 13, fontWeight: 700, color: designTokens.colors.muted }}>按需翻译（可选）</span>
            <select
              value={language}
              onChange={(event) => {
                updatePreviewLanguage(event.target.value as AppLanguage);
              }}
              style={{ border: `1px solid ${designTokens.colors.border}`, borderRadius: 8, padding: "8px 10px", background: "#fff" }}
            >
              <option value="zh-CN">中文</option>
              <option value="en">English</option>
            </select>
            <select
              value={document.renderSpec.translationDisplay}
              onChange={(event) => updateTranslationDisplay(event.target.value as TranslationDisplay)}
              style={{ border: `1px solid ${designTokens.colors.border}`, borderRadius: 8, padding: "8px 10px", background: "#fff" }}
            >
              <option value="replace">默认用译文替换原文</option>
              <option value="bilingual">双语显示</option>
            </select>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Button tone="ghost" onClick={() => translateAll("google")} disabled={busy.kind !== "idle" || !hasTranslatableContent}>
              {isBatchBusy && busy.provider === "google" ? `Google ${busy.completed}/${busy.total}` : "🌐 批量翻译"}
            </Button>
            <Button tone="ghost" onClick={() => translateAll("ai")} disabled={busy.kind !== "idle" || !hasTranslatableContent}>
              {isBatchBusy && busy.provider === "ai" ? `AI ${busy.completed}/${busy.total}` : "🤖 批量 AI 翻译"}
            </Button>
            <Button tone="ghost" onClick={saveDraft} disabled={busy.kind !== "idle"}>
              {isSaveBusy ? "保存中..." : "保存草稿"}
            </Button>
            <Button tone="ghost" onClick={exportDocument} disabled={busy.kind !== "idle" || !hasContent}>
              {isExportBusy ? "导出中..." : "导出 PNG"}
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
            {hasTranslatableContent
              ? "默认保留原文；只有你确实需要中英互译时，再手动触发翻译。"
              : "先抓取原文；如需中英互译，再手动展开使用翻译。"}
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
            <div style={{ fontSize: 13, fontWeight: 700, color: designTokens.colors.muted }}>进度日志</div>
            {activities.length ? (
              activities.map((activity) => (
                <div key={activity.id} style={{ color: designTokens.colors.muted, fontSize: 13, lineHeight: 1.5 }}>
                  {activity.text}
                </div>
              ))
            ) : (
              <div style={{ color: designTokens.colors.muted, fontSize: 13 }}>暂无操作日志</div>
            )}
          </div>
        </div>

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
              <span style={{ color: designTokens.colors.muted, fontSize: 13, fontWeight: 700 }}>导出倍率</span>
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
            <div style={{ color: designTokens.colors.muted, fontSize: 12 }}>当前导出清晰度 {document.renderSpec.exportScale}x</div>
          </div>
          <div style={{ marginBottom: 12, color: designTokens.colors.muted, fontSize: 13 }}>
            {hasContent ? previewSummary : "等待抓取当前推文…"}
          </div>
          <div ref={previewRef}>
            <QuotePreview document={document} />
          </div>
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
