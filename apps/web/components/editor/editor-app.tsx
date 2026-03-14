"use client";

import { useEffect, useMemo, useState } from "react";
import {
  type AppLanguage,
  type QuoteDocument,
  type TranslationProvider,
} from "@tweetquote/domain";
import {
  addLayer as appendLayer,
  applyBatchTranslations,
  applyNodeTranslation,
  collectBatchItems,
  removeLastLayer,
  resetDocumentDraft,
  restoreDraftDocument,
  storageKeys,
  updateDocumentLanguage,
  updateDocumentScale,
  updateDocumentTheme,
  updateDocumentTitle,
  updateNodeField,
} from "@tweetquote/editor-core";
import { getDocumentSummary } from "@tweetquote/render-core";
import { TweetQuoteApiClient } from "@tweetquote/sdk";
import { SurfaceCard } from "@tweetquote/ui";
import { DocumentSettingsCard } from "./document-settings-card";
import { EditorHeader } from "./editor-header";
import { FetchCard } from "./fetch-card";
import { ManualEditorCard } from "./manual-editor-card";
import { PreviewCard } from "./preview-card";

const api = new TweetQuoteApiClient({
  baseUrl: process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8787",
});

export function EditorApp() {
  const [deviceId, setDeviceId] = useState("");
  const [language, setLanguage] = useState<AppLanguage>("zh-CN");
  const [provider, setProvider] = useState<TranslationProvider>("none");
  const [tweetUrl, setTweetUrl] = useState("");
  const [document, setDocument] = useState<QuoteDocument>(() => resetDocumentDraft());
  const [quotaLabel, setQuotaLabel] = useState("正在加载配额...");
  const [busy, setBusy] = useState<string>("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    const cachedDeviceId = window.localStorage.getItem(storageKeys.webDeviceId) || "";
    const restored = restoreDraftDocument(window.localStorage.getItem(storageKeys.webDraft));
    if (restored) {
      setDocument(restored);
      setLanguage(restored.renderSpec.language);
    } else {
      window.localStorage.removeItem(storageKeys.webDraft);
    }
    api
      .createAnonymousSession(cachedDeviceId)
      .then((session) => {
        setDeviceId(session.deviceId);
        window.localStorage.setItem(storageKeys.webDeviceId, session.deviceId);
        setQuotaLabel(`日余量 ${session.quota.dailyRemaining} / 周余量 ${session.quota.weeklyRemaining}`);
      })
      .catch((error: Error) => {
        setQuotaLabel("配额状态不可用");
        setMessage(error.message);
      });
  }, []);

  useEffect(() => {
    window.localStorage.setItem(storageKeys.webDraft, JSON.stringify(document));
  }, [document]);

  const canFetch = tweetUrl.trim().length > 0 && !busy;
  const documentSummary = useMemo(() => getDocumentSummary(document), [document]);

  async function handleFetch() {
    if (!canFetch) return;
    setBusy("fetch");
    setMessage("");
    try {
      const response = await api.fetchQuoteDocument({
        tweetUrl,
        targetLanguage: language,
        translationProvider: provider,
        includeAnnotations: true,
        source: "web",
        deviceId,
      });
      setDocument(response.document);
      setLanguage(response.document.renderSpec.language);
      setQuotaLabel(`日余量 ${response.quota.dailyRemaining} / 周余量 ${response.quota.weeklyRemaining}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "抓取失败");
    } finally {
      setBusy("");
    }
  }

  async function translateNode(index: number, nextProvider: TranslationProvider) {
    const node = document.nodes[index];
    if (!node?.content) return;
    setBusy(`translate:${index}`);
    setMessage("");
    try {
      const response = await api.translateText({
        text: node.content,
        targetLanguage: language,
        provider: nextProvider,
      });
      setDocument((current) => applyNodeTranslation(current, node.id, response.artifact));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "翻译失败");
    } finally {
      setBusy("");
    }
  }

  async function translateAll(nextProvider: TranslationProvider) {
    const items = collectBatchItems(document);
    if (!items.length) {
      setMessage("没有可翻译的推文内容");
      return;
    }

    setBusy("translate:batch");
    setMessage("");
    try {
      const response = await api.translateBatch({
        provider: nextProvider,
        targetLanguage: language,
        items,
      });
      setDocument((current) => applyBatchTranslations(current, response.items));
      setMessage(`已完成 ${response.items.length} 条批量翻译`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "批量翻译失败");
    } finally {
      setBusy("");
    }
  }

  function updateNode(index: number, key: "content" | "name" | "handle", value: string) {
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
    setTweetUrl("");
    setMessage("已重置为新的空白草稿");
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

  function updateRenderTheme(theme: "paper" | "night") {
    setDocument((current) => updateDocumentTheme(current, theme));
  }

  async function saveDocument() {
    setBusy("save");
    setMessage("");
    try {
      const saved = await api.saveDocument(document);
      setDocument(saved);
      setMessage("草稿已保存");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "保存失败");
    } finally {
      setBusy("");
    }
  }

  async function exportDocument() {
    setBusy("export");
    setMessage("");
    try {
      const job = await api.createExportJob({
        document,
        renderSpec: document.renderSpec,
      });
      setMessage(`导出任务已创建：${job.id}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "导出失败");
    } finally {
      setBusy("");
    }
  }

  return (
    <div className="card-grid">
      <EditorHeader
        quotaLabel={quotaLabel}
        busy={Boolean(busy)}
        onSave={saveDocument}
        onExport={exportDocument}
        onReset={resetDocument}
      />

      {message ? (
        <SurfaceCard title="状态">
          <div className="muted">{message}</div>
        </SurfaceCard>
      ) : null}

      <div className="editor-grid">
        <div className="stack">
          <DocumentSettingsCard
            document={document}
            language={language}
            onTitleChange={updateTitle}
            onLanguageChange={updateRenderLanguage}
            onScaleChange={updateRenderScale}
            onThemeChange={updateRenderTheme}
          />

          <FetchCard
            tweetUrl={tweetUrl}
            language={language}
            provider={provider}
            busy={busy === "fetch"}
            onTweetUrlChange={setTweetUrl}
            onLanguageChange={updateRenderLanguage}
            onProviderChange={setProvider}
            onFetch={handleFetch}
          />

          <ManualEditorCard
            document={document}
            busy={Boolean(busy)}
            onTranslateAll={translateAll}
            onRemoveLayer={removeLayer}
            onTranslateNode={translateNode}
            onUpdateNode={updateNode}
            onAddLayer={addLayer}
          />
        </div>

        <div className="stack">
          <PreviewCard document={document} summary={documentSummary} />
        </div>
      </div>
    </div>
  );
}
