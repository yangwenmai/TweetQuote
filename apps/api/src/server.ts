import Fastify from "fastify";
import {
  createAnonymousSession,
  exportJobRequestSchema,
  quoteFetchRequestSchema,
  saveDocumentInputSchema,
  translateBatchRequestSchema,
  translateTextRequestSchema,
} from "@tweetquote/domain";
import { trackEvent } from "@tweetquote/telemetry";
import { apiEnv } from "./lib/env";
import { ApiError, buildDocumentFromQuoteRequest, extractTweetId, translateBatch, translateText } from "./lib/providers";
import { DocumentStore, ExportJobStore, TrialSessionStore } from "./lib/store";

const app = Fastify({ logger: false });
const sessionStore = new TrialSessionStore();
const documentStore = new DocumentStore();
const exportStore = new ExportJobStore();

app.addHook("onSend", async (_request, reply, payload) => {
  reply.headers({
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  });
  return payload;
});

app.options("*", async (_request, reply) => {
  reply.code(204).send();
});

app.setErrorHandler((error, _request, reply) => {
  const statusCode = error instanceof ApiError ? error.statusCode : 500;
  const message = error instanceof Error ? error.message : "Internal server error";
  trackEvent({ name: "api.error", level: "error", payload: { statusCode, message } });
  reply.code(statusCode).send({
    error: message,
    detail: error instanceof ApiError ? error.detail : "",
  });
});

app.get("/api/v1/health", async () => ({
  ok: true,
  service: "tweetquote-api",
  port: apiEnv.port,
}));

app.get("/api/v1/runtime", async () => ({
  featureFlags: {
    v2Api: true,
    v2Editor: true,
    v2Extension: true,
  },
  supportUrl: apiEnv.supportUrl,
  apiBaseUrl: `http://localhost:${apiEnv.port}`,
}));

app.get("/api/v1/assets/image", async (request, reply) => {
  const query = request.query as { url?: string };
  const rawUrl = typeof query.url === "string" ? query.url : "";
  if (!rawUrl) {
    reply.code(400);
    return { error: "Missing image url" };
  }

  let targetUrl: URL;
  try {
    targetUrl = new URL(rawUrl);
  } catch {
    reply.code(400);
    return { error: "Invalid image url" };
  }

  if (!["http:", "https:"].includes(targetUrl.protocol)) {
    reply.code(400);
    return { error: "Unsupported image protocol" };
  }

  const upstream = await fetch(targetUrl, {
    headers: {
      "User-Agent": "TweetQuote/2.0",
    },
  });
  if (!upstream.ok) {
    reply.code(upstream.status);
    return { error: "Failed to fetch image" };
  }

  const contentType = upstream.headers.get("content-type") || "image/png";
  const buffer = Buffer.from(await upstream.arrayBuffer());
  reply.header("Content-Type", contentType);
  reply.header("Cache-Control", "public, max-age=3600");
  return reply.send(buffer);
});

app.get("/api/v1/openapi.json", async () => ({
  openapi: "3.1.0",
  info: {
    title: "TweetQuote API",
    version: "0.1.0",
  },
  paths: {
    "/api/v1/session/anonymous": { post: { summary: "Create anonymous session" } },
    "/api/v1/quota/{deviceId}": { get: { summary: "Get quota snapshot" } },
    "/api/v1/quote/fetch": { post: { summary: "Fetch quote chain document" } },
    "/api/v1/translation/translate": { post: { summary: "Translate one item" } },
    "/api/v1/translation/batch": { post: { summary: "Translate batch items" } },
    "/api/v1/document/save": { post: { summary: "Save document" } },
    "/api/v1/export/jobs": { post: { summary: "Create export job" } },
  },
}));

app.post("/api/v1/session/anonymous", async (request) => {
  const body = (request.body ?? {}) as Record<string, unknown>;
  const session = await sessionStore.getOrCreate(typeof body.deviceId === "string" ? body.deviceId : "");
  const quota = await sessionStore.getQuotaSnapshot(session.device_id);
  return {
    ...createAnonymousSession(session.device_id),
    quota,
    defaultRenderProvider: apiEnv.aiApiKey ? "ai" : apiEnv.twitterApiKey ? "google" : "none",
  };
});

app.get("/api/v1/quota/:deviceId", async (request) => {
  const { deviceId } = request.params as { deviceId: string };
  return sessionStore.getQuotaSnapshot(deviceId);
});

