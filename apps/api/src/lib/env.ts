import fs from "node:fs";
import path from "node:path";

function loadEnvFile(filepath: string) {
  if (!fs.existsSync(filepath)) {
    return {};
  }

  return fs
    .readFileSync(filepath, "utf8")
    .split("\n")
    .reduce<Record<string, string>>((acc, line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) {
        return acc;
      }
      const [key, ...rest] = trimmed.split("=");
      if (!key) {
        return acc;
      }
      const value = rest.join("=").trim().replace(/^['"]|['"]$/g, "");
      acc[key.trim()] = value;
      return acc;
    }, {});
}

/** True when value is 1, true, yes, or on (case-insensitive). Empty is false. */
function parseEnvBool(processVal: string | undefined, localVal: string | undefined): boolean {
  const raw = (processVal ?? localVal ?? "").trim().toLowerCase();
  if (!raw) return false;
  return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
}

const repoRoot = fs.existsSync(path.join(process.cwd(), "apps", "api", "prisma", "schema.prisma"))
  ? process.cwd()
  : path.resolve(process.cwd(), "../..");
const localEnv = loadEnvFile(path.join(repoRoot, ".env.local"));

export const apiEnv = {
  port: Number(process.env.PORT || 8787),
  repoRoot,
  outputDir: path.join(repoRoot, "output"),
  aiProvider: process.env.LLM_PROVIDER || localEnv.LLM_PROVIDER || "",
  aiApiKey: process.env.OPENAI_API_KEY || localEnv.OPENAI_API_KEY || "",
  aiBaseUrl: process.env.OPENAI_BASE_URL || localEnv.OPENAI_BASE_URL || "https://api.openai.com/v1",
  aiModel: process.env.OPENAI_MODEL || localEnv.OPENAI_MODEL || "gpt-4o-mini",
  twitterApiKey: process.env.TWITTERAPI_KEY || localEnv.TWITTERAPI_KEY || "",
  publicApiBaseUrl: process.env.PUBLIC_API_BASE_URL || localEnv.PUBLIC_API_BASE_URL || "",
  imageProxyAllowedHosts: (process.env.IMAGE_PROXY_ALLOWED_HOSTS || localEnv.IMAGE_PROXY_ALLOWED_HOSTS || "pbs.twimg.com")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean),
  supportUrl: process.env.SUPPORT_CONTACT_URL || "https://x.com/maiyangai",
  adminToken: process.env.ADMIN_TOKEN || localEnv.ADMIN_TOKEN || "",
  /** When true (see `parseEnvBool`), `fetchTweetById` logs full upstream tweet JSON (truncated, redacted) at debug level. */
  twitterLogFullTweetJson: parseEnvBool(process.env.TWITTER_LOG_FULL_TWEET_JSON, localEnv.TWITTER_LOG_FULL_TWEET_JSON),
  /**
   * When true, hosted Twitter/AI usage is not counted and `requiresUpgrade` is never set (local dev / self-hosted).
   * Does not affect users who pass their own `apiKey` / `aiApiKey` (those paths were already unlimited for "own key").
   */
  disableHostedQuota: parseEnvBool(process.env.TWEETQUOTE_DISABLE_HOSTED_QUOTA, localEnv.TWEETQUOTE_DISABLE_HOSTED_QUOTA),
  dailyTrialLimit: Math.max(1, Number(process.env.TWEETQUOTE_DAILY_TRIAL_LIMIT ?? localEnv.TWEETQUOTE_DAILY_TRIAL_LIMIT ?? 3)) || 3,
  weeklyTrialLimit: Math.max(1, Number(process.env.TWEETQUOTE_WEEKLY_TRIAL_LIMIT ?? localEnv.TWEETQUOTE_WEEKLY_TRIAL_LIMIT ?? 20)) || 20,
  /** Absolute path to SQLite file when DATABASE_URL is unset (dev default). */
  sqliteDbPath: path.join(repoRoot, "apps", "api", "prisma", "dev.db"),
};
