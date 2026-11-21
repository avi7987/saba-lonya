import "server-only";
import { profile } from "@/content";
import { MODELS, base64, budgetLeft, chat, parseJson, runAi } from "./ai";
import { indexMemory } from "./semantic";
import { factStore, jobStore, store, textStore, type FactSource, type StoredFact, type StoredJob, type StoredMemory, type StoredText } from "./store";

/*
  What the site learns from what the family shares.

  Every new memory leaves a little background work: read the words in a photographed letter or
  recipe, write down what is said in a recording, and then look for facts about Lonya's life in all
  of it. A fact is kept only together with the exact words it came from, and it stays a suggestion
  until the site's owner checks it. Nothing found by the computer is shown as certain.
*/

/** kinds whose pictures are usually pages of writing; in other kinds, pages are noticed one by one */
const TYPES_TO_READ = new Set(["letter", "recipe", "story"]);

/** kinds that are pages of writing by definition (a story's pictures may be photos: each is checked) */
const PAGE_TYPES = new Set(["letter", "recipe"]);

/** does this memory have pages of writing to read? */
export const readsPages = (m: Pick<StoredMemory, "type" | "files">) => m.files.some((f) => f.kind === "image" && !f.deleteRequest && (f.page || PAGE_TYPES.has(m.type ?? "")));

/** a picture turned out to be a page of writing: read it, then look at the memory again */
export async function enqueuePage(memoryId: string, file: string) {
  await enqueue("ocr", memoryId, file);
  await enqueue("facts", memoryId);
  await enqueue("index", memoryId);
}
const MAX_AUDIO = 20 * 1024 * 1024;
const MAX_IMAGE = 2_500_000;
const CATEGORIES: StoredFact["category"][] = ["origin", "family", "home", "work", "events", "traits", "food", "other"];

