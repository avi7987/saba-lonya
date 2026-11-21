import { NextResponse } from "next/server";
import { later } from "@/server/analyze";
import { isHebrew, runJobs } from "@/server/knowledge";
import { factStore, jobStore, store, textStore } from "@/server/store";

export const runtime = "nodejs";

/*
  What was read from a memory's pages: for each photographed page, its words in the original
  language and in Hebrew (each marked as the computer's work or as checked by the family), and the
  facts about Lonya found in it (verified ones, and suggestions still waiting for the owner).
*/
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const m = await store.get(id);
  if (!m || m.status === "rejected") return NextResponse.json({ error: "not found" }, { status: 404 });

  const [texts, facts, jobs] = await Promise.all([textStore.list("approved"), factStore.list(), jobStore.list("pending")]);
  const mine = texts.filter((t) => t.memoryId === id);
  const pages = m.files
    .filter((f) => f.kind === "image")
    .map((f) => {
      const original = mine.find((t) => t.file === f.name && t.source === "ocr");
      const he = mine.find((t) => t.file === f.name && t.source === "translation");
      return {
        file: f.name,
        src: `/api/files/memories/${id}/${f.thumb ?? f.name}`,
        original: original?.text,
        originalChecked: original?.by === "owner",
        he: he?.text,
        heChecked: he?.by === "owner",
      };
    })
    .filter((p) => p.original || p.he);

  const found = facts
    .filter((f) => f.status !== "rejected" && f.sources.some((s) => s.memoryId === id))
    .map((f) => ({ id: f.id, he: f.statement, ru: f.statementRu, year: f.year, place: f.place, verified: f.status === "approved" }))
    .sort((a, b) => Number(b.verified) - Number(a.verified));

  // still being read or translated: a visit moves the work along a little
  // (a page read before translations existed is put in line for one by the work itself)
  const waiting = jobs.some((j) => j.memoryId === id && j.type !== "index") || pages.some((p) => p.original && !p.he && !isHebrew(p.original));
  if (waiting) await later(runJobs({ memoryId: id, limit: 3 }));

  return NextResponse.json({ pages, facts: found, waiting }, { headers: { "Cache-Control": "no-cache" } });
}
