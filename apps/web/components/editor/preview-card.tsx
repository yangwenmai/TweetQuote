import type { QuoteDocument } from "@tweetquote/domain";
import { QuotePreview, SurfaceCard } from "@tweetquote/ui";

type PreviewCardProps = {
  document: QuoteDocument;
  summary: {
    title: string;
    subtitle: string;
    translationLabel: string;
  };
};

export function PreviewCard({ document, summary }: PreviewCardProps) {
  return (
    <SurfaceCard title={summary.title} subtitle={summary.subtitle}>
      <div className="muted" style={{ marginBottom: 12 }}>
        {summary.translationLabel}
      </div>
      <QuotePreview document={document} />
    </SurfaceCard>
  );
}
