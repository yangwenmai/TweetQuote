import type { Metadata } from "next";
import { designTokens } from "@tweetquote/config";
import { loadDailyIndex } from "../../../lib/daily";
import { SiteFooter, SiteTopbar } from "../../../components/site/site-chrome";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "历史归档 · 每日 X 精华引用榜 · TweetQuote",
  description: "TweetQuote 每日精华引用榜的历史归档。",
};

export default function DailyArchivePage() {
  const index = loadDailyIndex();

  return (
    <main className="page-shell">
      <SiteTopbar lang="zh-CN" active="archive" />
      <div className="daily-shell" style={{ maxWidth: 760 }}>
        <header style={{ marginBottom: 28 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 12, flexWrap: "wrap" }}>
            <h1 className="display" style={{ margin: 0, fontSize: 42, fontWeight: 700, lineHeight: 1.08, flex: 1 }}>
              历史归档
            </h1>
            <a href="/daily" style={{ fontSize: 13, color: designTokens.colors.accent, fontWeight: 700 }}>
              返回最新 →
            </a>
          </div>
          <p style={{ margin: 0, color: designTokens.colors.muted, lineHeight: 1.7, fontSize: 16 }}>
            每日 X 精华引用榜的往期存档，共 {index.length} 期。
          </p>
        </header>

        {index.length === 0 ? (
          <div
            style={{
              border: `1px dashed ${designTokens.colors.border}`,
              borderRadius: designTokens.radius.lg,
              padding: 48,
              textAlign: "center",
              color: designTokens.colors.muted,
            }}
          >
            暂无历史数据。
          </div>
        ) : (
          <div style={{ display: "grid", gap: 12 }}>
            {index.map((item) => (
              <a
                key={item.date}
                href={`/daily/${item.date}`}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 16,
                  background: designTokens.colors.panel,
                  border: `1px solid ${designTokens.colors.border}`,
                  borderRadius: designTokens.radius.lg,
                  padding: "16px 20px",
                  boxShadow: designTokens.shadow.card,
                }}
              >
                <div style={{ fontWeight: 800, fontSize: 18, fontVariantNumeric: "tabular-nums" }}>{item.date}</div>
                <div style={{ flex: 1, minWidth: 0, color: designTokens.colors.muted, fontSize: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {item.title || "每日 X 精华引用榜"}
                </div>
                <div style={{ fontSize: 13, color: designTokens.colors.muted, whiteSpace: "nowrap" }}>
                  {item.chains} 条引用链
                </div>
              </a>
            ))}
          </div>
        )}
      </div>
      <SiteFooter lang="zh-CN" />
    </main>
  );
}
