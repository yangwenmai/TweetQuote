import { z } from "zod";

export const languageSchema = z.enum(["zh-CN", "en"]);
export type AppLanguage = z.infer<typeof languageSchema>;

export const sourceKindSchema = z.enum(["web", "extension", "share-link", "import"]);
export type SourceKind = z.infer<typeof sourceKindSchema>;

export const translationProviderSchema = z.enum(["none", "google", "ai"]);
export type TranslationProvider = z.infer<typeof translationProviderSchema>;

export const translationDisplaySchema = z.enum(["replace", "bilingual", "original"]);
export type TranslationDisplay = z.infer<typeof translationDisplaySchema>;

export const quoteRelationSchema = z.enum(["root", "quote", "reply"]);
export type QuoteRelation = z.infer<typeof quoteRelationSchema>;

export const translationStatusSchema = z.enum([
  "idle",
  "queued",
  "running",
  "success",
  "stale",
  "error",
]);
export type TranslationStatus = z.infer<typeof translationStatusSchema>;

export const annotationTypeSchema = z.enum([
  "academic",
  "slang",
  "idiom",
  "cultural",
  "technical",
  "reference",
]);
export type AnnotationType = z.infer<typeof annotationTypeSchema>;

export const quoteAuthorSchema = z.object({
  id: z.string().optional(),
  name: z.string().default(""),
  handle: z.string().default(""),
  avatarUrl: z.string().url().optional().or(z.literal("")),
  isVerified: z.boolean().default(false),
});
export type QuoteAuthor = z.infer<typeof quoteAuthorSchema>;

export const annotationSchema = z.object({
  term: z.string().min(1),
  original: z.string().default(""),
  type: annotationTypeSchema.default("reference"),
  explanation: z.string().default(""),
});
export type Annotation = z.infer<typeof annotationSchema>;

export const translationArtifactSchema = z.object({
  provider: translationProviderSchema.default("none"),
  status: translationStatusSchema.default("idle"),
  language: languageSchema.default("zh-CN"),
  text: z.string().default(""),
  annotations: z.array(annotationSchema).default([]),
  error: z.string().default(""),
  updatedAt: z.string().datetime().optional(),
  version: z.number().int().nonnegative().default(0),
});
export type TranslationArtifact = z.infer<typeof translationArtifactSchema>;

export const articleBlockTypeSchema = z.enum([
  "unstyled",
  "header-one",
  "header-two",
  "header-three",
  "unordered-list-item",
  "ordered-list-item",
  "image",
  "gif",
  "markdown",
  "divider",
]);
export type ArticleBlockType = z.infer<typeof articleBlockTypeSchema>;

export const articleBlockSchema = z.object({
  type: articleBlockTypeSchema,
  text: z.string().optional(),
  url: z.string().optional(),
  previewUrl: z.string().optional(),
});
export type ArticleBlock = z.infer<typeof articleBlockSchema>;

export const articleContentSchema = z.object({
  title: z.string().default(""),
  previewText: z.string().default(""),
  coverUrl: z.string().default(""),
  blocks: z.array(articleBlockSchema).default([]),
});
export type ArticleContent = z.infer<typeof articleContentSchema>;

export const engagementMetricsSchema = z.object({
  views: z.number().int().nonnegative().nullable().default(null),
  likes: z.number().int().nonnegative().nullable().default(null),
  retweets: z.number().int().nonnegative().nullable().default(null),
  replies: z.number().int().nonnegative().nullable().default(null),
  quotes: z.number().int().nonnegative().nullable().default(null),
  bookmarks: z.number().int().nonnegative().nullable().default(null),
});
export type EngagementMetrics = z.infer<typeof engagementMetricsSchema>;

export const quoteNodeSchema = z.object({
  id: z.string(),
  relation: quoteRelationSchema.default("quote"),
  depth: z.number().int().min(0).default(0),
  sourceTweetId: z.string().default(""),
  author: quoteAuthorSchema,
  content: z.string().default(""),
  createdAt: z.string().default(""),
  viewCount: z.number().int().nonnegative().nullable().default(null),
  metrics: engagementMetricsSchema.default((): EngagementMetrics => ({
    views: null,
    likes: null,
    retweets: null,
    replies: null,
    quotes: null,
    bookmarks: null,
  })),
  media: z.array(z.string().url()).default([]),
  article: articleContentSchema.optional(),
  translation: translationArtifactSchema.default(
    (): TranslationArtifact => ({
      provider: "none",
      status: "idle",
      language: "zh-CN",
      text: "",
      annotations: [],
      error: "",
      version: 0,
    }),
  ),
});
export type QuoteNode = z.infer<typeof quoteNodeSchema>;

