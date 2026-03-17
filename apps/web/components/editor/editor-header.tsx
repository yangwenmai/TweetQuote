import { Button, StatBadge } from "@tweetquote/ui";

type EditorHeaderProps = {
  quotaLabel: string;
  busy: boolean;
  onSave: () => void;
  onExport: () => void;
  onReset: () => void;
};

export function EditorHeader({ quotaLabel, busy, onSave, onExport, onReset }: EditorHeaderProps) {
  return (
    <div className="toolbar">
      <div>
        <span className="eyebrow">Tweet Quote</span>
        <h1 style={{ margin: "14px 0 6px" }}>编辑器</h1>
        <p className="muted" style={{ margin: 0 }}>
          抓取引用链、翻译注释、导出高清长图。
        </p>
      </div>
      <div className="row">
        <StatBadge label={quotaLabel} />
        <Button tone="secondary" onClick={onSave} disabled={busy}>
          保存草稿
        </Button>
        <Button onClick={onExport} disabled={busy}>
          创建导出任务
        </Button>
        <Button tone="ghost" onClick={onReset} disabled={busy}>
          新建草稿
        </Button>
      </div>
    </div>
  );
}
