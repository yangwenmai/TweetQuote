import type { AppLanguage, TranslationProvider } from "@tweetquote/domain";
import { Button, SurfaceCard } from "@tweetquote/ui";

type FetchCardProps = {
  tweetUrl: string;
  language: AppLanguage;
  provider: TranslationProvider;
  busy: boolean;
  onTweetUrlChange: (value: string) => void;
  onLanguageChange: (value: AppLanguage) => void;
  onProviderChange: (value: TranslationProvider) => void;
  onFetch: () => void;
};

export function FetchCard({
  tweetUrl,
  language,
  provider,
  busy,
  onTweetUrlChange,
  onLanguageChange,
  onProviderChange,
  onFetch,
}: FetchCardProps) {
  const canFetch = tweetUrl.trim().length > 0 && !busy;

  return (
    <SurfaceCard title="抓取入口" subtitle="粘贴推文链接，一键抓取完整引用链，按需翻译。">
      <div className="stack">
        <label className="field">
          <span>推文链接</span>
          <input value={tweetUrl} onChange={(event) => onTweetUrlChange(event.target.value)} placeholder="https://x.com/.../status/..." />
        </label>
        <div className="row">
          <label className="field" style={{ flex: 1 }}>
            <span>目标语言</span>
            <select value={language} onChange={(event) => onLanguageChange(event.target.value as AppLanguage)}>
              <option value="zh-CN">中文</option>
              <option value="en">English</option>
            </select>
          </label>
          <label className="field" style={{ flex: 1 }}>
            <span>抓取后翻译</span>
            <select value={provider} onChange={(event) => onProviderChange(event.target.value as TranslationProvider)}>
              <option value="none">不翻译</option>
              <option value="google">Google</option>
              <option value="ai">AI</option>
            </select>
          </label>
        </div>
        <Button onClick={onFetch} disabled={!canFetch}>
          {busy ? "抓取中..." : "抓取引用链"}
        </Button>
      </div>
    </SurfaceCard>
  );
}