const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[֑-ׇ̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();

/* ---------- the queue ---------- */

async function enqueue(type: StoredJob["type"], memoryId: string, file?: string) {
  const open = await jobStore.list("pending");
  if (open.some((j) => j.type === type && j.memoryId === memoryId && j.file === file)) return;
  await jobStore.create({ type, memoryId, file, attempts: 0 }, [], "pending");
}

/** what a memory needs: its letters read, its recordings written down, then its facts found */
export async function enqueueMemory(m: StoredMemory) {
  for (const f of m.files) {
    if (f.deleteRequest) continue;
    // recordings, and videos whose soundtrack was taken out when they were shared
    if (f.kind === "audio" || (f.kind === "video" && f.sound)) await enqueue("transcribe", m.id, f.name);
    if (f.kind === "image" && (f.page || TYPES_TO_READ.has(m.type ?? ""))) await enqueue("ocr", m.id, f.name);
  }
  await enqueue("facts", m.id);
  await enqueue("index", m.id);
}

/** people were tagged: what the answers know about this memory is refreshed (no new facts needed) */
export async function enqueueIndex(memoryId: string) {
  await enqueue("index", memoryId);
}

/** after the family told more about a photo, look at the memory again */
export async function enqueueFacts(memoryId: string) {
  await enqueue("facts", memoryId);
  await enqueue("index", memoryId);
}

const ORDER: Record<StoredJob["type"], number> = { ocr: 0, transcribe: 0, translate: 1, facts: 1, index: 2 };

/**
 * Do some of the waiting work. Stops when the day's share of the AI allowance is used; what is
 * left stays in the queue for the next time (a later upload, or the owner opening the page).
 */
/**
 * When what goes into the search changes (e.g. the people tagged in a memory were added to it),
 * every memory is indexed again, once.
 */
const INDEX_VERSION = "2";
async function refreshIndexOnce() {
  if ((await store.getMeta("index-version").catch(() => undefined)) === INDEX_VERSION) return;
  await store.setMeta("index-version", INDEX_VERSION);
  for (const m of await store.list()) if (m.status !== "rejected") await enqueue("index", m.id);
}

/**
 * Pages handled by an earlier model are done again, once, by the better one: read again (unless
 * the owner corrected the words), translated again (unless the owner wrote the translation), and
 * looked at again for what they tell.
 */
const PAGES_VERSION = "3";
async function translateOnce() {
  if ((await store.getMeta("pages-version").catch(() => undefined)) === PAGES_VERSION) return;
  await store.setMeta("pages-version", PAGES_VERSION);
  const texts = await textStore.list("approved");
  for (const m of await store.list()) {
    if (m.status === "rejected" || !m.files.some((f) => f.kind === "image" && (f.page || TYPES_TO_READ.has(m.type ?? "")))) continue;
    for (const f of m.files) {
      if (f.kind !== "image" || f.deleteRequest || !(f.page || TYPES_TO_READ.has(m.type ?? ""))) continue;
      const owner = (source: string) => texts.some((t) => t.memoryId === m.id && t.file === f.name && t.source === source && t.by === "owner");
      if (!owner("ocr")) await enqueue("ocr", m.id, f.name);
      else if (!owner("translation")) await enqueue("translate", m.id, f.name);
    }
    await enqueue("facts", m.id);
    await enqueue("index", m.id);
  }
}

/** mostly Hebrew letters: nothing to translate */
export function isHebrew(text: string) {
  const he = (text.match(/[\u05d0-\u05ea]/g) ?? []).length;
  const all = (text.match(/\p{L}/gu) ?? []).length;
  return all > 0 && he / all > 0.5;
}

export async function runJobs(opts: { memoryId?: string; limit?: number; until?: number } = {}) {
  await refreshIndexOnce().catch(() => {});
  await translateOnce().catch(() => {});
  const jobs = (await jobStore.list("pending"))
    .filter((j) => !opts.memoryId || j.memoryId === opts.memoryId)
    .sort((a, b) => ORDER[a.type] - ORDER[b.type] || a.createdAt.localeCompare(b.createdAt));
  let done = 0;
  for (const j of jobs.slice(0, opts.limit ?? 6)) {
    // out of time for this round: the rest waits for the next one
    if (opts.until && Date.now() > opts.until) break;
    // a memory's facts wait until its letters and recordings are read
    if (j.type !== "ocr" && j.type !== "transcribe" && jobs.some((o) => o.memoryId === j.memoryId && ORDER[o.type] < ORDER[j.type] && o.status === "pending" && o.id !== j.id)) continue;
    const budget = j.type === "transcribe" ? "speech" : j.type === "index" ? "embed" : "background";
    if ((await budgetLeft(budget)) <= 0) break;
    let ok: boolean | "skip" = false;
    let error: string | undefined;
    try {
      ok =
        j.type === "ocr" ? await readImage(j) : j.type === "transcribe" ? await transcribe(j) : j.type === "translate" ? await translate(j) : j.type === "index" ? await indexMemory(j.memoryId) : await findFacts(j.memoryId);
    } catch (e) {
      error = String((e as Error)?.message ?? e).slice(0, 200);
    }
    if (ok) {
      await jobStore.setStatus(j.id, "approved");
      j.status = "approved";
      done++;
    } else {
      const attempts = j.attempts + 1;
      await jobStore.update(j.id, (cur) => ({ ...cur, attempts, error: error ?? cur.error }));
      if (attempts >= 3) await jobStore.setStatus(j.id, "rejected");
      // probably out of allowance for today
      if (!error) break;
    }
  }
  return done;
}

/* ---------- reading and listening ---------- */

async function saveText(j: { memoryId: string; file?: string }, source: StoredText["source"], text: string, model?: string, by?: "owner") {
  const old = (await textStore.list()).filter((t) => t.memoryId === j.memoryId && t.file === j.file && t.source === source && t.status !== "rejected");
  for (const o of old) await textStore.setStatus(o.id, "rejected");
  await textStore.create({ memoryId: j.memoryId, file: j.file, source, text: text.slice(0, 20000), model, by }, [], "approved");
}

/** what the owner wrote or corrected stays: the computer does not write over it */
async function ownerText(memoryId: string, file: string | undefined, source: StoredText["source"]) {
  return (await textStore.list("approved")).find((t) => t.memoryId === memoryId && t.file === file && t.source === source && t.by === "owner");
}

/**
 * The owner corrects (or writes) a page's words or their Hebrew translation. A corrected original
 * is translated again unless the owner wrote the translation too; the facts are looked for again.
 */
export async function saveOwnerText(memoryId: string, file: string, source: "ocr" | "translation", text: string) {
  const clean = text.trim();
  if (clean) await saveText({ memoryId, file }, source, clean, undefined, "owner");
  else for (const t of (await textStore.list("approved")).filter((t) => t.memoryId === memoryId && t.file === file && t.source === source)) await textStore.setStatus(t.id, "rejected");
  if (source === "ocr" && clean && !isHebrew(clean) && !(await ownerText(memoryId, file, "translation"))) await enqueue("translate", memoryId, file);
  if (source === "ocr") await enqueue("facts", memoryId);
  await enqueue("index", memoryId);
}

/** the words in a photographed letter, recipe or document, in their own language */
async function readImage(j: StoredJob): Promise<boolean | "skip"> {
  const m = await store.get(j.memoryId);
  const f = m?.files.find((x) => x.name === j.file);
  if (!m || !f) return "skip";
  if (await ownerText(m.id, f.name, "ocr")) return "skip";
  // the original, if it is small enough to send, keeps small handwriting readable
  const src = f.size <= MAX_IMAGE ? f.name : f.thumb;
  const bytes = src ? await store.readFile(m.id, src) : undefined;
  if (!bytes) return "skip";
  const mime = /\.png$/i.test(src!) ? "image/png" : /\.webp$/i.test(src!) ? "image/webp" : "image/jpeg";
  const text = await chat("background", [
    {
      role: "user",
      content: [
        {
          type: "text",
          text: `Copy out all the text in this image exactly as written (handwritten or printed), in its original language (often Hebrew or Russian), keeping line breaks. Do not translate, summarise or add anything. Where a word cannot be read, write [?]. If there is no text, or the picture is a photograph of people, places or things rather than a page of writing (even if a few words, like a sign or a label, can be seen), answer exactly: NO_TEXT`,
        },
        { type: "image_url", image_url: { url: `data:${mime};base64,${base64(bytes)}` } },
      ],
    },
  ], { maxTokens: 3000, temperature: 0, model: MODELS.pages, think: false });
  if (text === null) return false;
  const clean = text.replace(/^\s*```\w*\n?|\n?```\s*$/g, "").trim();
  if (!clean || /^NO_TEXT/.test(clean) || clean.length < 12) return true;
  // it is a page of writing: marked so, it is shown with its words wherever it appears
  if (!f.page) await store.update(m.id, (cur) => ({ ...cur, files: cur.files.map((x) => (x.name === f.name ? { ...x, page: true } : x)) }));
  await saveText(j, "ocr", clean, MODELS.pages);
  if (!isHebrew(clean)) await enqueue("translate", j.memoryId, j.file);
  return true;
}

/**
 * A page's words in Hebrew, by the larger model (better Hebrew). Kept line by line, so a poem
 * stays a poem; what could not be read stays [?]. Shown as a computer's translation.
 */
async function translate(j: StoredJob): Promise<boolean | "skip"> {
  if (await ownerText(j.memoryId, j.file, "translation")) return "skip";
  const texts = (await textStore.list("approved")).filter((t) => t.memoryId === j.memoryId && t.file === j.file);
  const original = texts.find((t) => t.source === "ocr")?.text;
  if (!original || isHebrew(original)) return "skip";
  const answer = await chat(
    "background",
    [
      {
        role: "system",
        content: `You translate family papers of grandfather Lonya (letters, poems, greetings, mostly in Russian) into natural, warm modern Hebrew.
Rules:
- Translate everything, line by line: keep the same line breaks and stanzas, so a poem stays a poem. Do not try to rhyme; keep the meaning and the feeling.
- Keep names as names, written in Hebrew letters (Циля → צילה, Динка → דינקה), and keep dates and numbers as they are. "в/ч" is a military unit (יחידה צבאית).
- Where the text has [?], keep [?]. Do not guess missing words, do not explain, summarise or add anything.
- Reply with the Hebrew translation only.`,
      },
      { role: "user", content: original },
    ],
    // it thinks the poem through first (most of the time goes there), then translates faithfully
    { maxTokens: 9000, temperature: 0.2, model: MODELS.pages }
  );
  if (answer === null) return false;
  const he = answer.replace(/^```\w*\n?|\n?```$/g, "").trim();
  if (he && isHebrew(he)) await saveText(j, "translation", he, MODELS.pages);
  return true;
}

/** what is said in a recording */
async function transcribe(j: StoredJob): Promise<boolean | "skip"> {
  const m = await store.get(j.memoryId);
  const f = m?.files.find((x) => x.name === j.file);
  if (!m || !f) return "skip";
  // a video is heard through its soundtrack
  const sound = f.kind === "video" ? f.sound : f.name;
  const size = f.kind === "video" ? (f.soundSize ?? 0) : f.size;
  if (!sound) return "skip";
  if (size > MAX_AUDIO) throw new Error("too long to transcribe");
  const bytes = await store.readFile(m.id, sound);
  if (!bytes) return "skip";
  const res = await runAi<{ text?: string }>("speech", MODELS.speech, { audio: base64(bytes) });
  if (!res) return false;
  const text = (res.text ?? "").trim();
  if (text) await saveText(j, "transcript", text, MODELS.speech);
  return true;
}

/* ---------- facts ---------- */

type Raw = { statement_he?: string; statement_ru?: string; category?: string; year?: number | null; place?: string | null; quote?: string };

/** everything written about one memory: the words, what the family added, letters and recordings */
async function corpus(m: StoredMemory) {
  const parts: { kind: FactSource["kind"]; file?: string; text: string }[] = [];
  const head = [m.title, m.body].filter(Boolean).join("\n");
  if (head.trim()) parts.push({ kind: "memory", text: head });
  for (const f of m.files)
    for (const n of f.notes ?? []) {
      const t = [n.what, n.place && `מקום: ${n.place}`, n.when && `מתי: ${n.when}`, n.who && `מי: ${n.who}`].filter(Boolean).join(". ");
      if (t) parts.push({ kind: "note", file: f.name, text: t });
    }
  for (const t of await textStore.list("approved")) if (t.memoryId === m.id && t.source !== "translation" && t.source !== "about") parts.push({ kind: t.source, file: t.file, text: t.text });
  return parts;
}

/** What one page or memory is and tells: shown beside it as "what we learned here". */
export type About = {
  kind?: string;
  to?: string | null;
  date?: string | null;
  place?: string | null;
  summary_he?: string;
  summary_ru?: string;
  people?: string[];
  places?: string[];
};

/**
 * Is the quote really in the text? Models shorten quotes ("Smolensk ... 1963") or join lines with
 * " / ": each piece must be there. Otherwise nearly all its words must be, so a stray letter does
 * not throw away a good fact.
 */
function grounded(quote: string, text: string) {
  const t = norm(text);
  const pieces = quote.split(/\.\.\.|…|\s\/\s|\n/).map(norm).filter((x) => x.length >= 3);
  if (pieces.length && pieces.every((x) => t.includes(x))) return true;
  const words = norm(quote).split(" ").filter((w) => w.length > 1);
  if (words.length < 3) return false;
  const have = new Set(t.split(" "));
  return words.filter((w) => have.has(w)).length / words.length >= 0.85;
}

/** find facts in one memory; each must come with words that really appear in it */
export async function findFacts(memoryId: string): Promise<boolean | "skip"> {
  const m = await store.get(memoryId);
  if (!m || m.status === "rejected") return "skip";
  const parts = await corpus(m);
  // a few words (a caption, a title) are too little to learn facts from
  if (parts.reduce((n, p) => n + p.text.trim().length, 0) < 40) return true;
  const numbered = parts.map((p, i) => `[${i + 1}] (${p.kind})\n${p.text}`).join("\n\n");
  const who = m.author ? `It was shared by ${m.author}${m.relation ? ` (${m.relation})` : ""}.` : "";
  // a photographed letter, poem or greeting is usually Grandpa's own writing
  const page = readsPages(m);
  const answer = await chat(
    "background",
    [
      {
        role: "system",
        content: `You help a family keep a record of the life of their grandfather Lonya (Лёня)${profile.birthYear ? `, born ${profile.birthYear}` : ""}, a musician who played the saxophone and loved writing poems, stories and greetings, mostly in Russian.
${
  page
    ? `The text includes the words of photographed pages (marked "ocr"): a letter, poem or greeting. Unless the text clearly says otherwise, it was WRITTEN BY LONYA HIMSELF: "я" / "I" is Lonya, "папа" or "отец" of the writer is Lonya's father, "дочь" is Lonya's daughter, and so on. A header or signature with a place and date tells where and when Lonya wrote it (a poem signed "Смоленск 1963" means Lonya was in Smolensk in 1963). The words were read from handwriting by a computer and may contain reading mistakes: do not build a fact on a word that looks garbled.`
    : `The text is what family members wrote about him, or shared with a photo or recording.`
}
List the FACTS about Lonya's life that the text states: where and when he was, his family (names, relations, births, deaths, marriages, children, grandchildren), army service, work, music, moves and journeys, his relationships and feelings, habits, what he loved, dates.
Rules:
- Only what the text says (or what follows directly from Lonya having written it). Never add outside knowledge. If unsure, leave it out.
- The statement must not say more than its quote: no "every summer", "always" unless those words are in the text.
- A title or caption of a few words is not a fact by itself; skip it unless the text says what Lonya did.
- Ignore text that is clearly a test or not about the family.
- Each fact must include "quote": a short phrase copied EXACTLY, character for character, from ONE line of the text, that proves it.
- "statement_he": one short sentence in Hebrew, about Lonya in the third person ("לוניה ..."). "statement_ru": the same in Russian.
- "category": one of ${CATEGORIES.join(", ")}.
- "year": a four-digit year only if the text gives it, else null. "place": a place name if the text gives it, else null.
- Up to 15 facts.
Reply with ONLY a JSON object:
{${page ? `"about": {"kind": "poem|letter|greeting|story|recipe|other", "to": "who it is addressed to, or null", "date": "as written, or null", "place": "as written, or null", "summary_he": "2-3 Hebrew sentences: what this is and what it tells", "summary_ru": "the same in Russian", "people": ["each person named or clearly meant, with the relation to Lonya when the text gives it, in Hebrew"], "places": ["each place, in Hebrew"]}, ` : ""}"facts": [{"statement_he": "...", "statement_ru": "...", "category": "...", "year": null, "place": null, "quote": "..."}]}`,
      },
      { role: "user", content: `${who}${m.title ? `\nIts title: ${m.title}` : ""}\n\n${numbered}` },
    ],
    // it reasons over the whole page first; that takes most of the room
    { maxTokens: 12000, temperature: 0.1, model: MODELS.pages }
  );
  if (answer === null) return false;
  const parsed = parseJson<{ about?: About; facts?: Raw[] } | Raw[]>(answer);
  if (!parsed) return true;
  const raw = Array.isArray(parsed) ? parsed : Array.isArray(parsed.facts) ? parsed.facts : [];
  const about = !Array.isArray(parsed) ? parsed.about : undefined;
  if (page && about && typeof about === "object") {
    const str = (v: unknown, n: number) => (typeof v === "string" && v.trim() && v.trim() !== "null" ? v.trim().slice(0, n) : undefined);
    const list = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && !!x.trim()).map((x) => x.trim().slice(0, 120)).slice(0, 20) : undefined);
    const clean: About = { kind: str(about.kind, 20), to: str(about.to, 120), date: str(about.date, 60), place: str(about.place, 120), summary_he: str(about.summary_he, 800), summary_ru: str(about.summary_ru, 800), people: list(about.people), places: list(about.places) };
    if (clean.summary_he || clean.summary_ru) await saveText({ memoryId: m.id }, "about", JSON.stringify(clean), MODELS.pages);
  }

  const existing = await factStore.list();
  for (const r of raw.slice(0, 15)) {
    const statement = typeof r.statement_he === "string" ? r.statement_he.trim().slice(0, 300) : "";
    const quote = typeof r.quote === "string" ? r.quote.trim().slice(0, 400) : "";
    if (!statement || quote.length < 4) continue;
    // the quote has to be in the text; otherwise the fact is not grounded and is dropped
    const from = parts.find((p) => grounded(quote, p.text));
    if (!from) continue;
    const source: FactSource = { memoryId: m.id, file: from.file, kind: from.kind, quote };
    const year = Number(r.year);
    const fact = {
      statement,
      statementRu: typeof r.statement_ru === "string" ? r.statement_ru.trim().slice(0, 300) : undefined,
      category: CATEGORIES.includes(r.category as StoredFact["category"]) ? (r.category as StoredFact["category"]) : "other",
      year: Number.isInteger(year) && year > 1850 && year <= new Date().getFullYear() ? year : undefined,
      place: typeof r.place === "string" && r.place.trim() && r.place.trim() !== "null" ? r.place.trim().slice(0, 80) : undefined,
    };
    // the same fact found again only gains a source
    const same = existing.find((e) => e.status !== "rejected" && norm(e.statement) === norm(statement));
    if (same) {
      if (!same.sources.some((s) => s.memoryId === m.id && norm(s.quote ?? "") === norm(quote))) await factStore.update(same.id, (cur) => ({ ...cur, sources: [...cur.sources, source] }));
      continue;
    }
    const made = await factStore.create({ ...fact, sources: [source], by: "ai" }, [], "pending");
    existing.push(made);
  }
  return true;
}

/** the facts of one decade (verified first), for the life story */
export async function factsOfDecade(decade: number, include: ("approved" | "pending")[] = ["approved"]) {
  return (await factStore.list()).filter((f) => include.includes(f.status as "approved" | "pending") && f.year && Math.floor(f.year / 10) * 10 === decade).sort((a, b) => (a.year ?? 0) - (b.year ?? 0));
}

export async function queueState() {
  const all = await jobStore.list();
  return {
    waiting: all.filter((j) => j.status === "pending").length,
    failed: all.filter((j) => j.status === "rejected").map((j) => ({ id: j.id, type: j.type, memoryId: j.memoryId, error: j.error })),
    budget: { background: await budgetLeft("background"), speech: await budgetLeft("speech"), embed: await budgetLeft("embed") },
  };
}
