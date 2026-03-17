import {
  annotationSchema,
  createDefaultQuota,
  normalizeLegacyRenderItems,
  quoteDocumentSchema,
  quoteNodeSchema,
  type TranslationBatchItem,
  translationArtifactSchema,
  type QuoteDocument,
  type QuoteFetchRequest,
  type TranslationArtifact,
  type TranslationProvider,
} from "@tweetquote/domain";
import { apiEnv } from "./env";

const MAX_CHAIN_DEPTH = 10;
const MAX_ANNOTATIONS = 5;

export class ApiError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
    public readonly detail = "",
  ) {
    super(message);
  }
}

function cleanText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export function extractTweetId(value: string) {
  const cleaned = cleanText(value);
  if (!cleaned) return "";
  try {
    const url = new URL(cleaned);
    const parts = url.pathname.split("/").filter(Boolean);
    const statusIndex = parts.findIndex((item) => item === "status");
    if (statusIndex >= 0) {
      const candidate = parts[statusIndex + 1] ?? "";
      return /^\d+$/.test(candidate) ? candidate : "";
    }
  } catch {
    return /^\d+$/.test(cleaned) ? cleaned : "";
  }
  return "";
}

async function fetchJson(url: string, init?: RequestInit) {
  const response = await fetch(url, init);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new ApiError(response.status, `Upstream request failed (${response.status})`, JSON.stringify(data).slice(0, 400));
  }
  return data as Record<string, unknown>;
}

async function fetchTweetById(tweetId: string, apiKey: string) {
  if (!tweetId) {
    throw new ApiError(400, "Missing tweet_id");
  }
  if (!apiKey) {
    throw new ApiError(400, "Missing Twitter API key");
  }
  const data = await fetchJson(`https://api.twitterapi.io/twitter/tweets?tweet_ids=${encodeURIComponent(tweetId)}`, {
    headers: {
      "X-API-Key": apiKey,
      "User-Agent": "TweetQuote/2.0",
    },
  });
  const tweet = Array.isArray(data.tweets) ? data.tweets[0] : null;
  if (!tweet || typeof tweet !== "object") {
    throw new ApiError(404, "Tweet not found");
  }
  return tweet as Record<string, unknown>;
}

export async function resolveQuoteChain(tweetId: string, apiKey: string) {
  const root = await fetchTweetById(tweetId, apiKey);
  const chain: Array<Record<string, unknown>> = [{ ...root, _rel: "root" }];
  const visited = new Set([tweetId]);
  let current = root;

  while (chain.length < MAX_CHAIN_DEPTH) {
    const quoted = typeof current.quoted_tweet === "object" && current.quoted_tweet ? (current.quoted_tweet as Record<string, unknown>) : null;
    const quotedId = cleanText(quoted?.id);
    const replyId = cleanText(current.inReplyToId);
    let nextId = "";
    let relation: "quote" | "reply" = "quote";

    if (quotedId && !visited.has(quotedId)) {
      nextId = quotedId;
      relation = "quote";
    } else if (replyId && !visited.has(replyId)) {
      nextId = replyId;
      relation = "reply";
    }

    if (!nextId) {
      break;
    }

    visited.add(nextId);
    const nextTweet =
      relation === "quote" && quoted?.text && quoted?.author
        ? ({ ...quoted, _rel: relation } as Record<string, unknown>)
        : ({ ...(await fetchTweetById(nextId, apiKey)), _rel: relation } as Record<string, unknown>);
    chain.push(nextTweet);
    current = nextTweet;
  }

  return chain;
}

export async function translateWithGoogle(text: string, targetLanguage: string): Promise<TranslationArtifact> {
  const params = new URLSearchParams({
    client: "gtx",
    sl: "auto",
    tl: targetLanguage,
    dt: "t",
    q: text,
  });
  const raw = await fetch(`https://translate.googleapis.com/translate_a/single?${params.toString()}`, {
    headers: {
      "User-Agent": "Mozilla/5.0 TweetQuote",
    },
  });
  const data = (await raw.json().catch(() => [])) as unknown[];
  if (!raw.ok) {
    throw new ApiError(raw.status, "Google translation failed");
  }
  const translated = Array.isArray(data[0]) ? (data[0] as Array<[string]>).map((item) => item[0]).join("") : "";
  return translationArtifactSchema.parse({
    provider: "google",
    status: "success",
    language: targetLanguage,
    text: translated,
    annotations: [],
    updatedAt: new Date().toISOString(),
    version: 1,
  });
}

function clampAnnotations(raw: unknown, translatedText: string) {
  if (!Array.isArray(raw) || !translatedText) {
    return [];
  }
  const items = raw
    .map((item) => {
      try {
        const parsed = annotationSchema.parse(item);
        return translatedText.includes(parsed.term) ? parsed : null;
      } catch {
        return null;
      }
    })
    .filter(Boolean);
  return items.slice(0, MAX_ANNOTATIONS);
}

