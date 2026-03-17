import * as React from "react";
import { designTokens } from "@tweetquote/config";
import type { QuoteDocument } from "@tweetquote/domain";

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  tone?: "primary" | "secondary" | "ghost";
};

export function Button({ tone = "primary", style, ...props }: ButtonProps) {
  const palette =
    tone === "secondary"
      ? {
          background: designTokens.colors.accentSoft,
          color: designTokens.colors.accent,
          border: `1px solid ${designTokens.colors.border}`,
        }
      : tone === "ghost"
        ? {
            background: "transparent",
            color: designTokens.colors.foreground,
            border: `1px solid ${designTokens.colors.border}`,
          }
        : {
            background: designTokens.colors.foreground,
            color: "#fff",
            border: "1px solid transparent",
          };

  return (
    <button
      {...props}
      style={{
        appearance: "none",
        WebkitAppearance: "none",
        borderRadius: 10,
        padding: "10px 14px",
        fontWeight: 700,
        fontSize: 14,
        lineHeight: 1.2,
        transition: "all 0.15s ease",
        boxShadow: "0 1px 2px rgba(15, 20, 25, 0.04)",
        opacity: props.disabled ? 0.55 : 1,
        cursor: props.disabled ? "default" : "pointer",
        ...palette,
        ...style,
      }}
    />
  );
}

export function SurfaceCard({
  children,
  title,
  subtitle,
}: React.PropsWithChildren<{ title?: string; subtitle?: string }>) {
  return (
    <section
      style={{
        background: designTokens.colors.panel,
        border: `1px solid ${designTokens.colors.border}`,
        borderRadius: designTokens.radius.lg,
        boxShadow: "none",
        padding: 16,
      }}
    >
      {(title || subtitle) && (
        <header style={{ marginBottom: 16 }}>
          {title && <h3 style={{ margin: 0, fontSize: 18 }}>{title}</h3>}
          {subtitle && (
            <p style={{ margin: "6px 0 0", color: designTokens.colors.muted, lineHeight: 1.5 }}>{subtitle}</p>
          )}
        </header>
      )}
      {children}
    </section>
  );
}

export function StatBadge({ label }: { label: string }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "6px 10px",
        borderRadius: designTokens.radius.pill,
        border: `1px solid ${designTokens.colors.border}`,
        background: "#ffffff",
        color: designTokens.colors.muted,
        fontSize: 12,
        fontWeight: 600,
      }}
    >
      {label}
    </span>
  );
}

function formatViewCount(value: number) {
  if (value >= 1e6) return `${(value / 1e6).toFixed(1).replace(/\.0$/, "")}M`;
  if (value >= 1e3) return `${(value / 1e3).toFixed(1).replace(/\.0$/, "")}K`;
  return String(value);
}

function formatCreatedAt(value: string) {
  const raw = value.trim();
  if (!raw) return "";

  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) {
    return new Intl.DateTimeFormat(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(parsed);
  }

  return raw.replace(/\s[+-]\d{4}(?=\s\d{4}$)/, "");
}

function getTranslationLabel(language: string) {
  if (language === "zh-CN") return "中文译文";
  if (language === "en") return "English translation";
  return `Translation (${language})`;
}

function getAvatarSrc(avatarUrl: string) {
  const trimmed = avatarUrl.trim();
  if (!trimmed) return "";
  // 直接使用原始 URL，Twitter 头像等公开图片可正常显示
  return trimmed;
}

function ViewsIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      width="16"
      height="16"
      fill="currentColor"
      style={{ display: "block" }}
    >
      <path d="M8.75 21V3h2v18h-2Zm8.5 0V3h2v18h-2Zm-4.25 0v-9h2v9h-2ZM4.5 21v-6h2v6h-2Z" />
    </svg>
  );
}