export const renderSpecSchema = z.object({
  language: languageSchema.default("zh-CN"),
  translationProvider: translationProviderSchema.default("none"),
  translationDisplay: translationDisplaySchema.default("replace"),
  includeAnnotations: z.boolean().default(true),
  exportScale: z.number().int().min(1).max(4).default(2),
  theme: z.enum(["paper", "night"]).default("paper"),
});
export type RenderSpec = z.infer<typeof renderSpecSchema>;

export const fetchContextSchema = z.object({
  source: sourceKindSchema.default("web"),
  entryUrl: z.string().url(),
  tweetId: z.string().default(""),
  pageLanguage: z.string().default("en"),
  capturedAt: z.string().datetime(),
});
export type FetchContext = z.infer<typeof fetchContextSchema>;

export const documentStatusSchema = z.enum(["draft", "ready", "archived"]);
export type DocumentStatus = z.infer<typeof documentStatusSchema>;

export const quoteDocumentSchema = z.object({
  id: z.string(),
  title: z.string().default("Untitled quote"),
  status: documentStatusSchema.default("draft"),
  nodes: z.array(quoteNodeSchema).default([]),
  renderSpec: renderSpecSchema.default(
    (): RenderSpec => ({
      language: "zh-CN",
      translationProvider: "none",
      translationDisplay: "replace",
      includeAnnotations: true,
      exportScale: 2,
      theme: "paper",
    }),
  ),
  fetchContext: fetchContextSchema.optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type QuoteDocument = z.infer<typeof quoteDocumentSchema>;

/** Derived signals that explain why a chain scores as "essence" (for badges + sorting). */
export const essenceSignalsSchema = z.object({
  /** Number of tweets in the chain (1 = lone tweet). */
  depth: z.number().int().nonnegative().default(1),
  /** A quote/reply out-performed the root tweet — the commentary is the story. */
  hasDunk: z.boolean().default(false),
  /** Index of the highest-engagement node in the chain. */
  peakIndex: z.number().int().nonnegative().default(0),
  /** Heat of that peak node. */
  peakHeat: z.number().nonnegative().default(0),
});
export type EssenceSignals = z.infer<typeof essenceSignalsSchema>;

/** One ranked item on a Daily Top list — a full quote chain plus denormalized heat data. */
export const dailyTopEntrySchema = z.object({
  rank: z.number().int().positive(),
  /** Essence score used for ranking chains (heat boosted by chain-quality signals). */
  essenceScore: z.number().nonnegative().default(0),
  /** Raw peak engagement heat (before chain boosts) — kept for display. */
  heatScore: z.number().nonnegative().default(0),
  signals: essenceSignalsSchema.default((): EssenceSignals => ({
    depth: 1,
    hasDunk: false,
    peakIndex: 0,
    peakHeat: 0,
  })),
  sourceUrl: z.string().default(""),
  /** Optional editorial one-liner on why it made the list (zh / en). */
  reason: z.string().default(""),
  reasonEn: z.string().default(""),
  /** Peak-node metrics, copied out for easy display/sorting. */
  metrics: engagementMetricsSchema.default((): EngagementMetrics => ({
    views: null,
    likes: null,
    retweets: null,
    replies: null,
    quotes: null,
    bookmarks: null,
  })),
  document: quoteDocumentSchema,
});
export type DailyTopEntry = z.infer<typeof dailyTopEntrySchema>;

/** A single day's leaderboard, persisted as apps/web/data/daily/<date>.json. */
export const dailyTopSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  title: z.string().default(""),
  titleEn: z.string().default(""),
  generatedAt: z.string().datetime(),
  /** The board: quote chains (nodes >= 2), ranked by essence score. Lone tweets never make the list. */
  entries: z.array(dailyTopEntrySchema).default([]),
});
export type DailyTop = z.infer<typeof dailyTopSchema>;

/**
 * Composite "heat" score from engagement metrics. Weights favor active
 * amplification (retweets/quotes) and intent (bookmarks) over passive views.
 */
