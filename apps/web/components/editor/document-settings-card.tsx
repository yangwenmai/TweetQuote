import type { AppLanguage, QuoteDocument } from "@tweetquote/domain";
import { SurfaceCard } from "@tweetquote/ui";

type DocumentSettingsCardProps = {
  document: QuoteDocument;
  language: AppLanguage;
  onTitleChange: (value: string) => void;
  onLanguageChange: (value: AppLanguage) => void;
  onScaleChange: (value: number) => void;
  onThemeChange: (value: "paper" | "night") => void;
};

export function DocumentSettingsCard({
  document,
  language,
  onTitleChange,
  onLanguageChange,
  onScaleChange,
  onThemeChange,
}: DocumentSettingsCardProps) {
  return (
    <SurfaceCard title="文档设置" subtitle="把标题、导出倍率和主题这些渲染参数从正文编辑中独立出来。">
      <div className="stack">
        <label className="field">
          <span>文档标题</span>
          <input value={document.title} onChange={(event) => onTitleChange(event.target.value)} />
        </label>
        <div className="row">
          <label className="field" style={{ flex: 1 }}>
            <span>界面语言 / 输出语言</span>
            <select value={language} onChange={(event) => onLanguageChange(event.target.value as AppLanguage)}>
              <option value="zh-CN">中文</option>
              <option value="en">English</option>
            </select>
          </label>
          <label className="field" style={{ flex: 1 }}>
            <span>导出倍率</span>
            <select value={String(document.renderSpec.exportScale)} onChange={(event) => onScaleChange(Number(event.target.value))}>
              <option value="1">1x</option>
              <option value="2">2x</option>
              <option value="3">3x</option>
              <option value="4">4x</option>
            </select>
          </label>
          <label className="field" style={{ flex: 1 }}>
            <span>主题</span>
            <select
              value={document.renderSpec.theme}
              onChange={(event) => onThemeChange(event.target.value as "paper" | "night")}
            >
              <option value="paper">Paper</option>
              <option value="night">Night</option>
            </select>
          </label>
        </div>
      </div>
    </SurfaceCard>
  );
}
