import type { QuoteDocument, TranslationProvider } from "@tweetquote/domain";
import { Button, SurfaceCard } from "@tweetquote/ui";

type ManualEditorCardProps = {
  document: QuoteDocument;
  busy: boolean;
  onTranslateAll: (provider: TranslationProvider) => void;
  onRemoveLayer: () => void;
  onTranslateNode: (index: number, provider: TranslationProvider) => void;
  onUpdateNode: (index: number, key: "content" | "name" | "handle", value: string) => void;
  onAddLayer: () => void;
};

export function ManualEditorCard({
  document,
  busy,
  onTranslateAll,
  onRemoveLayer,
  onTranslateNode,
  onUpdateNode,
  onAddLayer,
}: ManualEditorCardProps) {
  return (
    <SurfaceCard title="手工编辑" subtitle="新版不再整块重绘，而是围绕节点编辑。">
      <div className="stack">
        <div className="row">
          <Button tone="ghost" disabled={busy} onClick={() => onTranslateAll("google")}>
            批量 Google 翻译
          </Button>
          <Button tone="secondary" disabled={busy} onClick={() => onTranslateAll("ai")}>
            批量 AI 翻译
          </Button>
          <Button tone="ghost" disabled={document.nodes.length <= 1 || busy} onClick={onRemoveLayer}>
            删除最后一层
          </Button>
        </div>
        {document.nodes.map((node, index) => (
          <div
            key={node.id}
            style={{
              border: "1px solid rgba(42, 33, 27, 0.12)",
              borderRadius: 16,
              padding: 14,
              background: "#fff",
            }}
          >
            <div className="toolbar" style={{ marginBottom: 10 }}>
              <strong>{index === 0 ? "主推文" : `引用层 ${index}`}</strong>
              <div className="row">
                <Button tone="ghost" disabled={busy} onClick={() => onTranslateNode(index, "google")}>
                  Google 翻译
                </Button>
                <Button tone="secondary" disabled={busy} onClick={() => onTranslateNode(index, "ai")}>
                  AI 翻译
                </Button>
              </div>
            </div>
            <div className="stack">
              <label className="field">
                <span>作者名</span>
                <input value={node.author.name} onChange={(event) => onUpdateNode(index, "name", event.target.value)} />
              </label>
              <label className="field">
                <span>账号</span>
                <input value={node.author.handle} onChange={(event) => onUpdateNode(index, "handle", event.target.value)} />
              </label>
              <label className="field">
                <span>正文</span>
                <textarea value={node.content} onChange={(event) => onUpdateNode(index, "content", event.target.value)} />
              </label>
              {node.translation.text ? (
                <label className="field">
                  <span>翻译结果</span>
                  <textarea value={node.translation.text} readOnly />
                </label>
              ) : null}
            </div>
          </div>
        ))}
        <Button tone="secondary" onClick={onAddLayer}>
          增加一层
        </Button>
      </div>
    </SurfaceCard>
  );
}