export function computeHeatScore(metrics: EngagementMetrics): number {
  const likes = metrics.likes ?? 0;
  const retweets = metrics.retweets ?? 0;
  const replies = metrics.replies ?? 0;
  const quotes = metrics.quotes ?? 0;
  const bookmarks = metrics.bookmarks ?? 0;
  const views = metrics.views ?? 0;
  return Math.round(likes * 1 + retweets * 3 + quotes * 3 + replies * 2 + bookmarks * 2 + views * 0.02);
}

/**
 * "Essence" score for a quote chain — the metric aligned with TweetQuote's core.
 * Starts from the chain's peak engagement, then boosts for signals that a chain
 * carries real conversational value:
 *  - depth: longer chains carry more context
 *  - dunk: a quote/reply out-performing the original (the commentary is the story)
 *  - save-rate: high bookmark/like ratio ~ high information density
 */
export function computeEssence(document: Pick<QuoteDocument, "nodes">): {
  score: number;
  heat: number;
  signals: EssenceSignals;
} {
  const nodes = document.nodes;
  const heats = nodes.map((node) => computeHeatScore(node.metrics));
  const peakHeat = heats.length ? Math.max(...heats) : 0;
  const peakIndex = Math.max(0, heats.indexOf(peakHeat));
  const rootHeat = heats[0] ?? 0;
  const depth = nodes.length;
  const hasDunk = depth > 1 && peakIndex > 0 && peakHeat > rootHeat;
  const peakNode = nodes[peakIndex];
  const peakLikes = peakNode?.metrics.likes ?? 0;
  const peakBookmarks = peakNode?.metrics.bookmarks ?? 0;
  const bookmarkRate = peakLikes > 0 ? peakBookmarks / peakLikes : 0;
  const chainMultiplier =
    1 + 0.15 * Math.max(0, depth - 1) + (hasDunk ? 0.5 : 0) + Math.min(0.5, bookmarkRate);
  const score = Math.round(peakHeat * chainMultiplier);
  return { score, heat: peakHeat, signals: { depth, hasDunk, peakIndex, peakHeat } };
}

export const quotaSnapshotSchema = z.object({
  anonymousAllowed: z.boolean().default(true),
  tier: z.enum(["anonymous", "free", "pro", "team"]).default("anonymous"),
  dailyTotal: z.number().int().nonnegative().default(3),
  dailyRemaining: z.number().int().nonnegative().default(3),
  weeklyTotal: z.number().int().nonnegative().default(20),
  weeklyRemaining: z.number().int().nonnegative().default(20),
  /** Extra fetches left when daily/weekly window is exhausted (admin bonus pool). */
  bonusCreditsRemaining: z.number().int().nonnegative().default(0),
  requiresUpgrade: z.boolean().default(false),
  exhaustedReason: z.enum(["", "daily", "weekly"]).default(""),
  nextDailyResetAt: z.number().int().nonnegative().default(0),
  nextWeeklyResetAt: z.number().int().nonnegative().default(0),
  hostedTwitterAvailable: z.boolean().default(false),
  hostedAiAvailable: z.boolean().default(false),
});
export type QuotaSnapshot = z.infer<typeof quotaSnapshotSchema>;

export const anonymousSessionSchema = z.object({
  deviceId: z.string(),
  sessionId: z.string(),
  quota: quotaSnapshotSchema,
  defaultRenderProvider: translationProviderSchema.default("none"),
});
export type AnonymousSession = z.infer<typeof anonymousSessionSchema>;

export const authUserSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  name: z.string().default(""),
  plan: z.enum(["free", "pro", "team"]).default("free"),
});
export type AuthUser = z.infer<typeof authUserSchema>;

export const createSessionInputSchema = z.object({
  deviceId: z.string().min(3).optional(),
});

export const quoteFetchRequestSchema = z.object({
  tweetUrl: z.string().url().optional(),
  tweetId: z.string().optional(),
  targetLanguage: languageSchema.default("zh-CN"),
  translationProvider: translationProviderSchema.default("none"),
  includeAnnotations: z.boolean().default(false),
  apiKey: z.string().optional(),
  aiApiKey: z.string().optional(),
  aiBaseUrl: z.string().url().optional(),
  aiModel: z.string().optional(),
  source: sourceKindSchema.default("web"),
  deviceId: z.string().optional(),
});
export type QuoteFetchRequest = z.infer<typeof quoteFetchRequestSchema>;

