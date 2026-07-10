import fs from "node:fs";
import path from "node:path";
import { dailyTopSchema, type DailyTop } from "@tweetquote/domain";

const DATA_DIR = path.join(process.cwd(), "data", "daily");

/** Available leaderboard dates (YYYY-MM-DD), newest first. */
export function listDailyDates(): string[] {
  if (!fs.existsSync(DATA_DIR)) return [];
  return fs
    .readdirSync(DATA_DIR)
    .filter((file) => /^\d{4}-\d{2}-\d{2}\.json$/.test(file))
    .map((file) => file.replace(/\.json$/, ""))
    .sort((a, b) => (a < b ? 1 : -1));
}

/** Load and validate one day's leaderboard, or null when missing/invalid. */
export function loadDailyTop(date: string): DailyTop | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const file = path.join(DATA_DIR, `${date}.json`);
  if (!fs.existsSync(file)) return null;
  try {
    return dailyTopSchema.parse(JSON.parse(fs.readFileSync(file, "utf8")));
  } catch {
    return null;
  }
}

/**
 * Remove one entry (by its current rank) from a day's leaderboard, re-rank the
 * survivors, and persist the file. Returns the updated board, or null when the
 * date/entry can't be found. Intended for the author's local curation flow —
 * the calling route is disabled in production.
 */
export function removeDailyEntry(date: string, rank: number): DailyTop | null {
  const data = loadDailyTop(date);
  if (!data) return null;
  const remaining = data.entries.filter((entry) => entry.rank !== rank);
  if (remaining.length === data.entries.length) return null;
  const reRanked = remaining.map((entry, index) => ({ ...entry, rank: index + 1 }));
  const next: DailyTop = { ...data, entries: reRanked };
  const file = path.join(DATA_DIR, `${date}.json`);
  fs.writeFileSync(file, `${JSON.stringify(next, null, 2)}\n`, "utf8");
  return next;
}

export type DailyIndexItem = {
  date: string;
  title: string;
  titleEn: string;
  chains: number;
};

/** Lightweight summary of every archived day, newest first (for the archive page). */
export function loadDailyIndex(): DailyIndexItem[] {
  return listDailyDates()
    .map((date) => {
      const data = loadDailyTop(date);
      if (!data) return null;
      return {
        date,
        title: data.title,
        titleEn: data.titleEn,
        chains: data.entries.length,
      } satisfies DailyIndexItem;
    })
    .filter((item): item is DailyIndexItem => item !== null);
}