app.post("/api/v1/quote/fetch", async (request, reply) => {
  const payload = quoteFetchRequestSchema.parse(request.body ?? {});
  const deviceId = payload.deviceId || `tq_${crypto.randomUUID().replace(/-/g, "")}`;
  const quota = await sessionStore.getQuotaSnapshot(deviceId);
  const hostedRender = (!payload.apiKey && apiEnv.twitterApiKey) || (payload.translationProvider === "ai" && (!payload.aiApiKey && apiEnv.aiApiKey));
  if (hostedRender && quota.requiresUpgrade) {
    reply.code(402);
    return { error: "Free trial exhausted", quota };
  }
  const result = await buildDocumentFromQuoteRequest(payload, quota);
  if (hostedRender) {
    await sessionStore.increment(deviceId);
  }
  return {
    document: result.document,
    quota: await sessionStore.getQuotaSnapshot(deviceId),
    meta: {
      chainLength: result.document.nodes.length,
      layers: result.layers,
      source: payload.source,
      translationProvider: payload.translationProvider,
      targetLanguage: payload.targetLanguage,
    },
  };
});

app.post("/api/v1/translation/translate", async (request) => {
  const payload = translateTextRequestSchema.parse(request.body ?? {});
  const artifact = await translateText(payload.provider, payload.text, payload.targetLanguage, {
    aiApiKey: payload.aiApiKey,
    aiBaseUrl: payload.aiBaseUrl,
    aiModel: payload.aiModel,
  });
  return { artifact };
});

app.post("/api/v1/translation/batch", async (request) => {
  const payload = translateBatchRequestSchema.parse(request.body ?? {});
  const items = await translateBatch(payload.provider, payload.items, payload.targetLanguage, {
    aiApiKey: payload.aiApiKey,
    aiBaseUrl: payload.aiBaseUrl,
    aiModel: payload.aiModel,
  });
  return { items };
});

app.post("/api/v1/document/save", async (request) => {
  const payload = saveDocumentInputSchema.parse(request.body ?? {});
  return documentStore.save(payload.document);
});

app.get("/api/v1/document/:id", async (request, reply) => {
  const { id } = request.params as { id: string };
  const document = await documentStore.get(id);
  if (!document) {
    reply.code(404);
    return { error: "Document not found" };
  }
  return document;
});

app.post("/api/v1/export/jobs", async (request) => {
  exportJobRequestSchema.parse(request.body ?? {});
  return exportStore.create();
});

app.get("/api/twitter-config", async () => ({
  configured: Boolean(apiEnv.twitterApiKey),
  hosted_mode_available: Boolean(apiEnv.twitterApiKey),
  trial_limit: apiEnv.weeklyTrialLimit,
  daily_limit: apiEnv.dailyTrialLimit,
  weekly_limit: apiEnv.weeklyTrialLimit,
}));

app.get("/api/ai-config", async () => ({
  configured: Boolean(apiEnv.aiApiKey),
  provider: apiEnv.aiProvider,
  model: apiEnv.aiModel,
  base_url_host: (() => {
    try {
      return new URL(apiEnv.aiBaseUrl).hostname;
    } catch {
      return apiEnv.aiBaseUrl;
    }
  })(),
  hosted_mode_available: Boolean(apiEnv.aiApiKey),
}));

app.get("/api/session", async (request) => {
  const query = request.query as { device_id?: string };
  const session = await sessionStore.getOrCreate(query.device_id);
  const quota = await sessionStore.getQuotaSnapshot(session.device_id);
  return {
    device_id: session.device_id,
    trial_total: apiEnv.weeklyTrialLimit,
    trial_used: apiEnv.weeklyTrialLimit - quota.weeklyRemaining,
    trial_remaining: Math.min(quota.dailyRemaining, quota.weeklyRemaining),
    daily_total: apiEnv.dailyTrialLimit,
    daily_used: apiEnv.dailyTrialLimit - quota.dailyRemaining,
    daily_remaining: quota.dailyRemaining,
    weekly_total: apiEnv.weeklyTrialLimit,
    weekly_used: apiEnv.weeklyTrialLimit - quota.weeklyRemaining,
    weekly_remaining: quota.weeklyRemaining,
    requires_upgrade: quota.requiresUpgrade,
    hosted_twitter_available: quota.hostedTwitterAvailable,
    hosted_ai_available: quota.hostedAiAvailable,
    support_contact_url: apiEnv.supportUrl,
    extension_install_url: "/extension/",
    web_editor_url: "/",
    default_render_provider: apiEnv.aiApiKey ? "ai" : apiEnv.twitterApiKey ? "google" : "none",
  };
});

