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
        <span className="eyebrow">Editorial Product</span>
        <h1 style={{ margin: "14px 0 6px" }}>新版编辑器</h1>
        <p className="muted" style={{ margin: 0 }}>
          先保住核心路径，再围绕领域模型持续组件化。
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
