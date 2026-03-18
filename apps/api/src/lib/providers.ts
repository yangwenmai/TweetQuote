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
import { logger } from "./logger";

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
  logger.debug("google", `Translating text (${text.length} chars) → ${targetLanguage}`);
  const start = Date.now();
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
    logger.error("google", `Translation failed with status ${raw.status}`);
    throw new ApiError(raw.status, "Google translation failed");
  }
  const translated = Array.isArray(data[0]) ? (data[0] as Array<[string]>).map((item) => item[0]).join("") : "";
  logger.debug("google", `Translation done (${Date.now() - start}ms)`, {
    inputLength: text.length,
    outputLength: translated.length,
    preview: translated.slice(0, 80),
  });
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

  logger.debug("ai", `AI translate request`, {
    textLength: text.length,
    targetLanguage,
    model: aiModel,
    baseUrlHost: (() => { try { return new URL(aiBaseUrl).hostname; } catch { return aiBaseUrl; } })(),
    keySource: overrides?.aiApiKey ? "client" : "server",
  });

  if (!aiApiKey) {
    logger.error("ai", "Missing AI API key — neither client nor server key provided");
    throw new ApiError(400, "Missing AI API key");
  }

  const langName = targetLanguage.includes("zh") ? "中文" : "English";
  const prompt = [
    "You are a professional translator for Twitter/X posts.",
    `Translate into ${langName}. Keep the wording natural, faithful, and easy to read.`,
    "",
    "Annotation rules (STRICT):",
    `- Maximum ${MAX_ANNOTATIONS} annotations total per item, and 0 annotations is allowed.`,
    "- ONLY annotate niche technical jargon, obscure acronyms, cultural references, or subculture slang that a general reader would likely miss.",
    "- NEVER annotate common tech words, well-known companies, everyday vocabulary, or terms shorter than 2 characters.",
    "- The term field must be the EXACT substring appearing in the translated text.",
    `- explanation must be concise and written in ${langName}.`,
    "",
    `Source text:\n"""${text}"""`,
    "",
    "Respond ONLY in valid JSON:",
    '{"translation":"full translated text","annotations":[{"term":"exact translated substring","original":"source term","type":"academic|slang|idiom|cultural|technical|reference","explanation":"concise explanation"}]}',
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

  const endpoint = `${aiBaseUrl.replace(/\/$/, "")}/chat/completions`;
  logger.debug("ai", `Calling LLM API`, { endpoint, model: aiModel });
  const start = Date.now();

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${aiApiKey}`,
    },
    body: JSON.stringify(payload),
  });
  const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  const elapsed = Date.now() - start;

  if (!response.ok) {
    logger.error("ai", `LLM API returned ${response.status} (${elapsed}ms)`, {
      detail: JSON.stringify(data).slice(0, 400),
    });
    throw new ApiError(response.status, "AI translation failed", JSON.stringify(data).slice(0, 400));
  }

  logger.debug("ai", `LLM API responded (${elapsed}ms)`, {
    model: aiModel,
    usage: data.usage,
  });

  const content = ((data.choices as Array<Record<string, unknown>> | undefined)?.[0]?.message as Record<string, unknown> | undefined)
    ?.content;
  let parsed: Record<string, unknown> = {};
  if (typeof content === "string") {
    try {
      parsed = JSON.parse(content) as Record<string, unknown>;
    } catch {
      logger.error("ai", "LLM returned invalid JSON", { contentPreview: content.slice(0, 200) });
      throw new ApiError(502, "AI translation returned invalid JSON", content.slice(0, 400));
    }
  }
  const translation = cleanText(parsed.translation);
  if (!translation) {
    logger.error("ai", "LLM response missing 'translation' field", { parsedKeys: Object.keys(parsed) });
    throw new ApiError(502, "AI translation missing translation field");
  }

  logger.debug("ai", `AI translate done (${elapsed}ms)`, {
    inputLength: text.length,
    outputLength: translation.length,
    annotationCount: Array.isArray(parsed.annotations) ? parsed.annotations.length : 0,
    preview: translation.slice(0, 80),
  });

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
  logger.debug("translate", `translateText called`, { provider, textLength: text.length, targetLanguage });
  if (provider === "ai") {
    return translateWithAi(text, targetLanguage, overrides);
  }
  if (provider === "google") {
    return translateWithGoogle(text, targetLanguage);
  }
  logger.warn("translate", `No-op translation — provider is "${provider}"`);
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
  logger.info("translate", `translateBatch: ${items.length} items via "${provider}"`, { targetLanguage });
  const start = Date.now();
  const results = await Promise.all(
    items.map(async (item, idx) => {
      logger.debug("translate", `  batch item ${idx + 1}/${items.length} (id=${item.id})`);
      const artifact = await translateText(provider, item.text, targetLanguage, overrides);
      logger.debug("translate", `  batch item ${idx + 1}/${items.length} done`);
      return { id: item.id, artifact };
    }),
  );
  logger.info("translate", `translateBatch done: ${items.length} items in ${Date.now() - start}ms`);
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