app.post("/api/quote-chain/render", async (request, reply) => {
  const body = (request.body ?? {}) as Record<string, unknown>;
  const payload = quoteFetchRequestSchema.parse({
    tweetUrl: typeof body.tweet_url === "string" ? body.tweet_url : undefined,
    tweetId: typeof body.tweet_id === "string" ? body.tweet_id : undefined,
    targetLanguage: typeof body.target_lang === "string" ? body.target_lang : "zh-CN",
    translationProvider:
      body.translation_provider === "ai" || body.translation_provider === "google" ? body.translation_provider : "none",
    includeAnnotations: Boolean(body.include_annotations),
    apiKey: typeof body.api_key === "string" ? body.api_key : undefined,
    aiApiKey: typeof body.ai_api_key === "string" ? body.ai_api_key : undefined,
    aiBaseUrl: typeof body.ai_base_url === "string" ? body.ai_base_url : undefined,
    aiModel: typeof body.ai_model === "string" ? body.ai_model : undefined,
    source: body.source === "extension" ? "extension" : "web",
    deviceId: typeof body.device_id === "string" ? body.device_id : undefined,
  });

  const deviceId = payload.deviceId || `tq_${crypto.randomUUID().replace(/-/g, "")}`;
  const quota = await sessionStore.getQuotaSnapshot(deviceId);
  const hostedRender = (!payload.apiKey && apiEnv.twitterApiKey) || (payload.translationProvider === "ai" && (!payload.aiApiKey && apiEnv.aiApiKey));
  if (hostedRender && quota.requiresUpgrade) {
    reply.code(402);
    return { error: "Free trial exhausted", session: { ...quota, requires_upgrade: true } };
  }

  const result = await buildDocumentFromQuoteRequest(payload, quota);
  if (hostedRender) {
    await sessionStore.increment(deviceId);
  }
  return {
    tweet_id: extractTweetId(payload.tweetUrl || payload.tweetId || ""),
    items: result.document.nodes.map((node) => ({
      id: node.sourceTweetId || node.id,
      _rel: node.relation === "root" ? "main" : node.relation,
      author: {
        name: node.author.name,
        userName: node.author.handle,
        profilePicture: node.author.avatarUrl,
      },
      createdAt: node.createdAt,
      viewCount: node.viewCount,
      text: node.content,
      translatedContent: node.translation.text,
      annotations: node.translation.annotations,
    })),
    meta: {
      translation_provider: payload.translationProvider,
      target_lang: payload.targetLanguage,
      chain_length: result.document.nodes.length,
      source: payload.source,
      hosted_render: hostedRender,
    },
    session: {
      device_id: deviceId,
      trial_total: apiEnv.weeklyTrialLimit,
      trial_remaining: Math.min(quota.dailyRemaining, quota.weeklyRemaining),
      daily_total: apiEnv.dailyTrialLimit,
      daily_remaining: quota.dailyRemaining,
      weekly_total: apiEnv.weeklyTrialLimit,
      weekly_remaining: quota.weeklyRemaining,
      requires_upgrade: quota.requiresUpgrade,
      hosted_twitter_available: quota.hostedTwitterAvailable,
      hosted_ai_available: quota.hostedAiAvailable,
    },
  };
});

app.post("/api/translate", async (request) => {
  const body = request.body as { text?: string; to?: string };
  const artifact = await translateText("google", body.text || "", body.to || "zh-CN");
  return {
    translated: artifact.text,
    detectedLang: "auto",
  };
});

app.post("/api/translate-batch", async (request) => {
  const body = request.body as { items?: Array<{ id?: string; text?: string }>; to?: string };
  const items = await translateBatch(
    "google",
    (body.items || []).map((item, index) => ({
      id: String(item.id || index),
      text: item.text || "",
      contextRole: "quote",
    })),
    body.to || "zh-CN",
  );
  return {
    items: items.map((item) => ({
      id: item.id,
      status: "success",
      translation: item.artifact.text,
      detectedLang: "auto",
      usageHint: "batched_by_server",
    })),
  };
});

app.post("/api/ai-translate", async (request) => {
  const body = request.body as { text?: string; to?: string; ai_api_key?: string; ai_base_url?: string; ai_model?: string };
  const artifact = await translateText("ai", body.text || "", body.to || "zh-CN", {
    aiApiKey: body.ai_api_key,
    aiBaseUrl: body.ai_base_url,
    aiModel: body.ai_model,
  });
  return {
    translation: artifact.text,
    annotations: artifact.annotations,
  };
});

app.post("/api/ai-translate-batch", async (request) => {
  const body = request.body as {
    items?: Array<{ id?: string; text?: string; contextRole?: "root" | "quote" | "reply" }>;
    to?: string;
    ai_api_key?: string;
    ai_base_url?: string;
    ai_model?: string;
  };
  const items = await translateBatch(
    "ai",
    (body.items || []).map((item, index) => ({
      id: String(item.id || index),
      text: item.text || "",
      contextRole: item.contextRole || "quote",
    })),
    body.to || "zh-CN",
    {
      aiApiKey: body.ai_api_key,
      aiBaseUrl: body.ai_base_url,
      aiModel: body.ai_model,
    },
  );
  return {
    items: items.map((item) => ({
      id: item.id,
      status: "success",
      translation: item.artifact.text,
      annotations: item.artifact.annotations,
      usageHint: "batched_by_server",
    })),
  };
});

const start = async () => {
  try {
    await app.listen({ port: apiEnv.port, host: "0.0.0.0" });
    console.log(`TweetQuote API listening on http://localhost:${apiEnv.port}`);
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
};

start();
