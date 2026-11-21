import { NextResponse } from "next/server";
import { isAdmin } from "@/server/auth";
import { aiAvailable } from "@/server/ai";
import { enqueueMemory, queueState, runJobs, saveOwnerText } from "@/server/knowledge";
import { indexFact, indexState } from "@/server/semantic";
import { factStore, jobStore, store, textStore, type StoredFact } from "@/server/store";

export const runtime = "nodejs";

const json = (b: unknown, status = 200) => NextResponse.json(b, { status, headers: { "Cache-Control": "no-store" } });
const text = (v: unknown, n: number) => (typeof v === "string" ? v.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim().slice(0, n) : undefined);
const CATEGORIES: StoredFact["category"][] = ["origin", "family", "home", "work", "events", "traits", "food", "other"];

/** Everything the site has learned, for the owner to check. */
export async function GET(req: Request) {
  if (!(await isAdmin(req))) return json({ error: "unauthorized" }, 401);
  const [facts, texts, memories, queue, ai, index] = await Promise.all([factStore.list(), textStore.list("approved"), store.list(), queueState(), aiAvailable(), indexState()]);
  const titles = Object.fromEntries(memories.map((m) => [m.id, { title: m.title || m.body.slice(0, 60), author: m.author }]));
  // every photographed page of a letter or recipe, with what was read from it and its Hebrew
  const pages = memories
    .filter((m) => m.status !== "rejected" && (m.type === "letter" || m.type === "recipe"))
    .flatMap((m) =>
      m.files
        .filter((f) => f.kind === "image")
        .map((f) => {
          const of = (source: "ocr" | "translation") => {
            const t = texts.find((x) => x.memoryId === m.id && x.file === f.name && x.source === source);
            return t ? { text: t.text, by: t.by } : undefined;
          };
          return { memoryId: m.id, file: f.name, src: `/api/files/memories/${m.id}/${f.thumb ?? f.name}`, full: `/api/files/memories/${m.id}/${f.name}`, ocr: of("ocr"), translation: of("translation"), createdAt: m.createdAt };
        })
    )
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return json({ facts, texts, titles, queue, ai, index, pages });
}

/**
 * The owner's decisions: verify, correct or reject a fact, add one by hand, and run the
 * background work now (or prepare it for everything shared before this existed).
 */
export async function POST(req: Request) {
  if (!(await isAdmin(req))) return json({ error: "unauthorized" }, 401);
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const id = text(b.id, 80) ?? "";

  switch (b.action) {
    case "verify":
    case "reject":
    case "suggest": {
      const r = await factStore.setStatus(id, b.action === "verify" ? "approved" : b.action === "reject" ? "rejected" : "pending");
      // only verified facts are searchable and used in answers
      if (r) await indexFact(r).catch(() => false);
      return r ? json({ ok: true, fact: r }) : json({ error: "not found" }, 404);
    }
    case "edit":
    case "add": {
      const statement = text(b.statement, 300);
      if (!statement) return json({ error: "statement" }, 422);
      const year = Number(b.year);
      const fields = {
        statement,
        statementRu: text(b.statementRu, 300) || undefined,
        category: CATEGORIES.includes(b.category as StoredFact["category"]) ? (b.category as StoredFact["category"]) : "other",
        year: Number.isInteger(year) && year > 1850 && year <= new Date().getFullYear() ? year : undefined,
        place: text(b.place, 80) || undefined,
      };
      if (b.action === "add") {
        // what the owner writes is verified by definition
        const made = await factStore.create({ ...fields, sources: [{ memoryId: "", kind: "owner" }], by: "owner" }, [], "approved");
        await indexFact(made).catch(() => false);
        return json({ ok: true, fact: made });
      }
      // a corrected fact is checked by the person who corrected it
      const r = await factStore.update(id, (cur) => ({ ...cur, ...fields }));
      const v = r ? await factStore.setStatus(id, "approved") : undefined;
      if (v) await indexFact(v).catch(() => false);
      return r ? json({ ok: true }) : json({ error: "not found" }, 404);
    }
    case "page": {
      // the owner corrects or writes a page's words, or its Hebrew translation
      const memoryId = text(b.memoryId, 80) ?? "";
      const file = text(b.file, 200) ?? "";
      const source = b.source === "translation" ? "translation" : b.source === "ocr" ? "ocr" : null;
      const m = memoryId ? await store.get(memoryId) : undefined;
      if (!m || !source || !m.files.some((f) => f.name === file && f.kind === "image")) return json({ error: "not found" }, 404);
      const words = typeof b.text === "string" ? b.text.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").slice(0, 20000) : "";
      await saveOwnerText(memoryId, file, source, words);
      // done now, while the owner waits: work after the reply is cut short on the free plan
      await runJobs({ memoryId, limit: 4 });
      return json({ ok: true });
    }
    case "process": {
      const done = await runJobs({ limit: 8 });
      return json({ ok: true, done, queue: await queueState() });
    }
    case "backfill": {
      // everything shared before the engine existed gets its turn, a little each day
      const all = (await store.list()).filter((m) => m.status !== "rejected");
      for (const m of all) await enqueueMemory(m);
      // verified facts that are not searchable yet (added while the AI was unavailable)
      for (const f of await factStore.list("approved")) await indexFact(f).catch(() => false);
      return json({ ok: true, memories: all.length, queue: await queueState() });
    }
    case "retry": {
      for (const j of await jobStore.list("rejected")) {
        await jobStore.update(j.id, (cur) => ({ ...cur, attempts: 0, error: undefined }));
        await jobStore.setStatus(j.id, "pending");
      }
      return json({ ok: true, queue: await queueState() });
    }
  }
  return json({ error: "action" }, 400);
}
