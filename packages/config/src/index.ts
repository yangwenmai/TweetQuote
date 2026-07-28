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
    background: "#f4efe6",
    panel: "#fffdf8",
    border: "rgba(23, 20, 17, 0.14)",
    foreground: "#171411",
    muted: "#675e54",
    accent: "#284d73",
    accentSoft: "#d9e3ee",
    danger: "#b8434f",
    success: "#4d7c5a",
    clay: "#b86e4f",
  },
  radius: {
    sm: "12px",
    md: "18px",
    lg: "28px",
    pill: "999px",
  },
  shadow: {
    soft: "0 18px 60px rgba(45, 33, 20, 0.12)",
    card: "0 10px 30px rgba(45, 33, 20, 0.08)",
  },
};
