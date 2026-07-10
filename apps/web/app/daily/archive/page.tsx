import type { Metadata } from "next";
import { designTokens } from "@tweetquote/config";
import { loadDailyIndex } from "../../../lib/daily";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "历史归档 · 每日 X 精华引用榜 · TweetQuote",
  description: "TweetQuote 每日精华引用榜的历史归档。",
};

export default function DailyArchivePage() {
  const index = loadDailyIndex();

  return (
    <main className="page-shell">
      <div style={{ maxWidth: 720, margin: "0 auto", padding: "32px 16px 64px" }}>
        <header style={{ marginBottom: 24 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
            <h1 style={{ margin: 0, fontSize: 28, fontWeight: 800, flex: 1 }}>历史归档</h1>
            <a href="/daily" style={{ fontSize: 13, color: designTokens.colors.accent, fontWeight: 600 }}>
              返回最新 →
            </a>
          </div>
          <p style={{ margin: 0, color: designTokens.colors.muted, lineHeight: 1.5 }}>
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
    </main>
  );
}
