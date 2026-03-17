export type RuntimeTarget = "web" | "api" | "extension";

export type AppEnvironment = {
  appName: string;
  marketingSiteUrl: string;
  apiBaseUrl: string;
  supportUrl: string;
  xOriginPatterns: string[];
  featureFlags: {
    v2Editor: boolean;
    v2Extension: boolean;
    v2Api: boolean;
  };
};

export const defaultEnvironment: AppEnvironment = {
  appName: "TweetQuote",
  marketingSiteUrl: "https://tweetquote.app",
  apiBaseUrl: "http://localhost:8787",
  supportUrl: "https://x.com/maiyangai",
  xOriginPatterns: ["https://x.com/*", "https://twitter.com/*"],
  featureFlags: {
    v2Editor: true,
    v2Extension: true,
    v2Api: true,
  },
};

export function getEnv(target: RuntimeTarget): AppEnvironment {
  const globalSource =
    target === "api"
      ? process.env
      : (globalThis as typeof globalThis & { __TQ_ENV__?: Record<string, string | undefined> }).__TQ_ENV__;

  return {
    appName: globalSource?.NEXT_PUBLIC_APP_NAME || defaultEnvironment.appName,
    marketingSiteUrl: globalSource?.NEXT_PUBLIC_MARKETING_SITE_URL || defaultEnvironment.marketingSiteUrl,
    apiBaseUrl: globalSource?.NEXT_PUBLIC_API_BASE_URL || defaultEnvironment.apiBaseUrl,
    supportUrl: globalSource?.NEXT_PUBLIC_SUPPORT_URL || defaultEnvironment.supportUrl,
    xOriginPatterns: defaultEnvironment.xOriginPatterns,
    featureFlags: {
      v2Editor: (globalSource?.NEXT_PUBLIC_FLAG_V2_EDITOR || "true") !== "false",
      v2Extension: (globalSource?.NEXT_PUBLIC_FLAG_V2_EXTENSION || "true") !== "false",
      v2Api: (globalSource?.NEXT_PUBLIC_FLAG_V2_API || "true") !== "false",
    },
  };
}

export const designTokens = {
  colors: {
    background: "#f5f8fa",
    panel: "#ffffff",
    border: "#e1e8ed",
    foreground: "#0f1419",
    muted: "#536471",
    accent: "#1d9bf0",
    accentSoft: "#e8f5fd",
    danger: "#e0245e",
    success: "#17bf63",
  },
  radius: {
    sm: "8px",
    md: "12px",
    lg: "16px",
    pill: "999px",
  },
  shadow: {
    soft: "0 4px 16px rgba(15, 20, 25, 0.08)",
    card: "0 1px 3px rgba(15, 20, 25, 0.08)",
  },
};
