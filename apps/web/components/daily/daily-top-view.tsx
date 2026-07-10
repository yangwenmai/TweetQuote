"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { designTokens } from "@tweetquote/config";
import type { DailyTop, DailyTopEntry, EngagementMetrics, QuoteDocument, TranslationDisplay } from "@tweetquote/domain";
import { storageKeys } from "@tweetquote/editor-core";
import { QuotePreview } from "@tweetquote/ui";

type Lang = "zh-CN" | "en";

const DICT = {
  "zh-CN": {
    heading: "每日 X 精华引用榜",
    subtitle: "每天精选网络上最有价值的推文引用链，按“精华分”排行——引用即精华。",
    empty: "还没有生成任何榜单。运行发现 + 生成脚本后，这里会出现每日精华引用。",
    generatedAt: "生成于",
    essence: "精华分",
    heat: "热度",
    likes: "点赞",
    retweets: "转发",
    replies: "回复",
    quotes: "引用",
    bookmarks: "收藏",
    views: "浏览",
    viewOnX: "在 X 上查看",
    makeImage: "做成图",
    editor: "打开编辑器",
    langToggle: "EN",
    archive: "历史归档",
    depth: (n: number) => `${n} 层引用链`,
    dunk: "锐评超原推",
    showOriginal: "显示原文",
    hideOriginal: "隐藏原文",
    remove: "移除",
    removing: "移除中…",
    confirmRemove: "确定要把这条移出今日榜单吗？此操作会直接修改本地数据文件。",
    removeFailed: "移除失败，请检查本地服务是否在运行。",
  },
  en: {
    heading: "Daily Quote Essence on X",
    subtitle: "The most valuable quote chains on X each day, ranked by an “essence” score — the quote is the point.",
    empty: "No leaderboard yet. Run the discover + generate scripts and daily quote essence will show up here.",
    generatedAt: "Generated",
    essence: "Essence",
    heat: "Heat",
    likes: "Likes",
    retweets: "Reposts",
    replies: "Replies",
    quotes: "Quotes",
    bookmarks: "Bookmarks",
    views: "Views",
    viewOnX: "View on X",
    makeImage: "Make image",
    editor: "Open editor",
    langToggle: "中文",
    archive: "Archive",
    depth: (n: number) => `${n}-tweet chain`,
    dunk: "out-dunks original",
    showOriginal: "Show original",
    hideOriginal: "Hide original",
    remove: "Remove",
    removing: "Removing…",
    confirmRemove: "Remove this entry from today's leaderboard? This edits the local data file directly.",
    removeFailed: "Remove failed — is the local server running?",
  },
} as const;

function formatCompact(value: number | null | undefined, lang: Lang): string {
  if (value == null) return "—";
  return new Intl.NumberFormat(lang === "en" ? "en-US" : "zh-CN", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

function formatDate(iso: string, lang: Lang): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat(lang === "en" ? "en-US" : "zh-CN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(d);
}

const RANK_COLORS: Record<number, string> = { 1: "#f7b500", 2: "#a7b0b8", 3: "#cd7f32" };

/** Persist the entry as the editor draft; navigation is handled by the caller. */
function stashEditorDraft(entry: DailyTopEntry) {
  try {
    window.localStorage.setItem(storageKeys.webDraft, JSON.stringify(entry.document));
  } catch {
    // ignore storage failures; caller still navigates so the user isn't stuck
  }
}

function MetricChip({ label, value }: { label: string; value: string }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "baseline", gap: 4, fontSize: 13, color: designTokens.colors.muted }}>
      <strong style={{ color: designTokens.colors.foreground, fontVariantNumeric: "tabular-nums" }}>{value}</strong>
      {label}
    </span>
  );
}

function Badge({ text, tone = "neutral" }: { text: string; tone?: "neutral" | "hot" }) {
  const palette =
    tone === "hot"
      ? { background: "#fdecef", color: designTokens.colors.danger, border: "1px solid #f6c9d3" }
      : { background: designTokens.colors.accentSoft, color: designTokens.colors.accent, border: `1px solid ${designTokens.colors.border}` };
  return (
    <span style={{ ...palette, fontSize: 12, fontWeight: 700, borderRadius: designTokens.radius.pill, padding: "2px 10px" }}>
      {text}
    </span>
  );
}

/** Return the entry document with a display mode applied (clone only when it differs). */
function withDisplay(document: QuoteDocument, display: TranslationDisplay): QuoteDocument {
  if (document.renderSpec.translationDisplay === display) return document;
  return { ...document, renderSpec: { ...document.renderSpec, translationDisplay: display } };
}

