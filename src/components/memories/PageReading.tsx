"use client";

import { useEffect, useState } from "react";
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
type Reading = { pages: Page[]; facts: Fact[]; waiting: boolean };

export default function PageReading({ memoryId, className }: { memoryId: string; className?: string }) {
  const { t, lang } = useLang();
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<Reading | null>(null);
  const [failed, setFailed] = useState(false);
  const [page, setPage] = useState(0);
  const [view, setView] = useState<"he" | "original">(lang === "ru" ? "original" : "he");
  const [learned, setLearned] = useState(false);
  const [working, setWorking] = useState(false);

  useEffect(() => {
    if (!open || data) return;
    let live = true;
    const get = (method: "GET" | "POST") => fetch(`/api/memories/${memoryId}/reading`, { method }).then((r) => (r.ok ? (r.json() as Promise<Reading>) : Promise.reject()));
    get("GET")
      .then(async (d) => {
        if (!live) return;
        setData(d);
        // still being read or translated: it is done now, while the page is open
        if (d.waiting) {
          setWorking(true);
          const done = await get("POST").catch(() => null);
          if (!live) return;
          setWorking(false);
          if (done) setData(done);
        }
      })
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, [open, data, memoryId]);

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
                  ) : (
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
