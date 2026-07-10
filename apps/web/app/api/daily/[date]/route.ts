import { NextResponse } from "next/server";
import { removeDailyEntry } from "../../../../lib/daily";

export const dynamic = "force-dynamic";

/**
 * DELETE /api/daily/<date>?rank=<n>
 *
 * Removes one entry from a day's leaderboard and re-ranks the rest. This mutates
 * the local JSON file, so it's only meant for the author's local curation
 * workflow and is disabled in production to keep public deploys read-only.
 */
export async function DELETE(request: Request, { params }: { params: Promise<{ date: string }> }) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "editing is disabled in production" }, { status: 403 });
  }

  const { date } = await params;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: "invalid date" }, { status: 400 });
  }

  const rank = Number.parseInt(new URL(request.url).searchParams.get("rank") ?? "", 10);
  if (!Number.isInteger(rank) || rank < 1) {
    return NextResponse.json({ error: "invalid rank" }, { status: 400 });
  }

  const updated = removeDailyEntry(date, rank);
  if (!updated) {
    return NextResponse.json({ error: "entry not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true, entries: updated.entries.length });
}
