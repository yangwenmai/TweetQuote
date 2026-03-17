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

const repoRoot = fs.existsSync(path.join(process.cwd(), "apps", "api", "prisma", "schema.prisma"))
  ? process.cwd()
  : path.resolve(process.cwd(), "../..");
const localEnv = loadEnvFile(path.join(repoRoot, ".env.local"));

export const apiEnv = {
  port: Number(process.env.PORT || 8787),
  repoRoot,
  trialStorePath: path.join(repoRoot, "data", "trial_sessions.json"),
  documentStorePath: path.join(repoRoot, "data", "documents.json"),
  outputDir: path.join(repoRoot, "output"),
  sqliteDbPath: path.join(repoRoot, "apps", "api", "prisma", "dev.db"),
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
  dailyTrialLimit: 3,
  weeklyTrialLimit: 20,
};
