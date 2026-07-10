import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DailyTopView } from "../../../components/daily/daily-top-view";
import { listDailyDates, loadDailyTop } from "../../../lib/daily";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ date: string }>;
}): Promise<Metadata> {
  const { date } = await params;
  return {
    title: `每日 X 精华引用榜 · ${date} · TweetQuote`,
    description: "每天精选网络上最有价值的推文引用链，按精华分排行。",
  };
}

export default async function DailyDatePage({ params }: { params: Promise<{ date: string }> }) {
  const { date } = await params;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    notFound();
  }
  const dates = listDailyDates();
  const data = loadDailyTop(date);
  if (!data) {
    notFound();
  }

  return (
    <main className="page-shell">
      <DailyTopView data={data} dates={dates} activeDate={date} editable={process.env.NODE_ENV !== "production"} />
    </main>
  );
}
