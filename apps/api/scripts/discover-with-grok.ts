/**
 * Daily Top candidate discovery via the Grok CLI.
 *
 * Asks Grok (which has live X/web access) to surface today's best *quote chains*
 * on X — tweets that quote/reply to another tweet where the added commentary
 * carries real value (sharp rebuttals, expert context, notable back-and-forth) —
 * and writes them as a daily-input file for generate-daily-top.ts.
 *
 * Requires: `grok login` completed once (or GROK_DEPLOYMENT_KEY set).
 *
 * Usage:
 *   tsx scripts/discover-with-grok.ts [options]
 *
 * Options:
 *   --date <YYYY-MM-DD> Leaderboard date (default: today).
 *   --count <n>         How many candidates to ask for (default: 12).
 *   --topics <list>     Comma-separated focus topics (default: AI,tech,finance,中文科技圈).
 *   --out <path>        Output file (default: scripts/daily-input.<date>.json).
 *   --grok <path>       Path to grok binary (default: ~/.grok/bin/grok or PATH).
 *   --timeout <sec>     Hard cap on the Grok call (default: 180).
 *   --print             Print Grok's raw structured output and exit (no file write).
 */
import { execFile } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const DEFAULT_TIMEOUT_MS = 180_000;

type GrokItem = { url?: string; reason?: string; reasonEn?: string; topic?: string };

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
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function resolveGrokBin(override?: string): string {
  if (override) return override;
  const home = os.homedir();
  const candidates = [path.join(home, ".grok", "bin", "grok"), path.join(home, ".local", "bin", "grok")];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return "grok";
}

function buildPrompt(count: number, topics: string, date: string): string {
  return [
    "You are curating TweetQuote's \"Daily Top\" — a leaderboard of the best QUOTE CHAINS on X, NOT standalone viral tweets.",
    "A quote chain is a tweet that quote-tweets or replies to another tweet, where the added commentary carries real value:",
    "a sharp rebuttal or dunk, expert context on news/research, or a notable back-and-forth exchange.",
    "",
    "CRITICAL — accuracy over completeness:",
    "- You MUST actually use your live X / web search tools to find these. Do NOT answer from memory.",
    "- NEVER invent, guess, or pattern-fill tweet IDs. Every URL must be one you actually located and opened via search.",
    "- Only include tweets you verified are currently live and genuinely quote/reply to another tweet.",
    `- It is far better to return fewer verified items than to pad up to ${count} with fabricated ones.`,
    "",
    `Search for up to ${count} of the most notable quote-tweet chains circulating around ${date}.`,
    `Cover a spread of these topics: ${topics}.`,
    "Prefer chains where the quote/reply clearly out-performed or reframed the original. Avoid duplicates.",
    "",
    "When done, output ONLY a single JSON object (no prose, no code fence) in exactly this shape:",
    '{"items":[{"url":"https://x.com/<user>/status/<id>","reason":"<一句中文理由>","reasonEn":"<one-line English reason>","topic":"<tag>"}]}',
    "where url is the QUOTING/replying tweet (the one adding commentary) so its full chain can be reconstructed.",
  ].join("\n");
}

function tryParse(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * Extract the first balanced `{...}` object that starts at `{"items"` from a
 * blob that may contain leading/trailing prose (Grok interleaves its reasoning
 * with the final JSON in the `text` field). Brace-matches while respecting
 * string literals and escapes so trailing prose after the JSON is ignored.
 */
function extractItemsObject(text: string): { items?: GrokItem[] } | null {
  const start = text.search(/\{\s*"items"\s*:/);
  if (start < 0) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i += 1) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === "{") depth += 1;
    else if (ch === "}") {
      depth -= 1;
      if (depth === 0) {
        return tryParse(text.slice(start, i + 1)) as { items?: GrokItem[] } | null;
      }
    }
  }
  return null;
}