export const quoteFetchResponseSchema = z.object({
  document: quoteDocumentSchema,
  quota: quotaSnapshotSchema,
  meta: z.object({
    chainLength: z.number().int().nonnegative(),
    layers: z.array(
      z.object({
        index: z.number().int().nonnegative(),
        relation: quoteRelationSchema,
        authorName: z.string(),
        authorHandle: z.string(),
        tweetId: z.string(),
      }),
    ),
    source: sourceKindSchema,
    translationProvider: translationProviderSchema,
    targetLanguage: languageSchema,
    articleFetches: z.number().int().nonnegative().default(0),
  }),
});
export type QuoteFetchResponse = z.infer<typeof quoteFetchResponseSchema>;

export const translateTextRequestSchema = z.object({
  text: z.string().min(1),
  targetLanguage: languageSchema.default("zh-CN"),
  provider: translationProviderSchema.default("google"),
  aiApiKey: z.string().optional(),
  aiBaseUrl: z.string().url().optional(),
  aiModel: z.string().optional(),
});
export type TranslateTextRequest = z.infer<typeof translateTextRequestSchema>;

export const translateTextResponseSchema = z.object({
  artifact: translationArtifactSchema,
});
export type TranslateTextResponse = z.infer<typeof translateTextResponseSchema>;

export const translationBatchItemSchema = z.object({
  id: z.string(),
  text: z.string().min(1),
  contextRole: quoteRelationSchema.default("quote"),
});
export type TranslationBatchItem = z.infer<typeof translationBatchItemSchema>;

export const translateBatchRequestSchema = z.object({
  items: z.array(translationBatchItemSchema).min(1),
  targetLanguage: languageSchema.default("zh-CN"),
  provider: translationProviderSchema.default("google"),
  aiApiKey: z.string().optional(),
  aiBaseUrl: z.string().url().optional(),
  aiModel: z.string().optional(),
});
export type TranslateBatchRequest = z.infer<typeof translateBatchRequestSchema>;

export const translateBatchResponseSchema = z.object({
  items: z.array(
    z.object({
      id: z.string(),
      artifact: translationArtifactSchema,
    }),
  ),
});
export type TranslateBatchResponse = z.infer<typeof translateBatchResponseSchema>;

export const saveDocumentInputSchema = z.object({
  document: quoteDocumentSchema,
});
export type SaveDocumentInput = z.infer<typeof saveDocumentInputSchema>;

export const exportJobRequestSchema = z.object({
  document: quoteDocumentSchema,
  renderSpec: renderSpecSchema,
});
export type ExportJobRequest = z.infer<typeof exportJobRequestSchema>;

export const exportJobResponseSchema = z.object({
  id: z.string(),
  status: z.enum(["queued", "running", "finished"]),
  downloadUrl: z.string().url().optional(),
  createdAt: z.string().datetime(),
});
export type ExportJobResponse = z.infer<typeof exportJobResponseSchema>;

export function nowIso() {
  return new Date().toISOString();
}

/**
 * UUID v4. Uses `crypto.randomUUID` when available; otherwise falls back to
 * `getRandomValues` so it works in non-secure browser contexts (e.g. `http://<LAN-IP>:3000`)
 * where `randomUUID` is not exposed.
 */
