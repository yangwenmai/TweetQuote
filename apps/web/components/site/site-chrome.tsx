import type { ReactNode } from "react";
import { defaultEnvironment } from "@tweetquote/config";

type Lang = "zh-CN" | "en";

type NavKey = "editor" | "daily" | "archive";

const MARKETING_URL = defaultEnvironment.marketingSiteUrl;

const NAV_LABELS: Record<Lang, Record<NavKey | "home", string>> = {
  "zh-CN": { home: "官网", editor: "编辑器", daily: "每日榜", archive: "历史归档" },
  en: { home: "Home", editor: "Editor", daily: "Daily", archive: "Archive" },
};

const BRAND_TAGLINE: Record<Lang, string> = {
  "zh-CN": "引用链，一键成图",
  en: "Quote chains, beautifully framed",
};

const CTA_LABEL: Record<Lang, string> = {
  "zh-CN": "安装插件",
  en: "Install",
};

const EXTENSION_URL = "https://github.com/yangwenmai/TweetQuote/releases";

export function SiteTopbar({
  lang,
  active,
  onToggleLang,
  actions,
}: {
  lang: Lang;
  active?: NavKey;
  /** When provided, renders an interactive language toggle (client pages only). */
  onToggleLang?: () => void;
  /** Page-specific controls rendered on the right side (e.g. editor actions). */
  actions?: ReactNode;
}) {
  const nav = NAV_LABELS[lang];
  return (
    <header className="site-topbar">
      <div className="site-topbar-inner">
        <a href={MARKETING_URL} className="brand" aria-label="Tweet Quote">
          <span className="brand-mark" aria-hidden="true" />
          <span className="brand-copy">
            <span className="brand-name">Tweet Quote</span>
            <span className="brand-tagline">{BRAND_TAGLINE[lang]}</span>
          </span>
        </a>
        <nav className="nav-links">
          <a href={MARKETING_URL} className="nav-link">
            {nav.home}
          </a>
          <a href="/" className={`nav-link${active === "editor" ? " active" : ""}`}>
            {nav.editor}
          </a>
          <a href="/daily" className={`nav-link${active === "daily" ? " active" : ""}`}>
            {nav.daily}
          </a>
          <a href="/daily/archive" className={`nav-link${active === "archive" ? " active" : ""}`}>
            {nav.archive}
          </a>
          <a href="https://github.com/yangwenmai/tweetquote" target="_blank" rel="noreferrer" className="nav-link">
            GitHub
          </a>
          {onToggleLang ? (
            <button type="button" className="lang-toggle" onClick={onToggleLang}>
              {lang === "en" ? "中文" : "EN"}
            </button>
          ) : null}
          {actions}
          <a href={EXTENSION_URL} target="_blank" rel="noreferrer" className="nav-link nav-cta">
            {CTA_LABEL[lang]}
          </a>
        </nav>
      </div>
    </header>
  );
}

export function SiteFooter({ lang }: { lang: Lang }) {
  const copy = lang === "en" ? "Tweet Quote — for people who care about context." : "Tweet Quote — 为在意上下文的人而做。";
  const homeLabel = NAV_LABELS[lang].home;
  return (
    <footer className="site-footer">
      <div className="site-footer-inner">
        <p style={{ margin: 0 }}>{copy}</p>
        <div className="footer-links">
          <a href={MARKETING_URL}>{homeLabel}</a>
          <a href="https://x.com/maiyangai" target="_blank" rel="noreferrer">
            @MaiYangAI
          </a>
          <a href="https://github.com/yangwenmai/tweetquote" target="_blank" rel="noreferrer">
            GitHub
          </a>
          <a href="https://github.com/yangwenmai/tweetquote/blob/main/LICENSE" target="_blank" rel="noreferrer">
            MIT License
          </a>
        </div>
      </div>
    </footer>
  );
}
