import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { TweetQuoteApiClient } from "@tweetquote/sdk";
import { Button, QuotePreview, SurfaceCard } from "@tweetquote/ui";
import { type QuoteDocument, type TranslationProvider } from "@tweetquote/domain";
import {
  applyBatchTranslations,
  collectBatchItems,
  resetDocumentDraft,
  storageKeys,
} from "@tweetquote/editor-core";
import { getDocumentSummary } from "@tweetquote/render-core";

const api = new TweetQuoteApiClient({ baseUrl: "http://localhost:8787" });

function PanelApp() {
  const [tweetUrl, setTweetUrl] = useState("");
  const [document, setDocument] = useState<QuoteDocument>(() => resetDocumentDraft());
  const [message, setMessage] = useState("等待抓取当前推文…");
  const [busy, setBusy] = useState(false);
  const [deviceId, setDeviceId] = useState("");
  const documentSummary = getDocumentSummary(document);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setTweetUrl(params.get("tweetUrl") || "");
    const cached = window.localStorage.getItem(storageKeys.extensionDeviceId) || "";
    api.createAnonymousSession(cached).then((session) => {
      setDeviceId(session.deviceId);
      window.localStorage.setItem(storageKeys.extensionDeviceId, session.deviceId);
    });
  }, []);

  async function fetchCurrentTweet() {
    if (!tweetUrl) return;
    setBusy(true);
    setMessage("正在抓取引用链…");
    try {
      const response = await api.fetchQuoteDocument({
        tweetUrl,
        targetLanguage: "zh-CN",
        translationProvider: "none",
        includeAnnotations: false,
        source: "extension",
        deviceId: deviceId || `ext_${Date.now().toString(36)}`,
      });
      setDocument(response.document);
      setMessage(`抓取完成，共 ${response.document.nodes.length} 层。`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "抓取失败");
    } finally {
      setBusy(false);
    }
  }

  async function translateAll(provider: TranslationProvider) {
    const items = collectBatchItems(document);
    if (!items.length) {
      setMessage("当前没有可翻译内容");
      return;
    }
    setBusy(true);
    setMessage("正在批量翻译…");
    try {
      const response = await api.translateBatch({
        items,
        provider,
        targetLanguage: "zh-CN",
      });
      setDocument((current) => applyBatchTranslations(current, response.items));
      setMessage(`已完成 ${response.items.length} 条翻译`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "翻译失败");
    } finally {
      setBusy(false);
    }
  }

  async function saveDraft() {
    setBusy(true);
    try {
      const saved = await api.saveDocument(document);
      setDocument(saved);
      setMessage("插件草稿已保存");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "保存失败");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#f6f2ea",
        color: "#221c18",
        padding: 16,
        fontFamily: "Inter, system-ui, sans-serif",
      }}
    >
      <div style={{ display: "grid", gap: 12 }}>
        <SurfaceCard title="TweetQuote 插件面板" subtitle="扩展只负责上下文接入，业务 UI 运行在扩展内部。">
          <div style={{ display: "grid", gap: 12 }}>
            <div style={{ fontSize: 13, color: "#786d65", lineBreak: "anywhere" }}>{tweetUrl || "未获取到 tweetUrl"}</div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <Button onClick={fetchCurrentTweet} disabled={!tweetUrl || busy}>
                {busy ? "抓取中..." : "抓取当前引用链"}
              </Button>
              <Button tone="ghost" onClick={() => translateAll("google")} disabled={busy}>
                Google 翻译
              </Button>
              <Button tone="secondary" onClick={() => translateAll("ai")} disabled={busy}>
                AI 翻译
              </Button>
              <Button tone="ghost" onClick={saveDraft} disabled={busy}>
                保存草稿
              </Button>
            </div>
            <div style={{ color: "#786d65" }}>{message}</div>
          </div>
        </SurfaceCard>

        <SurfaceCard title={documentSummary.title} subtitle={documentSummary.subtitle}>
          <div style={{ marginBottom: 12, color: "#786d65", fontSize: 13 }}>{documentSummary.translationLabel}</div>
          <QuotePreview document={document} />
        </SurfaceCard>
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
