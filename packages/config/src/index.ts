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
    background: "#f6f2ea",
    panel: "#fffdf9",
    border: "rgba(42, 33, 27, 0.12)",
    foreground: "#221c18",
    muted: "#786d65",
    accent: "#355c7d",
    accentSoft: "#ecf1f7",
    danger: "#9f4d3e",
    success: "#2f6f53",
  },
  radius: {
    sm: "10px",
    md: "16px",
    lg: "24px",
    pill: "999px",
  },
  shadow: {
    soft: "0 16px 48px rgba(34, 28, 24, 0.08)",
    card: "0 8px 24px rgba(34, 28, 24, 0.06)",
  },
};