export function randomUUID(): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === "function") {
    return c.randomUUID();
  }
  if (!c || typeof c.getRandomValues !== "function") {
    throw new Error("tweetquote: crypto.getRandomValues is not available");
  }
  const buf = new Uint8Array(16);
  c.getRandomValues(buf);
  buf[6] = ((buf[6] ?? 0) & 0x0f) | 0x40;
  buf[8] = ((buf[8] ?? 0) & 0x3f) | 0x80;
  const hex = Array.from(buf, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function createEmptyNode(depth = 0): QuoteNode {
  return quoteNodeSchema.parse({
    id: randomUUID(),
    relation: depth === 0 ? "root" : "quote",
    depth,
    author: {},
    createdAt: "",
    content: "",
  });
}

export function createEmptyDocument(partial?: Partial<QuoteDocument>): QuoteDocument {
  const timestamp = nowIso();
  return quoteDocumentSchema.parse({
    id: partial?.id ?? randomUUID(),
    title: partial?.title ?? "Untitled quote",
    status: partial?.status ?? "draft",
    nodes: partial?.nodes ?? [createEmptyNode(0)],
    renderSpec: partial?.renderSpec ?? {},
    fetchContext: partial?.fetchContext,
    createdAt: partial?.createdAt ?? timestamp,
    updatedAt: partial?.updatedAt ?? timestamp,
  });
}

export function createDefaultQuota(overrides?: Partial<QuotaSnapshot>): QuotaSnapshot {
  return quotaSnapshotSchema.parse(overrides ?? {});
}

export function createAnonymousSession(deviceId: string): AnonymousSession {
  return anonymousSessionSchema.parse({
    deviceId,
    sessionId: randomUUID(),
    quota: createDefaultQuota(),
    defaultRenderProvider: "none",
  });
}

function readExtendedMediaArray(item: Record<string, unknown>): unknown[] {
  const fromExt = (ext: Record<string, unknown> | undefined): unknown[] =>
    ext && Array.isArray(ext.media) ? ext.media : [];

  let media = fromExt(item.extendedEntities as Record<string, unknown> | undefined);
  if (media.length === 0) {
    media = fromExt(item.extended_entities as Record<string, unknown> | undefined);
  }
  if (media.length === 0) {
    const legacy = item.legacy as Record<string, unknown> | undefined;
    if (legacy) {
      media = fromExt(legacy.extended_entities as Record<string, unknown> | undefined);
      if (media.length === 0) {
        media = fromExt(legacy.extendedEntities as Record<string, unknown> | undefined);
      }
    }
  }
  if (media.length === 0) {
    const entities = item.entities as Record<string, unknown> | undefined;
    if (entities && Array.isArray(entities.media)) {
      media = entities.media;
    }
  }
  return media;
}

function mediaItemToImageUrl(m: Record<string, unknown>): string {
  const type = String(m.type ?? "");
  if (type === "photo" || type === "animated_gif" || type === "video") {
    return String(m.media_url_https ?? "");
  }
  return "";
}

function extractMediaUrls(item: Record<string, unknown>): string[] {
  const mediaArr = readExtendedMediaArray(item);
  return mediaArr
    .filter((m): m is Record<string, unknown> => typeof m === "object" && m !== null)
    .map((m) => mediaItemToImageUrl(m))
    .filter((url) => url.length > 0);
}

function collectMediaTcoUrls(item: Record<string, unknown>): string[] {
  const mediaArr = readExtendedMediaArray(item);
  return mediaArr
    .filter((m): m is Record<string, unknown> => typeof m === "object" && m !== null)
    .map((m) => String(m.url ?? ""))
    .filter((url) => url.length > 0);
}

function stripMediaTcoLinks(text: string, tcoUrls: string[]): string {
  if (tcoUrls.length === 0) return text;
  let result = text;
  for (const tco of tcoUrls) {
    result = result.replace(tco, "");
  }
  return result.trim();
}

function dedupeUrls(urls: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const url of urls) {
    if (!url || seen.has(url)) continue;
    seen.add(url);
    result.push(url);
  }
  return result;
}

function isTwimgImageUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return host === "pbs.twimg.com" || host.endsWith(".pbs.twimg.com");
  } catch {
    return false;
  }
}

function isArticleUrl(url: string): boolean {
  return /\/i\/article\//i.test(url);
}

function readUrlEntities(entities: Record<string, unknown> | undefined): Array<Record<string, unknown>> {
  if (!entities || !Array.isArray(entities.urls)) return [];
  return entities.urls.filter((u): u is Record<string, unknown> => typeof u === "object" && u !== null);
}

export function readEntities(item: Record<string, unknown>): Record<string, unknown> | undefined {
  const direct = item.entities;
  if (direct && typeof direct === "object") {
    return direct as Record<string, unknown>;
  }
  const legacy = item.legacy as Record<string, unknown> | undefined;
  const legacyEntities = legacy?.entities;
  if (legacyEntities && typeof legacyEntities === "object") {
    return legacyEntities as Record<string, unknown>;
  }
  return undefined;
}

export function resolveTweetText(item: Record<string, unknown>): string {
  const baseText = String(item.text ?? "").trim();
  const noteTweet = (item.note_tweet ?? item.noteTweet) as Record<string, unknown> | undefined;
  const noteText = noteTweet ? String(noteTweet.text ?? "").trim() : "";
  if (noteText.length > baseText.length) {
    return noteText;
  }
  return baseText;
}

/**
 * Collapse runs of horizontal whitespace (spaces/tabs) into a single space
 * while preserving line breaks and blank lines authored in the tweet. This is
 * used after removing t.co/article URLs so leftover spacing is tidied without
 * flattening the original paragraph structure.
 */
