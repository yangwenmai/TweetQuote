import type { QuoteDocument } from "@tweetquote/domain";

export function getActiveNode(document: QuoteDocument) {
  return document.nodes[0] ?? null;
}

export function getDocumentSubtitle(document: QuoteDocument) {
  const activeNode = getActiveNode(document);
  if (!activeNode) {
    return "暂无内容";
  }
  return `当前共 ${document.nodes.length} 层，主推文作者：${activeNode.author.name || "未填写"}，导出 ${document.renderSpec.exportScale}x`;
}

export function getTranslationCoverage(document: QuoteDocument) {
  const total = document.nodes.filter((node) => node.content.trim()).length;
  const translated = document.nodes.filter((node) => node.translation.text.trim()).length;
  return {
    total,
    translated,
    pending: Math.max(0, total - translated),
  };
}

export function getDocumentSummary(document: QuoteDocument) {
  const coverage = getTranslationCoverage(document);
  return {
    title: document.title || "预览",
    subtitle: getDocumentSubtitle(document),
    translationLabel: coverage.total ? `已翻译 ${coverage.translated}/${coverage.total}` : "暂无可翻译内容",
  };
}
