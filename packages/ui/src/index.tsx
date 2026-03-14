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
        borderRadius: designTokens.radius.pill,
        padding: "10px 16px",
        fontWeight: 600,
        cursor: "pointer",
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
        boxShadow: designTokens.shadow.card,
        padding: 20,
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
        background: designTokens.colors.accentSoft,
        color: designTokens.colors.accent,
        fontSize: 13,
        fontWeight: 600,
      }}
    >
      {label}
    </span>
  );
}

export function QuotePreview({ document }: { document: QuoteDocument }) {
  return (
    <div style={{ display: "grid", gap: 12 }}>
      {document.nodes.map((node) => (
        <article
          key={node.id}
          style={{
            marginLeft: node.depth * 20,
            padding: 16,
            borderRadius: designTokens.radius.md,
            border: `1px solid ${designTokens.colors.border}`,
            background: "#fff",
          }}
        >
          <div style={{ fontWeight: 700 }}>
            {node.author.name || "Unknown"}
            {node.author.handle ? (
              <span style={{ marginLeft: 6, color: designTokens.colors.muted }}>@{node.author.handle}</span>
            ) : null}
          </div>
          <p style={{ margin: "10px 0 0", whiteSpace: "pre-wrap", lineHeight: 1.6 }}>{node.content || "暂无内容"}</p>
          {node.translation.text ? (
            <div
              style={{
                marginTop: 12,
                paddingTop: 12,
                borderTop: `1px dashed ${designTokens.colors.border}`,
                color: designTokens.colors.accent,
              }}
            >
              {node.translation.text}
            </div>
          ) : null}
        </article>
      ))}
    </div>
  );
}
