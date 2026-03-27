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

export const quoteNodeSchema = z.object({
  id: z.string(),
  relation: quoteRelationSchema.default("quote"),
  depth: z.number().int().min(0).default(0),
  sourceTweetId: z.string().default(""),
  author: quoteAuthorSchema,
  content: z.string().default(""),
  createdAt: z.string().default(""),
  viewCount: z.number().int().nonnegative().nullable().default(null),
  media: z.array(z.string().url()).default([]),
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

export function normalizeLegacyRenderItems(
  items: Array<Record<string, unknown>>,
  source: SourceKind = "web",
): QuoteDocument {
  const timestamp = nowIso();
  const nodes = items.map((item, index) => {
    const mediaUrls = extractMediaUrls(item);
    const tcoUrls = collectMediaTcoUrls(item);
    const rawText = String(item.text ?? "");
    const content = stripMediaTcoLinks(rawText, tcoUrls);

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
      viewCount: typeof item.viewCount === "number" ? item.viewCount : null,
      media: mediaUrls,
      translation: {
        provider: item.translatedContent ? "ai" : "none",
        status: item.translatedContent ? "success" : "idle",
        text: String(item.translatedContent ?? ""),
        annotations: Array.isArray(item.annotations) ? item.annotations : [],
      },
    });
  });

  return createEmptyDocument({
    title: nodes[0]?.content.slice(0, 32) || "Imported quote",
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
