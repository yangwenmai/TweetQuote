/**
 * Recursively redact secrets from values before logging or returning in error detail.
 * Matches common key names (api_key, token, Authorization, …) and obvious token-shaped strings.
 */
const REDACTED = "[REDACTED]";

function isSensitiveKey(k: string): boolean {
  const key = k.toLowerCase().replace(/-/g, "_");
  if (
    key === "password" ||
    key === "secret" ||
    key === "token" ||
    key === "authorization" ||
    key === "bearer" ||
    key === "apikey" ||
    key === "api_key" ||
    key === "x_api_key" ||
    key === "access_token" ||
    key === "refresh_token" ||
    key === "client_secret" ||
    key === "openai_api_key" ||
    key === "twitterapi_key" ||
    key === "aiapikey"
  ) {
    return true;
  }
  if (key.endsWith("_api_key") || key.endsWith("api_key")) return true;
  if (key.endsWith("apikey") && key !== "apikey") return true;
  if (key.includes("private_key")) return true;
  return false;
}

function redactString(s: string): string {
  const t = s.trim();
  if (/^sk-[a-zA-Z0-9_-]{10,}$/i.test(t)) return REDACTED;
  if (/^Bearer\s+\S+$/i.test(s)) return `Bearer ${REDACTED}`;
  return s;
}

export function redactForLog(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === "string") return redactString(value);
  if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") return value;
  if (Array.isArray(value)) return value.map((v) => redactForLog(v));
  if (typeof value === "object") {
    const o = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(o)) {
      out[k] = isSensitiveKey(k) ? REDACTED : redactForLog(v);
    }
    return out;
  }
  return value;
}

/** JSON.stringify after redaction, then truncate for logs / ApiError.detail. */
export function safeJsonForLog(value: unknown, maxLen = 400): string {
  try {
    const s = JSON.stringify(redactForLog(value));
    if (s.length <= maxLen) return s;
    return `${s.slice(0, maxLen)}…`;
  } catch {
    return "[unserializable]";
  }
}