export async function translateWithAi(
  text: string,
  targetLanguage: string,
  overrides?: { aiApiKey?: string; aiBaseUrl?: string; aiModel?: string },
): Promise<TranslationArtifact> {
  const aiApiKey = overrides?.aiApiKey || apiEnv.aiApiKey;
  const aiBaseUrl = overrides?.aiBaseUrl || apiEnv.aiBaseUrl;
  const aiModel = overrides?.aiModel || apiEnv.aiModel;
  if (!aiApiKey) {
    throw new ApiError(400, "Missing AI API key");
  }

  const prompt = [
    "You are a professional translator for Twitter/X posts.",
    `Translate into ${targetLanguage.includes("zh") ? "中文" : "English"}.`,
    "Return valid JSON only with { translation, annotations }.",
    `Source text: """${text}"""`,
  ].join("\n");

  const payload = {
    model: aiModel,
    temperature: 0.2,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: "You are a helpful translation assistant." },
      { role: "user", content: prompt },
    ],
  };

  const response = await fetch(`${aiBaseUrl.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${aiApiKey}`,
    },
    body: JSON.stringify(payload),
  });
  const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) {
    throw new ApiError(response.status, "AI translation failed", JSON.stringify(data).slice(0, 400));
  }

  const content = ((data.choices as Array<Record<string, unknown>> | undefined)?.[0]?.message as Record<string, unknown> | undefined)
    ?.content;
  let parsed: Record<string, unknown> = {};
  if (typeof content === "string") {
    try {
      parsed = JSON.parse(content) as Record<string, unknown>;
    } catch {
      throw new ApiError(502, "AI translation returned invalid JSON", content.slice(0, 400));
    }
  }
  const translation = cleanText(parsed.translation);
  if (!translation) {
    throw new ApiError(502, "AI translation missing translation field");
  }

  return translationArtifactSchema.parse({
    provider: "ai",
    status: "success",
    language: targetLanguage,
    text: translation,
    annotations: clampAnnotations(parsed.annotations, translation),
    updatedAt: new Date().toISOString(),
    version: 1,
  });
}

export async function translateText(
  provider: TranslationProvider,
  text: string,
  targetLanguage: string,
  overrides?: { aiApiKey?: string; aiBaseUrl?: string; aiModel?: string },
) {
  if (provider === "ai") {
    return translateWithAi(text, targetLanguage, overrides);
  }
  if (provider === "google") {
    return translateWithGoogle(text, targetLanguage);
  }
  return translationArtifactSchema.parse({
    provider: "none",
    status: "idle",
    language: targetLanguage,
    text: "",
    annotations: [],
    version: 0,
  });
}

export async function translateBatch(
  provider: TranslationProvider,
  items: TranslationBatchItem[],
  targetLanguage: string,
  overrides?: { aiApiKey?: string; aiBaseUrl?: string; aiModel?: string },
) {
  const results = await Promise.all(
    items.map(async (item) => ({
      id: item.id,
      artifact: await translateText(provider, item.text, targetLanguage, overrides),
    })),
  );
  return results;
}

export async function buildDocumentFromQuoteRequest(request: QuoteFetchRequest, quota = createDefaultQuota()): Promise<{
  document: QuoteDocument;
  quota: ReturnType<typeof createDefaultQuota>;
  layers: Array<{
    index: number;
    relation: "root" | "quote" | "reply";
    authorName: string;
    authorHandle: string;
    tweetId: string;
  }>;
}> {
  const tweetId = extractTweetId(request.tweetUrl || request.tweetId || "");
  if (!tweetId) {
    throw new ApiError(400, "Missing or invalid tweetUrl/tweetId");
  }

  const apiKey = request.apiKey || apiEnv.twitterApiKey;
  const chain = await resolveQuoteChain(tweetId, apiKey);
  const document = normalizeLegacyRenderItems(chain, request.source);
  const translatedNodes = await Promise.all(
    document.nodes.map(async (node) => {
      if (!node.content || request.translationProvider === "none") {
        return node;
      }
      const artifact = await translateText(request.translationProvider, node.content, request.targetLanguage, {
        aiApiKey: request.aiApiKey,
        aiBaseUrl: request.aiBaseUrl,
        aiModel: request.aiModel,
      });
      return quoteNodeSchema.parse({
        ...node,
        translation: request.includeAnnotations ? artifact : { ...artifact, annotations: [] },
      });
    }),
  );

  return {
    document: quoteDocumentSchema.parse({
      ...document,
      renderSpec: {
        ...document.renderSpec,
        language: request.targetLanguage,
        translationProvider: request.translationProvider,
        includeAnnotations: request.includeAnnotations,
      },
      nodes: translatedNodes,
      updatedAt: new Date().toISOString(),
    }),
    quota,
    layers: translatedNodes.map((node, index) => ({
      index,
      relation: node.relation,
      authorName: node.author.name,
      authorHandle: node.author.handle,
      tweetId: node.sourceTweetId,
    })),
  };
}
