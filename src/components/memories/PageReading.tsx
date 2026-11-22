"use client";

import { useEffect, useRef, useState } from "react";
import { FileText, Lightbulb } from "lucide-react";
import { useLang } from "@/lib/i18n";
import { cn } from "../ui";

/*
  The words on a photographed page (a letter, a poem, a greeting): as written, and in Hebrew, each
  marked as the computer's reading or as checked by the family. Underneath, a small button shows
  what was learned about Lonya from this memory. Fetched only when opened.
*/

type Page = { file: string; src: string; original?: string; originalChecked: boolean; he?: string; heChecked: boolean };
type Fact = { id: string; he: string; ru?: string; year?: number; place?: string; verified: boolean };
type About = { kind?: string; to?: string; date?: string; place?: string; summary_he?: string; summary_ru?: string; people?: string[]; places?: string[]; notes_he?: string[]; notes_ru?: string[] };
type Reading = { pages: Page[]; facts: Fact[]; about?: About; waiting: boolean };

export default function PageReading({ memoryId, className }: { memoryId: string; className?: string }) {
  const { t, lang } = useLang();
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<Reading | null>(null);
  const [failed, setFailed] = useState(false);
  const [page, setPage] = useState(0);
  const [view, setView] = useState<"he" | "original">(lang === "ru" ? "original" : "he");
  const [learned, setLearned] = useState(false);
  const [working, setWorking] = useState(false);

  // fetched once, the first time it is opened; the work goes on even if it is closed again meanwhile
  const started = useRef(false);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  useEffect(() => {
    if (!open || started.current) return;
    started.current = true;
    const get = (method: "GET" | "POST") => fetch(`/api/memories/${memoryId}/reading`, { method }).then((r) => (r.ok ? (r.json() as Promise<Reading>) : Promise.reject()));
    (async () => {
      let cur: Reading | null = await get("GET").catch(() => null);
      if (!cur) return alive.current && setFailed(true);
      if (alive.current) setData(cur);
      // still being read or translated: it is done now, in rounds; what is ready shows as it comes
      for (let round = 0; cur?.waiting && round < 8 && alive.current; round++) {
        setWorking(true);
        cur = await get("POST").catch(() => null);
        if (alive.current && cur) setData(cur);
      }
      if (alive.current) setWorking(false);
    })();
  }, [open, memoryId]);

  const p = data?.pages[Math.min(page, (data?.pages.length ?? 1) - 1)];
  const shown = p ? (view === "he" ? p.he : p.original) : undefined;
  const checked = p ? (view === "he" ? p.heChecked : p.originalChecked) : false;
  const tab = (on: boolean) => cn("min-h-9 rounded-full px-3.5 text-[0.88rem] transition-colors", on ? "bg-burgundy text-white" : "text-burgundy hover:bg-white/80");

  return (
    <div className={cn("rounded-[12px] bg-blush/25 px-4 py-3", className)}>
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="flex min-h-9 w-full items-center gap-2 text-start text-[0.92rem] text-burgundy">
        <FileText className="h-4 w-4" strokeWidth={1.5} aria-hidden />
        {t.memories.pageText}
        <span aria-hidden className={cn("ms-auto transition-transform", open && "rotate-180")}>⌄</span>
      </button>

      {open && (
        <div className="mt-3 flex flex-col gap-3">
          {!data && !failed && <p className="text-[0.9rem] text-ink-soft">…</p>}
          {failed && <p className="text-[0.9rem] text-ink-soft">{t.memories.pageEmpty}</p>}
          {working && <p className="animate-pulse text-[0.9rem] text-burgundy">{t.memories.pageWorking}</p>}
          {data && !data.pages.length && !working && <p className="text-[0.9rem] text-ink-soft">{data.waiting ? t.memories.pageWaiting : t.memories.pageEmpty}</p>}

          {p && (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <span role="tablist" className="inline-flex gap-1 rounded-full bg-white/60 p-1 ring-1 ring-line">
                  <button type="button" role="tab" aria-selected={view === "he"} onClick={() => setView("he")} className={tab(view === "he")}>
                    {t.memories.pageHebrew}
                  </button>
                  <button type="button" role="tab" aria-selected={view === "original"} onClick={() => setView("original")} className={tab(view === "original")}>
                    {t.memories.pageOriginal}
                  </button>
                </span>
                {data!.pages.length > 1 && (
                  <span className="inline-flex flex-wrap gap-1">
                    {data!.pages.map((x, i) => (
                      <button key={x.file} type="button" onClick={() => setPage(i)} aria-pressed={i === page} className={tab(i === page)}>
                        {t.memories.pageN(i + 1)}
                      </button>
                    ))}
                  </span>
                )}
              </div>
              {shown ? (
                <p dir="auto" lang={view === "he" ? "he" : undefined} className="whitespace-pre-line rounded-[10px] bg-white/75 p-4 text-[1rem] leading-[1.9] text-charcoal/90 ring-1 ring-charcoal/5">
                  {shown}
                </p>
              ) : (
                <p className="text-[0.9rem] text-ink-soft">{view === "he" ? t.memories.pageNoHebrew : t.memories.pageEmpty}</p>
              )}
              {shown && <p className="text-[0.78rem] text-ink-soft">{checked ? t.memories.pageChecked : view === "he" ? t.memories.pageMachineHe : t.memories.pageMachineRead}</p>}
            </>
          )}

          {data && (
            <div>
              <button type="button" onClick={() => setLearned(!learned)} aria-expanded={learned} className="inline-flex min-h-9 items-center gap-1.5 rounded-full px-1 text-[0.85rem] text-sage-deep underline decoration-dusty/40 underline-offset-4 hover:text-burgundy">
                <Lightbulb className="h-3.5 w-3.5" strokeWidth={1.6} aria-hidden />
                {t.memories.learned(data.facts.length)}
              </button>
              {learned && (
                <div className="mt-2 rounded-[10px] bg-white/70 p-3 ring-1 ring-charcoal/5">
                  {data.about && (data.about.summary_he || data.about.summary_ru) && (
                    <div className="mb-3 flex flex-col gap-1.5 border-b border-line pb-3 text-[0.92rem] leading-relaxed">
                      <span className="text-[0.78rem] tracking-wide text-rose">{t.memories.aboutPage}</span>
                      <p dir="auto">{(lang === "ru" ? data.about.summary_ru : data.about.summary_he) || data.about.summary_he || data.about.summary_ru}</p>
                      {[
                        [t.memories.aboutTo, data.about.to],
                        [t.memories.aboutWhen, data.about.date],
                        [t.memories.aboutWhere, data.about.place],
                        [t.memories.aboutPeople, data.about.people?.join(", ")],
                        [t.memories.aboutPlaces, data.about.places?.join(", ")],
                      ]
                        .filter(([, v]) => v)
                        .map(([k, v]) => (
                          <p key={k} className="text-[0.88rem] text-charcoal/85">
                            <span className="text-ink-soft">{k}: </span>
                            <span dir="auto">{v}</span>
                          </p>
                        ))}
                      {(() => {
                        const notes = (lang === "ru" ? data.about.notes_ru : data.about.notes_he) ?? data.about.notes_he;
                        return notes?.length ? (
                          <div className="mt-1">
                            <span className="text-[0.82rem] text-ink-soft">{t.memories.aboutNotes}:</span>
                            <ul className="mt-1 list-disc ps-5 text-[0.88rem] text-charcoal/85">
                              {notes.map((n) => (
                                <li key={n} dir="auto">
                                  {n}
                                </li>
                              ))}
                            </ul>
                          </div>
                        ) : null;
                      })()}
                    </div>
                  )}
                  {data.facts.length ? (
                    <ul className="flex flex-col gap-2 text-[0.92rem] leading-relaxed">
                      {data.facts.map((f) => (
                        <li key={f.id} className="flex flex-col">
                          <span dir="auto">
                            {(lang === "ru" && f.ru) || f.he}
                            {f.year ? ` · ${f.year}` : ""}
                            {f.place ? ` · ${f.place}` : ""}
                          </span>
                          {!f.verified && <span className="text-[0.75rem] text-ink-soft">{t.memories.learnedSuggestion}</span>}
                        </li>
                      ))}
                    </ul>
                  ) : data.about ? null : (
                    <p className="text-[0.9rem] text-ink-soft">{data.waiting ? t.memories.pageWaiting : t.memories.learnedNone}</p>
                  )}
                  <p className="mt-2 text-[0.75rem] text-ink-soft">{t.memories.learnedNote}</p>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
