import {
  createEmptyDocument,
  createEmptyNode,
  nowIso,
  quoteDocumentSchema,
  type AppLanguage,
  type QuoteDocument,
  type TranslationDisplay,
  type TranslationArtifact,
  type TranslationProvider,
} from "@tweetquote/domain";

export const storageKeys = {
  webDraft: "tq_v2_editor_draft",
  webDeviceId: "tq_v2_device_id",
  extensionDeviceId: "tq_v2_extension_device_id",
  twitterApiKey: "tnt_api_key",
  aiBaseUrl: "tnt_ai_base_url",
  aiApiKey: "tnt_ai_api_key",
  aiModel: "tnt_ai_model",
  translationTargetLanguage: "tnt_translation_target_lang",
  uiLanguage: "tnt_ui_language",
} as const;

export function restoreDraftDocument(raw: string | null | undefined) {
  if (!raw) return null;
  try {
    return quoteDocumentSchema.parse(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function resetDocumentDraft() {
  return createEmptyDocument();
}

export function updateDocumentTitle(document: QuoteDocument, title: string): QuoteDocument {
  return quoteDocumentSchema.parse({
    ...document,
    title,
    updatedAt: nowIso(),
  });
}

export function updateDocumentLanguage(document: QuoteDocument, language: AppLanguage): QuoteDocument {
  return quoteDocumentSchema.parse({
    ...document,
    renderSpec: {
      ...document.renderSpec,
      language,
    },
    updatedAt: nowIso(),
  });
}

export function updateDocumentScale(document: QuoteDocument, exportScale: number): QuoteDocument {
  return quoteDocumentSchema.parse({
    ...document,
    renderSpec: {
      ...document.renderSpec,
      exportScale,
    },
    updatedAt: nowIso(),
  });
}

export function updateDocumentTheme(document: QuoteDocument, theme: "paper" | "night"): QuoteDocument {
  return quoteDocumentSchema.parse({
    ...document,
    renderSpec: {
      ...document.renderSpec,
      theme,
    },
    updatedAt: nowIso(),
  });
}

export function updateDocumentProvider(document: QuoteDocument, provider: TranslationProvider): QuoteDocument {
  return quoteDocumentSchema.parse({
    ...document,
    renderSpec: {
      ...document.renderSpec,
      translationProvider: provider,
    },
    updatedAt: nowIso(),
  });
}

export function updateDocumentTranslationDisplay(document: QuoteDocument, translationDisplay: TranslationDisplay): QuoteDocument {
  return quoteDocumentSchema.parse({
    ...document,
    renderSpec: {
      ...document.renderSpec,
      translationDisplay,
    },
    updatedAt: nowIso(),
  });
}

export function updateNodeField(
  document: QuoteDocument,
  index: number,
  key: "content" | "name" | "handle" | "avatarUrl" | "createdAt" | "viewCount",
  value: string,
): QuoteDocument {
  return quoteDocumentSchema.parse({
    ...document,
    nodes: document.nodes.map((node, nodeIndex) =>
      nodeIndex === index
        ? key === "content"
          ? { ...node, content: value }
          : key === "name" || key === "handle" || key === "avatarUrl"
            ? {
                ...node,
                author: {
                  ...node.author,
                  [key === "name" ? "name" : key === "handle" ? "handle" : "avatarUrl"]: value,
                },
              }
            : key === "createdAt"
              ? { ...node, createdAt: value }
              : {
                  ...node,
                  viewCount: value.trim() ? Math.max(0, Number.parseInt(value, 10) || 0) : null,
                }
        : node,
    ),
    updatedAt: nowIso(),
  });
}

export function addLayer(document: QuoteDocument): QuoteDocument {
  return quoteDocumentSchema.parse({
    ...document,
    nodes: [...document.nodes, { ...createEmptyNode(document.nodes.length), depth: document.nodes.length }],
    updatedAt: nowIso(),
  });
}

export function removeLastLayer(document: QuoteDocument): QuoteDocument {
  if (document.nodes.length <= 1) return document;
  return quoteDocumentSchema.parse({
    ...document,
    nodes: document.nodes.slice(0, -1),
    updatedAt: nowIso(),
  });
}

export function applyNodeTranslation(
  document: QuoteDocument,
  nodeId: string,
  artifact: TranslationArtifact,
): QuoteDocument {
  return quoteDocumentSchema.parse({
    ...document,
    nodes: document.nodes.map((node) => (node.id === nodeId ? { ...node, translation: artifact } : node)),
    updatedAt: nowIso(),
  });
}

export function applyBatchTranslations(
  document: QuoteDocument,
  artifacts: Array<{ id: string; artifact: TranslationArtifact }>,
): QuoteDocument {
  const artifactMap = new Map(artifacts.map((item) => [item.id, item.artifact]));
  return quoteDocumentSchema.parse({
    ...document,
    nodes: document.nodes.map((node) => ({
      ...node,
      translation: artifactMap.get(node.id) ?? node.translation,
    })),
    updatedAt: nowIso(),
  });
}

export function collectBatchItems(document: QuoteDocument) {
  return document.nodes
    .filter((node) => node.content.trim())
    .map((node) => ({
      id: node.id,
      text: node.content.trim(),
      contextRole: node.relation,
    }));
}
