import { getEnv } from "@tweetquote/config";
import {
  anonymousSessionSchema,
  exportJobRequestSchema,
  exportJobResponseSchema,
  quoteDocumentSchema,
  quoteFetchRequestSchema,
  quoteFetchResponseSchema,
  quotaSnapshotSchema,
  saveDocumentInputSchema,
  translateBatchRequestSchema,
  translateBatchResponseSchema,
  translateTextRequestSchema,
  translateTextResponseSchema,
  type AnonymousSession,
  type ExportJobRequest,
  type ExportJobResponse,
  type QuoteDocument,
  type QuoteFetchRequest,
  type QuoteFetchResponse,
  type QuotaSnapshot,
  type TranslateBatchRequest,
  type TranslateBatchResponse,
  type TranslateTextRequest,
  type TranslateTextResponse,
} from "@tweetquote/domain";

type ApiOptions = {
  baseUrl?: string;
  headers?: Record<string, string>;
  fetchFn?: typeof globalThis.fetch;
};

type JsonValue = string | number | boolean | null | JsonValue[] | { [k: string]: JsonValue };

async function request<T>(path: string, init: RequestInit, parser: { parse: (input: unknown) => T }, options?: ApiOptions) {
  const env = getEnv("web");
  const baseUrl = options?.baseUrl ?? env.apiBaseUrl;
  const doFetch = options?.fetchFn ?? globalThis.fetch.bind(globalThis);
  const response = await doFetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(options?.headers ?? {}),
      ...(init.headers ?? {}),
    },
  });

  const json = (await response.json().catch(() => ({}))) as JsonValue;
  if (!response.ok) {
    throw new Error(
      typeof json === "object" && json && "error" in json ? String((json as { error: string }).error) : `HTTP ${response.status}`,
    );
  }
  return parser.parse(json);
}

export class TweetQuoteApiClient {
  constructor(private readonly options?: ApiOptions) {}

  createAnonymousSession(deviceId?: string) {
    return request(
      "/api/v1/session/anonymous",
      {
        method: "POST",
        body: JSON.stringify({ deviceId }),
      },
      anonymousSessionSchema,
      this.options,
    );
  }

  getQuota(deviceId: string) {
    return request(`/api/v1/quota/${encodeURIComponent(deviceId)}`, { method: "GET" }, quotaSnapshotSchema, this.options);
  }

  fetchQuoteDocument(payload: QuoteFetchRequest) {
    return request(
      "/api/v1/quote/fetch",
      {
        method: "POST",
        body: JSON.stringify(quoteFetchRequestSchema.parse(payload)),
      },
      quoteFetchResponseSchema,
      this.options,
    );
  }

  translateText(payload: TranslateTextRequest) {
    return request(
      "/api/v1/translation/translate",
      {
        method: "POST",
        body: JSON.stringify(translateTextRequestSchema.parse(payload)),
      },
      translateTextResponseSchema,
      this.options,
    );
  }

  translateBatch(payload: TranslateBatchRequest) {
    return request(
      "/api/v1/translation/batch",
      {
        method: "POST",
        body: JSON.stringify(translateBatchRequestSchema.parse(payload)),
      },
      translateBatchResponseSchema,
      this.options,
    );
  }

  saveDocument(document: QuoteDocument) {
    return request(
      "/api/v1/document/save",
      {
        method: "POST",
        body: JSON.stringify(saveDocumentInputSchema.parse({ document })),
      },
      quoteDocumentSchema,
      this.options,
    );
  }

  createExportJob(payload: ExportJobRequest) {
    return request(
      "/api/v1/export/jobs",
      {
        method: "POST",
        body: JSON.stringify(exportJobRequestSchema.parse(payload)),
      },
      exportJobResponseSchema,
      this.options,
    );
  }
}

export type ExtensionBridgeMessage =
  | { type: "capture-context" }
  | { type: "open-panel"; payload?: { tweetUrl?: string } }
  | { type: "close-panel" }
  | { type: "session-updated"; payload: AnonymousSession }
  | { type: "document-loaded"; payload: QuoteFetchResponse }
  | { type: "quota-updated"; payload: QuotaSnapshot };