function EntryCard({
  entry,
  lang,
  date,
  editable,
}: {
  entry: DailyTopEntry;
  lang: Lang;
  date: string;
  editable: boolean;
}) {
  const t = DICT[lang];
  const router = useRouter();
  const [showOriginal, setShowOriginal] = useState(false);
  const [removing, setRemoving] = useState(false);

  async function handleRemove() {
    if (removing) return;
    if (!window.confirm(t.confirmRemove)) return;
    setRemoving(true);
    try {
      const res = await fetch(`/api/daily/${date}?rank=${entry.rank}`, { method: "DELETE" });
      if (!res.ok) throw new Error(await res.text());
      router.refresh();
    } catch {
      window.alert(t.removeFailed);
      setRemoving(false);
    }
  }

  const display: TranslationDisplay = showOriginal ? "bilingual" : "replace";
  const m: EngagementMetrics = entry.metrics;
  const rankColor = RANK_COLORS[entry.rank] ?? designTokens.colors.accent;
  const reason = lang === "en" ? entry.reasonEn || entry.reason : entry.reason || entry.reasonEn;
  // Prefer essence, but fall back to heat if essence is missing/0
  // (e.g. data written by an older generator) so we never render a bare "0".
  const bigValue = entry.essenceScore || entry.heatScore;
  const bigLabel = entry.essenceScore > 0 ? t.essence : t.heat;

  return (
    <article
      style={{
        display: "grid",
        gridTemplateColumns: "56px minmax(0, 1fr)",
        gap: 16,
        alignItems: "start",
        background: designTokens.colors.panel,
        border: `1px solid ${designTokens.colors.border}`,
        borderRadius: designTokens.radius.lg,
        padding: 16,
        boxShadow: designTokens.shadow.card,
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
        <div
          style={{
            width: 44,
            height: 44,
            borderRadius: designTokens.radius.pill,
            background: rankColor,
            color: "#fff",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontWeight: 800,
            fontSize: 20,
          }}
        >
          {entry.rank}
        </div>
        <div style={{ textAlign: "center", lineHeight: 1.1 }}>
          <div style={{ fontWeight: 800, fontSize: 15, fontVariantNumeric: "tabular-nums" }}>{formatCompact(bigValue, lang)}</div>
          <div style={{ fontSize: 11, color: designTokens.colors.muted }}>{bigLabel}</div>
        </div>
      </div>

      <div style={{ minWidth: 0, display: "grid", gap: 12 }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Badge text={t.depth(entry.signals.depth)} />
          {entry.signals.hasDunk ? <Badge text={t.dunk} tone="hot" /> : null}
        </div>

        {reason ? (
          <p
            style={{
              margin: 0,
              fontSize: 14,
              lineHeight: 1.5,
              color: designTokens.colors.foreground,
              background: designTokens.colors.accentSoft,
              borderRadius: designTokens.radius.md,
              padding: "8px 12px",
            }}
          >
            {reason}
          </p>
        ) : null}

        <QuotePreview document={withDisplay(entry.document, display)} />

        <div style={{ display: "flex", flexWrap: "wrap", gap: 14, alignItems: "center" }}>
          <MetricChip label={t.likes} value={formatCompact(m.likes, lang)} />
          <MetricChip label={t.retweets} value={formatCompact(m.retweets, lang)} />
          <MetricChip label={t.replies} value={formatCompact(m.replies, lang)} />
          <MetricChip label={t.quotes} value={formatCompact(m.quotes, lang)} />
          <MetricChip label={t.bookmarks} value={formatCompact(m.bookmarks, lang)} />
          <MetricChip label={t.views} value={formatCompact(m.views, lang)} />
          <span style={{ marginLeft: "auto", display: "inline-flex", gap: 14, alignItems: "center" }}>
            <button
              type="button"
              onClick={() => setShowOriginal((prev) => !prev)}
              aria-pressed={showOriginal}
              style={{
                appearance: "none",
                border: "none",
                background: "transparent",
                padding: 0,
                fontSize: 13,
                fontWeight: 600,
                cursor: "pointer",
                color: showOriginal ? designTokens.colors.accent : designTokens.colors.muted,
              }}
            >
              {showOriginal ? t.hideOriginal : t.showOriginal}
            </button>
            {entry.sourceUrl ? (
              <a href={entry.sourceUrl} target="_blank" rel="noreferrer" style={{ fontSize: 13, color: designTokens.colors.muted }}>
                {t.viewOnX} ↗
              </a>
            ) : null}
            <button
              type="button"
              onClick={() => {
                stashEditorDraft(entry);
                router.push("/");
              }}
              style={{
                appearance: "none",
                border: "1px solid transparent",
                background: designTokens.colors.foreground,
                color: "#fff",
                borderRadius: designTokens.radius.pill,
                padding: "6px 14px",
                fontSize: 13,
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              {t.makeImage} →
            </button>
            {editable ? (
              <button
                type="button"
                onClick={handleRemove}
                disabled={removing}
                style={{
                  appearance: "none",
                  border: `1px solid ${designTokens.colors.border}`,
                  background: designTokens.colors.panel,
                  color: designTokens.colors.danger,
                  borderRadius: designTokens.radius.pill,
                  padding: "6px 12px",
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: removing ? "default" : "pointer",
                  opacity: removing ? 0.6 : 1,
                }}
              >
                {removing ? t.removing : t.remove}
              </button>
            ) : null}
          </span>
        </div>
      </div>
    </article>
  );
}

export function DailyTopView({
  data,
  dates,
  activeDate,
  editable = false,
}: {
  data: DailyTop | null;
  dates: string[];
  activeDate: string;
  editable?: boolean;
}) {
  const router = useRouter();
  const [lang, setLang] = useState<Lang>("zh-CN");

  useEffect(() => {
    const stored = window.localStorage.getItem(storageKeys.uiLanguage);
    if (stored === "en" || stored === "zh-CN") setLang(stored);
  }, []);

  const toggleLang = () => {
    setLang((prev) => {
      const next: Lang = prev === "en" ? "zh-CN" : "en";
      window.localStorage.setItem(storageKeys.uiLanguage, next);
      return next;
    });
  };

  const t = DICT[lang];
  const heading = (lang === "en" ? data?.titleEn : data?.title) || data?.title || t.heading;
  const chains = data?.entries ?? [];
  const hasContent = chains.length > 0;

  return (
    <div className="daily-shell">
      <header style={{ marginBottom: 24 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
          <h1 style={{ margin: 0, fontSize: 28, fontWeight: 800, flex: 1 }}>{heading}</h1>
          <button
            type="button"
            onClick={toggleLang}
            style={{
              appearance: "none",
              border: `1px solid ${designTokens.colors.border}`,
              background: designTokens.colors.panel,
              borderRadius: designTokens.radius.pill,
              padding: "6px 14px",
              fontWeight: 700,
              fontSize: 13,
              cursor: "pointer",
              color: designTokens.colors.foreground,
            }}
          >
            {t.langToggle}
          </button>
        </div>
        <p style={{ margin: "0 0 12px", color: designTokens.colors.muted, lineHeight: 1.5 }}>{t.subtitle}</p>
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          {dates.length > 0 ? (
            <select
              value={activeDate}
              onChange={(event) => {
                router.push(`/daily/${event.target.value}`);
              }}
              style={{
                appearance: "none",
                border: `1px solid ${designTokens.colors.border}`,
                background: designTokens.colors.panel,
                borderRadius: designTokens.radius.md,
                padding: "6px 12px",
                fontSize: 13,
                color: designTokens.colors.foreground,
                cursor: "pointer",
              }}
            >
              {dates.map((date) => (
                <option key={date} value={date}>
                  {date}
                </option>
              ))}
            </select>
          ) : null}
          {data ? (
            <span style={{ fontSize: 13, color: designTokens.colors.muted }}>
              {t.generatedAt} {formatDate(data.generatedAt, lang)}
            </span>
          ) : null}
          <span style={{ marginLeft: "auto", display: "inline-flex", gap: 16 }}>
            <a href="/daily/archive" style={{ fontSize: 13, color: designTokens.colors.accent, fontWeight: 600 }}>
              {t.archive}
            </a>
            <a href="/" style={{ fontSize: 13, color: designTokens.colors.accent, fontWeight: 600 }}>
              {t.editor} →
            </a>
          </span>
        </div>
      </header>

      {!hasContent ? (
        <div
          style={{
            border: `1px dashed ${designTokens.colors.border}`,
            borderRadius: designTokens.radius.lg,
            padding: 48,
            textAlign: "center",
            color: designTokens.colors.muted,
          }}
        >
          {t.empty}
        </div>
      ) : (
        <div className="daily-list">
          {chains.map((entry) => (
            <EntryCard
              key={`chain-${entry.rank}-${entry.sourceUrl}`}
              entry={entry}
              lang={lang}
              date={activeDate}
              editable={editable}
            />
          ))}
        </div>
      )}
    </div>
  );
}