function collapseInlineWhitespace(text: string): string {
  return text
    // Collapse consecutive spaces/tabs (but NOT newlines) into one space.
    .replace(/[^\S\r\n]{2,}/g, " ")
    // Trim horizontal whitespace hugging each line break.
    .replace(/[^\S\r\n]*(\r?\n)[^\S\r\n]*/g, "$1")
    // Cap runs of blank lines at a single blank line to avoid large gaps.
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function stripArticleUrlsFromText(text: string): string {
  if (!text) return text;
  let result = text
    .replace(/https?:\/\/(?:x\.com|twitter\.com)\/i\/article\/\S+/gi, "")
    .replace(/(?:^|\s)(?:x\.com|twitter\.com)\/i\/article\/\S+/gi, "");
  return collapseInlineWhitespace(result);
}

export function expandUrlsInText(text: string, entities: Record<string, unknown> | undefined): string {
  if (!text || !entities) return text;
  let result = text;
  for (const entry of readUrlEntities(entities)) {
    const tco = String(entry.url ?? "");
    if (!tco) continue;
    const expanded = String(entry.expanded_url ?? "");
    if (expanded && isArticleUrl(expanded)) {
      result = result.replaceAll(tco, "");
      continue;
    }
    // Prefer full expanded_url over truncated display_url for export/readability.
    const replacement = expanded || String(entry.display_url ?? "");
    if (replacement) {
      result = result.replaceAll(tco, replacement);
    }
  }
  return stripArticleUrlsFromText(result);
}

export function extractMediaUrlsFromEntities(entities: Record<string, unknown> | undefined): string[] {
  if (!entities) return [];
  const urls: string[] = [];
  for (const entry of readUrlEntities(entities)) {
    const expanded = String(entry.expanded_url ?? "");
    if (expanded && isTwimgImageUrl(expanded)) {
      urls.push(expanded);
    }
  }
  return urls;
}

export function collectArticleTcoUrls(entities: Record<string, unknown> | undefined): string[] {
  if (!entities) return [];
  return readUrlEntities(entities)
    .filter((entry) => {
      const expanded = String(entry.expanded_url ?? "");
      return expanded && isArticleUrl(expanded);
    })
    .map((entry) => String(entry.url ?? ""))
    .filter(Boolean);
}

export function detectArticleTweetId(item: Record<string, unknown>): string {
  const tweetId = String(item.id ?? "").trim();
  const entities = readEntities(item);
  if (entities) {
    const hasArticleLink = readUrlEntities(entities).some((entry) => isArticleUrl(String(entry.expanded_url ?? "")));
    if (hasArticleLink && tweetId) return tweetId;
  }
  if (item.article && typeof item.article === "object") {
    return tweetId;
  }
  const card = item.card as Record<string, unknown> | undefined;
  if (card && String(card.name ?? "").toLowerCase().includes("article") && tweetId) {
    return tweetId;
  }
  return "";
}

export function normalizeArticlePayload(raw: unknown): ArticleContent | null {
  if (!raw || typeof raw !== "object") return null;
  const article = raw as Record<string, unknown>;
  const blocksRaw = Array.isArray(article.contents) ? article.contents : [];
  const blocks = blocksRaw
    .filter((b): b is Record<string, unknown> => typeof b === "object" && b !== null)
    .map((block) => {
      const typeRaw = String(block.type ?? "unstyled");
      const typeParsed = articleBlockTypeSchema.safeParse(typeRaw);
      const parsed = articleBlockSchema.safeParse({
        type: typeParsed.success ? typeParsed.data : "unstyled",
        text: block.text != null ? String(block.text) : undefined,
        url: block.url != null ? String(block.url) : undefined,
        previewUrl: block.previewUrl != null ? String(block.previewUrl) : undefined,
      });
      return parsed.success ? parsed.data : null;
    })
    .filter((b): b is ArticleBlock => b !== null);

  const normalized = articleContentSchema.parse({
    title: String(article.title ?? ""),
    previewText: String(article.preview_text ?? article.previewText ?? ""),
    coverUrl: String(article.cover_media_img_url ?? article.coverMediaImgUrl ?? ""),
    blocks,
  });

  if (!normalized.title && !normalized.coverUrl && normalized.blocks.length === 0 && !normalized.previewText) {
    return null;
  }
  return normalized;
}

export function flattenArticleToPlainText(article: ArticleContent): string {
  const parts: string[] = [];
  if (article.title.trim()) parts.push(article.title.trim());
  // previewText is a teaser that usually restates the opening blocks — include it
  // only when there is no block body, otherwise translation/intro logic double-counts.
  const hasBlockText = article.blocks.some((block) => Boolean(block.text?.trim()));
  if (!hasBlockText && article.previewText.trim()) {
    parts.push(article.previewText.trim());
  }
  for (const block of article.blocks) {
    if (block.type === "divider") {
      parts.push("---");
      continue;
    }
    if (block.text?.trim()) {
      parts.push(block.text.trim());
    }
  }
  return parts.join("\n\n").trim();
}

function normalizeForArticleCompare(text: string): string {
  return text.replace(/\s+/g, " ").trim().toLowerCase();
}

/**
 * Drop paragraphs from tweet `content` that already appear in the Article
 * (title / preview / blocks). Leftover text is genuine commentary shown above
 * the structured article; empty means content was just a dump of the article.
 */
function extractUniqueArticleIntro(content: string, article: ArticleContent): string {
  const intro = stripArticleUrlsFromText(content.trim());
  if (!intro) return "";

  const discardTexts = [article.title, article.previewText, ...article.blocks.map((block) => block.text ?? "")]
    .map((text) => text.trim())
    .filter(Boolean);
  if (discardTexts.length === 0) return intro;

  const articlePlain = flattenArticleToPlainText(article);
  const introNorm = normalizeForArticleCompare(intro);
  const articleNorm = normalizeForArticleCompare(articlePlain);
  if (articleNorm && (introNorm === articleNorm || introNorm.includes(articleNorm) || articleNorm.includes(introNorm))) {
    return "";
  }

  const kept = intro.split(/\n\n+/).filter((para) => {
    const trimmed = para.trim();
    if (!trimmed) return false;
    const paraNorm = normalizeForArticleCompare(trimmed);
    return !discardTexts.some((discard) => {
      const discardNorm = normalizeForArticleCompare(discard);
      return (
        paraNorm === discardNorm ||
        (paraNorm.length >= 24 && discardNorm.includes(paraNorm)) ||
        (discardNorm.length >= 24 && paraNorm.includes(discardNorm))
      );
    });
  });
  return kept.join("\n\n").trim();
}

export function collectImageUrlsFromArticle(article: ArticleContent | undefined): string[] {
  if (!article) return [];
  const urls: string[] = [];
  if (article.coverUrl.trim()) urls.push(article.coverUrl.trim());
  for (const block of article.blocks) {
    if (block.type === "image" && block.url?.trim()) {
      urls.push(block.url.trim());
    }
    if (block.type === "gif") {
      const gifUrl = block.previewUrl?.trim() || block.url?.trim();
      if (gifUrl) urls.push(gifUrl);
    }
  }
  return urls;
}

export function collectImageUrlsFromNode(node: QuoteNode): string[] {
  return dedupeUrls([...(node.media ?? []), ...collectImageUrlsFromArticle(node.article)]);
}

/**
 * True when `text` is already in the requested target language, so translating
 * it would be redundant (e.g. a Chinese tweet with `zh-CN` target). Uses a
 * simple script-ratio heuristic: Han characters vs. Latin letters. Chinese-tech
 * posts often embed English product names, so a modest Han ratio still counts
 * as Chinese; an essentially Han-free text counts as English.
 */
export function isAlreadyInLanguage(text: string, target: AppLanguage): boolean {
  // Hiragana/Katakana => Japanese, which shares Han glyphs but must still be translated.
  const hasKana = /[\u3040-\u30ff]/.test(text);
  const han = (text.match(/[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/g) ?? []).length;
  const latin = (text.match(/[A-Za-z]/g) ?? []).length;
  const total = han + latin;
  if (total === 0) return false;
  const hanRatio = han / total;
  return target.startsWith("zh")
    ? !hasKana && hanRatio >= 0.2
    : !hasKana && latin > 0 && hanRatio <= 0.05;
}

/** Text sent to translation providers (unique intro + article body when present). */
export function getTranslatableNodeText(node: Pick<QuoteNode, "content" | "article">): string {
  if (!node.article) return node.content.trim();
  const intro = getNodeIntroText(node);
  const articlePlain = flattenArticleToPlainText(node.article);
  if (intro && articlePlain) {
    return `${intro}\n\n${articlePlain}`.trim();
  }
  return intro || articlePlain;
}

/** Intro line shown above structured article blocks (empty when redundant). */
export function getNodeIntroText(node: Pick<QuoteNode, "content" | "article">): string {
  if (!node.article) return stripArticleUrlsFromText(node.content.trim());
  return extractUniqueArticleIntro(node.content, node.article);
}

function stripTcoUrls(text: string, tcoUrls: string[]): string {
  if (tcoUrls.length === 0) return text.trim();
  let result = text;
  for (const tco of tcoUrls) {
    result = result.replaceAll(tco, "");
  }
  return collapseInlineWhitespace(result);
}

/** Coerce a metric field (number or numeric string) to a non-negative integer, else null. */
function readMetricValue(raw: unknown): number | null {
  if (typeof raw === "number" && Number.isFinite(raw)) {
    return raw >= 0 ? Math.floor(raw) : null;
  }
  if (typeof raw === "string" && raw.trim() && /^\d+$/.test(raw.trim())) {
    return Number.parseInt(raw.trim(), 10);
  }
  return null;
}

export function normalizeLegacyRenderItems(
  items: Array<Record<string, unknown>>,
  source: SourceKind = "web",
): QuoteDocument {
  const timestamp = nowIso();
  const nodes = items.map((item, index) => {
    const entities = readEntities(item);
    const mediaUrls = dedupeUrls([...extractMediaUrls(item), ...extractMediaUrlsFromEntities(entities)]);
    const mediaTcoUrls = collectMediaTcoUrls(item);
    const articleTcoUrls = collectArticleTcoUrls(entities);
    const rawText = resolveTweetText(item);
    let content = stripMediaTcoLinks(rawText, mediaTcoUrls);
    content = stripTcoUrls(content, articleTcoUrls);
    content = expandUrlsInText(content, entities);
    content = stripArticleUrlsFromText(content);

    const injectedArticle = item._article;
    const article =
      injectedArticle && typeof injectedArticle === "object"
        ? articleContentSchema.parse(injectedArticle)
        : undefined;

    const articlePlain = article ? flattenArticleToPlainText(article) : "";
    if (article) {
      // Keep only commentary that is not already in the Article; never mirror the
      // full article into `content` (that double-renders with ArticleBlocks).
      content = extractUniqueArticleIntro(content, article);
    } else if (!content && articlePlain) {
      content = articlePlain;
    }

    const articleImageUrls = collectImageUrlsFromArticle(article);
    const media = dedupeUrls([...mediaUrls, ...articleImageUrls]).filter((url) => {
      if (!article?.coverUrl) return true;
      return url !== article.coverUrl;
    });

    return quoteNodeSchema.parse({
      id: String(item.id ?? randomUUID()),
      relation: index === 0 ? "root" : item._rel === "reply" ? "reply" : "quote",
      depth: index,
      sourceTweetId: String(item.id ?? ""),
      author: {
        name: String((item.author as Record<string, unknown> | undefined)?.name ?? ""),
        handle: String((item.author as Record<string, unknown> | undefined)?.userName ?? ""),
        avatarUrl: String((item.author as Record<string, unknown> | undefined)?.profilePicture ?? ""),
      },
      content,
      createdAt: String(item.createdAt ?? ""),
      viewCount: readMetricValue(item.viewCount),
      metrics: {
        views: readMetricValue(item.viewCount),
        likes: readMetricValue(item.likeCount),
        retweets: readMetricValue(item.retweetCount),
        replies: readMetricValue(item.replyCount),
        quotes: readMetricValue(item.quoteCount),
        bookmarks: readMetricValue(item.bookmarkCount),
      },
      media,
      article,
      translation: {
        provider: item.translatedContent ? "ai" : "none",
        status: item.translatedContent ? "success" : "idle",
        text: String(item.translatedContent ?? ""),
        annotations: Array.isArray(item.annotations) ? item.annotations : [],
      },
    });
  });

  return createEmptyDocument({
    title: nodes[0]?.content.slice(0, 32) || nodes[0]?.article?.title.slice(0, 32) || "Imported quote",
    nodes,
    fetchContext: {
      source,
      entryUrl: "https://x.com",
      tweetId: nodes[0]?.sourceTweetId ?? "",
      pageLanguage: "en",
      capturedAt: timestamp,
    },
    createdAt: timestamp,
    updatedAt: timestamp,
  });
}