export function QuotePreview({ document }: { document: QuoteDocument }) {
  return (
    <div style={{ display: "grid", gap: 12 }}>
      {document.nodes.map((node) => {
        const translatedText = node.translation.text.trim();
        const originalText = node.content.trim();
        const showBilingual = Boolean(originalText && translatedText && document.renderSpec.translationDisplay === "bilingual");
        const primaryText =
          translatedText && document.renderSpec.translationDisplay === "replace"
            ? translatedText
            : originalText || translatedText || "暂无内容";

        return (
          <div
            key={node.id}
            style={{
              position: "relative",
              paddingLeft: `${node.depth * 22}px`,
            }}
          >
            {node.depth > 0 &&
              Array.from({ length: node.depth }).map((_, level) => {
                const isCurrentLevel = level === node.depth - 1;
                return (
                  <div
                    key={`${node.id}-rail-${level}`}
                    aria-hidden="true"
                    style={{
                      position: "absolute",
                      top: 0,
                      bottom: 0,
                      left: `${level * 22 + 9}px`,
                      width: isCurrentLevel ? 2 : 1,
                      borderRadius: 999,
                      background: isCurrentLevel ? "rgba(29, 155, 240, 0.35)" : "rgba(225, 232, 237, 0.95)",
                    }}
                  />
                );
              })}
            {node.depth > 0 ? (
              <div
                aria-hidden="true"
                style={{
                  position: "absolute",
                  top: 28,
                  left: `${node.depth * 22 - 2}px`,
                  width: 10,
                  height: 10,
                  borderRadius: 999,
                  background: "#fff",
                  border: `2px solid ${designTokens.colors.accent}`,
                  boxSizing: "border-box",
                }}
              />
            ) : null}
            <article
              style={{
                padding: node.depth === 0 ? "16px 16px 12px" : "12px 16px",
                borderRadius: 16,
                border: `1px solid ${designTokens.colors.border}`,
                background: "#fff",
                boxShadow: node.depth === 0 ? designTokens.shadow.card : "none",
              }}
            >
              <div style={{ display: "flex", gap: 10, alignItems: "flex-start", minWidth: 0 }}>
                {node.author.avatarUrl ? (
                  <img
                    src={getAvatarSrc(node.author.avatarUrl)}
                    alt={node.author.name || "avatar"}
                    width={40}
                    height={40}
                    crossOrigin="anonymous"
                    referrerPolicy="no-referrer"
                    style={{ borderRadius: "999px", objectFit: "cover", flexShrink: 0 }}
                  />
                ) : (
                  <div
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: "999px",
                      background: "#536471",
                      color: "#fff",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontWeight: 700,
                      flexShrink: 0,
                    }}
                  >
                    {(node.author.name || "?").slice(0, 1).toUpperCase()}
                  </div>
                )}
                <div
                  style={{
                    minWidth: 0,
                    display: "flex",
                    flexDirection: node.depth === 0 ? "column" : "row",
                    flexWrap: "wrap",
                    gap: 4,
                    alignItems: node.depth === 0 ? "flex-start" : "center",
                  }}
                >
                  <div
                    style={{
                      fontWeight: 700,
                      fontSize: 15,
                      color: designTokens.colors.foreground,
                      display: "flex",
                      alignItems: "center",
                    }}
                  >
                    {node.author.name || "Unknown"}
                  </div>
                  {node.author.handle ? (
                    <div style={{ color: designTokens.colors.muted, fontSize: 14 }}>@{node.author.handle.replace(/^@/, "")}</div>
                  ) : null}
                </div>
              </div>
              <p style={{ margin: "10px 0 0", whiteSpace: "pre-wrap", lineHeight: 1.6, fontSize: 15 }}>{primaryText}</p>
              {(node.createdAt || node.viewCount !== null) && (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    color: designTokens.colors.muted,
                    flexWrap: "wrap",
                    marginTop: node.depth === 0 ? 12 : 8,
                    fontSize: node.depth === 0 ? 15 : 13,
                  }}
                >
                  {node.createdAt ? <span>{formatCreatedAt(node.createdAt)}</span> : null}
                  {node.createdAt && node.viewCount !== null ? <span>·</span> : null}
                  {node.viewCount !== null ? (
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                      <ViewsIcon />
                      <span>{formatViewCount(node.viewCount)} Views</span>
                    </span>
                  ) : null}
                </div>
              )}
              {showBilingual ? (
                <div
                  style={{
                    marginTop: 12,
                    paddingTop: 12,
                    borderTop: `1px solid ${designTokens.colors.border}`,
                  }}
                >
                  <div
                    style={{
                      color: designTokens.colors.accent,
                      fontSize: 12,
                      fontWeight: 700,
                      marginBottom: 6,
                    }}
                  >
                    {getTranslationLabel(node.translation.language)}
                  </div>
                  <p style={{ margin: 0, whiteSpace: "pre-wrap", lineHeight: 1.6, fontSize: 15, color: designTokens.colors.foreground }}>
                    {translatedText}
                  </p>
                </div>
              ) : null}
            </article>
          </div>
        );
      })}
    </div>
  );
}