function extractItems(stdout: string): GrokItem[] {
  const envelope = tryParse(stdout.trim()) as Record<string, unknown> | null;
  // Structured output (only present when --json-schema is used).
  const fromStructured = envelope?.structuredOutput as { items?: GrokItem[] } | undefined;
  if (fromStructured?.items) return fromStructured.items;
  // Preferred: the assistant's text field, which mixes reasoning + the final JSON.
  const text = typeof envelope?.text === "string" ? envelope.text : stdout;
  const inner = extractItemsObject(text);
  if (inner?.items) return inner.items;
  return [];
}

function killTree(child: ChildProcess): void {
  const pid = child.pid;
  if (pid === undefined) return;
  try {
    // Negative pid targets the whole process group (requires `detached`).
    process.kill(-pid, "SIGKILL");
  } catch {
    child.kill("SIGKILL");
  }
}

/**
 * Run Grok with a hard wall-clock cap.
 *
 * The `timeout` option of the *Sync helpers is not enough here: Grok spawns
 * children that inherit our stdio pipes, so the parent keeps waiting on those
 * pipes long after the deadline (one run stalled ~2h and burned the whole
 * daily-auto window). Detaching puts Grok in its own process group so we can
 * SIGKILL the entire tree and let the pipes close.
 */
function runGrok(bin: string, args: string[], timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    let timedOut = false;
    const child = execFile(
      bin,
      args,
      { encoding: "utf8", maxBuffer: 32 * 1024 * 1024, detached: true },
      (error, stdout) => {
        clearTimeout(timer);
        // Grok may exit non-zero yet still have printed usable output.
        if (stdout) return resolve(stdout);
        if (timedOut) return reject(new Error(`no output within ${Math.round(timeoutMs / 1000)}s`));
        return reject(error ?? new Error("no output"));
      },
    );
    const timer = setTimeout(() => {
      timedOut = true;
      killTree(child);
    }, timeoutMs);
  });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const date = (typeof args.date === "string" && args.date) || todayLocalIso();
  const count = typeof args.count === "string" ? Math.max(1, Number.parseInt(args.count, 10) || 12) : 12;
  const topics = typeof args.topics === "string" ? args.topics : "AI, tech, finance/crypto, 中文科技圈";
  const grokBin = resolveGrokBin(typeof args.grok === "string" ? args.grok : undefined);
  const timeoutMs =
    typeof args.timeout === "string"
      ? Math.max(1, Number.parseInt(args.timeout, 10) || DEFAULT_TIMEOUT_MS / 1000) * 1000
      : DEFAULT_TIMEOUT_MS;

  console.log(`Asking Grok for ${count} quote-chain candidates around ${date} (topics: ${topics})...`);

  let stdout = "";
  try {
    stdout = await runGrok(
      grokBin,
      ["-p", buildPrompt(count, topics, date), "--output-format", "json", "--permission-mode", "dontAsk"],
      timeoutMs,
    );
  } catch (error) {
    console.error(`Grok invocation failed: ${(error as Error).message}`);
    process.exit(1);
  }

  if (args.print) {
    console.log(stdout);
    return;
  }

  const seenUrls = new Set<string>();
  const items = extractItems(stdout)
    .filter((item) => typeof item.url === "string" && /x\.com\/[^/]+\/status\/\d+/.test(item.url))
    .map((item) => ({
      url: item.url as string,
      reason: item.reason ?? "",
      reasonEn: item.reasonEn ?? "",
    }))
    .filter((item) => {
      if (seenUrls.has(item.url)) return false;
      seenUrls.add(item.url);
      return true;
    });

  if (items.length === 0) {
    console.error("No valid candidates parsed from Grok output. Raw output follows:\n");
    console.error(stdout.slice(0, 2000));
    process.exit(1);
  }

  const outPath =
    typeof args.out === "string"
      ? path.resolve(process.cwd(), args.out)
      : path.resolve(process.cwd(), "scripts", `daily-input.${date}.json`);

  const payload = {
    date,
    title: "每日 X 精华引用榜",
    titleEn: "Daily Quote Essence on X",
    items,
  };
  fs.writeFileSync(outPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  console.log(`Wrote ${items.length} candidate(s) to ${outPath}`);
  console.log("Review it, then run: npm run daily:generate -w @tweetquote/api -- --input " + path.relative(process.cwd(), outPath));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
