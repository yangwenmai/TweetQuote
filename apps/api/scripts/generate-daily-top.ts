/**
 * Daily Top 10 generator.
 *
 * Reads a small input file listing candidate tweet URLs (curated each day),
 * hydrates each one into a full quote chain via the existing TwitterAPI.io
 * pipeline, then keeps only real quote chains (nodes >= 2) — lone tweets are
 * skipped, since the product's core value is the quote. Survivors are ranked by
 * "essence" score (peak engagement heat boosted by chain depth / dunk /
 * bookmark-rate signals) and the top N are written to
 * apps/web/data/daily/<date>.json for the /daily page to render.
 *
 * Duplicate URLs in the input are de-duplicated before fetching.
 *
 * Usage:
 *   tsx scripts/generate-daily-top.ts --input <file.json> [options]
 *
 * Options:
 *   --input <path>     Input JSON (see format below). Required.
 *   --date <YYYY-MM-DD> Override the leaderboard date (default: input.date or today).
 *   --provider <p>     Translation provider: none | google | ai (default: google).
 *   --no-translate     Shorthand for --provider none.
 *   --top <n>          Keep top N entries (default: 10).
 *   --key <k>          TwitterAPI.io key override (default: TWITTERAPI_KEY from .env.local).
 *   --out <dir>        Output directory (default: apps/web/data/daily).
 *
 * Input format:
 *   {
 *     "date": "2026-07-10",           // optional
 *     "title": "今日 X 热榜",          // optional
 *     "titleEn": "Today on X",        // optional
 *     "items": [
 *       { "url": "https://x.com/user/status/123", "reason": "…", "reasonEn": "…" }
 *     ]
 *   }
 */
import fs from "node:fs";
import path from "node:path";
import {
  computeEssence,
  dailyTopSchema,
  type DailyTop,
  type DailyTopEntry,
  type EngagementMetrics,
  type TranslationProvider,
} from "@tweetquote/domain";
import { apiEnv } from "../src/lib/env";
import { buildDocumentFromQuoteRequest } from "../src/lib/providers";

type InputItem = { url?: string; tweetUrl?: string; reason?: string; reasonEn?: string };
type InputFile = { date?: string; title?: string; titleEn?: string; items?: InputItem[] };

function parseArgs(argv: string[]) {
  const args: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token?.startsWith("--")) continue;
    const key = token.slice(2);
    const next = argv[i + 1];
    if (next && !next.startsWith("--")) {
      args[key] = next;
      i += 1;
    } else {
      args[key] = true;
    }
  }
  return args;
}

function todayLocalIso(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  const inputPath = typeof args.input === "string" ? args.input : "";
  if (!inputPath) {
    console.error("Error: --input <file.json> is required.");
    process.exit(1);
  }

  const absInput = path.isAbsolute(inputPath) ? inputPath : path.resolve(process.cwd(), inputPath);
  if (!fs.existsSync(absInput)) {
    console.error(`Error: input file not found: ${absInput}`);
    process.exit(1);
  }

  const input = JSON.parse(fs.readFileSync(absInput, "utf8")) as InputFile;
  const seenUrls = new Set<string>();
  const items = (input.items ?? []).filter((it) => {
    const url = (it.url || it.tweetUrl || "").trim();
    if (!url || seenUrls.has(url)) return false;
    seenUrls.add(url);
    return true;
  });
  if (items.length === 0) {
    console.error("Error: input file has no items with a url.");
    process.exit(1);
  }

  const date = (typeof args.date === "string" && args.date) || input.date || todayLocalIso();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    console.error(`Error: invalid --date "${date}" (expected YYYY-MM-DD).`);
    process.exit(1);
  }

  const provider: TranslationProvider = args["no-translate"]
    ? "none"
    : ((typeof args.provider === "string" ? args.provider : "google") as TranslationProvider);

  const topN = typeof args.top === "string" ? Math.max(1, Number.parseInt(args.top, 10) || 10) : 10;
  const apiKey = typeof args.key === "string" ? args.key : apiEnv.twitterApiKey;

  if (!apiKey) {
    console.error(
      "Error: no TwitterAPI.io key. Set TWITTERAPI_KEY in .env.local or pass --key <k>.\n" +
        "Get one at https://twitterapi.io",
    );
    process.exit(1);
  }

  const outDir =
    typeof args.out === "string"
      ? path.resolve(process.cwd(), args.out)
      : path.join(apiEnv.repoRoot, "apps", "web", "data", "daily");
  fs.mkdirSync(outDir, { recursive: true });

  console.log(`Generating Daily Top for ${date} — ${items.length} candidate(s), provider=${provider}`);

  type BuiltEntry = Omit<DailyTopEntry, "rank">;
  const built: BuiltEntry[] = [];
  for (const [index, item] of items.entries()) {
    const url = (item.url || item.tweetUrl || "").trim();
    console.log(`  [${index + 1}/${items.length}] fetching ${url}`);
    try {
      const { document } = await buildDocumentFromQuoteRequest({
        tweetUrl: url,
        apiKey,
        targetLanguage: "zh-CN",
        translationProvider: provider,
        includeAnnotations: provider === "ai",
        source: "import",
      });
      document.renderSpec.translationDisplay = provider === "none" ? "original" : "bilingual";
      document.renderSpec.language = "zh-CN";

      const { score, heat, signals } = computeEssence(document);
      const peakNode = document.nodes[signals.peakIndex] ?? document.nodes[0];
      const metrics: EngagementMetrics = peakNode?.metrics ?? {
        views: peakNode?.viewCount ?? null,
        likes: null,
        retweets: null,
        replies: null,
        quotes: null,
        bookmarks: null,
      };
      // The product only features quote chains — a lone tweet is not "essence". Skip it.
      if (document.nodes.length < 2) {
        console.log(`      skipped: single tweet (no quote chain)`);
        continue;
      }
      console.log(
        `      depth=${signals.depth} essence=${score} heat=${heat}${signals.hasDunk ? " [dunk]" : ""}`,
      );

      built.push({
        essenceScore: score,
        heatScore: heat,
        signals,
        sourceUrl: url,
        reason: item.reason ?? "",
        reasonEn: item.reasonEn ?? "",
        metrics,
        document,
      });
    } catch (error) {
      console.error(`      failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  const chains = built
    .sort((a, b) => b.essenceScore - a.essenceScore)
    .slice(0, topN)
    .map((entry, idx): DailyTopEntry => ({ ...entry, rank: idx + 1 }));

  if (chains.length === 0) {
    console.error("Error: no quote chains could be fetched. Nothing written.");
    process.exit(1);
  }

  const payload: DailyTop = dailyTopSchema.parse({
    date,
    title: input.title ?? "",
    titleEn: input.titleEn ?? "",
    generatedAt: new Date().toISOString(),
    entries: chains,
  });

  const outFile = path.join(outDir, `${date}.json`);
  fs.writeFileSync(outFile, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  console.log(`\nWrote ${chains.length} quote chain(s) to ${outFile}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
