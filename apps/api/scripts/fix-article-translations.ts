/**
 * One-off repair: re-translate Article nodes in a daily JSON whose translation
 * was generated from duplicated intro+article plain text.
 *
 * Usage:
 *   tsx scripts/fix-article-translations.ts --file ../../web/data/daily/2026-07-13.json
 */
import fs from "node:fs";
import path from "node:path";
import { getNodeIntroText, getTranslatableNodeText, type QuoteNode } from "@tweetquote/domain";
import { translateWithGoogle } from "../src/lib/providers";

function parseArgs(argv: string[]) {
  const args: Record<string, string> = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token?.startsWith("--")) continue;
    const key = token.slice(2);
    const next = argv[i + 1];
    if (next && !next.startsWith("--")) {
      args[key] = next;
      i += 1;
    }
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const fileArg = args.file;
  if (!fileArg) {
    console.error("Error: --file <daily.json> is required");
    process.exit(1);
  }
  const file = path.isAbsolute(fileArg) ? fileArg : path.resolve(process.cwd(), fileArg);
  const data = JSON.parse(fs.readFileSync(file, "utf8")) as {
    entries: Array<{ rank: number; document: { nodes: QuoteNode[] } }>;
  };

  const cache = new Map<string, string>();
  let fixedNodes = 0;

  for (const entry of data.entries) {
    for (const node of entry.document.nodes) {
      if (!node.article) continue;

      const intro = getNodeIntroText(node);
      const textToTranslate = getTranslatableNodeText(node);
      const prevTranslation = node.translation.text;
      const prevContent = node.content;

      node.content = intro;

      if (!textToTranslate) continue;

      let translated = cache.get(textToTranslate);
      if (!translated) {
        console.log(
          `rank#${entry.rank} @${node.author.handle}: translating ${textToTranslate.length} chars...`,
        );
        const artifact = await translateWithGoogle(textToTranslate, "zh-CN");
        translated = artifact.text;
        cache.set(textToTranslate, translated);
        console.log(`  -> ${translated.length} chars`);
      }

      if (translated === prevTranslation && node.content === prevContent) continue;

      node.translation = {
        ...node.translation,
        provider: "google",
        status: "success",
        language: "zh-CN",
        text: translated,
        annotations: [],
        updatedAt: new Date().toISOString(),
        version: node.translation.version ?? 1,
      };
      fixedNodes += 1;
    }
  }

  fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`, "utf8");
  console.log(`Wrote ${file}`);
  console.log(`Updated ${fixedNodes} article node(s); unique translations=${cache.size}`);

  const sample = data.entries
    .flatMap((entry) => entry.document.nodes)
    .find((node) => node.author.handle === "satyanadella");
  if (sample) {
    const text = sample.translation.text;
    console.log("VERIFY content:", JSON.stringify(sample.content.slice(0, 80)));
    console.log("VERIFY translation length:", text.length);
    console.log("VERIFY 逆向信息悖论 count:", (text.match(/逆向信息悖论/g) || []).length);
    console.log("VERIFY 智能化时代 count:", (text.match(/智能化时代/g) || []).length);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
