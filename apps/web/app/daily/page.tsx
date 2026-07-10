import type { Metadata } from "next";
import { DailyTopView } from "../../components/daily/daily-top-view";
import { listDailyDates, loadDailyTop } from "../../lib/daily";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "每日 X 精华引用榜 · TweetQuote",
  description: "每天精选网络上最有价值的推文引用链，按精华分排行。",
};

export default function DailyPage() {
  const dates = listDailyDates();
  const activeDate = dates[0] ?? "";
  const data = activeDate ? loadDailyTop(activeDate) : null;

  return (
    <main className="page-shell">
      <DailyTopView data={data} dates={dates} activeDate={activeDate} editable={process.env.NODE_ENV !== "production"} />
    </main>
  );
}
