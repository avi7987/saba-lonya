"use client";

import { motion } from "motion/react";
import { useEffect, useState } from "react";
import { BookOpen, Feather } from "lucide-react";
import type { Memory } from "@/content/types";
import { useLang } from "@/lib/i18n";
import { ease } from "@/lib/motion";
import { STATIC, TLink } from "../Transition";
import { Container, buttonClass, cn } from "../ui";
import BookReader, { type BookEntry } from "./BookReader";

/** Grandpa's own writing (poems, letters, greetings) as one book anyone can leaf through. */
export default function WritingsView() {
  const { t } = useLang();
  const b = t.book.page;
  const [entries, setEntries] = useState<(BookEntry & { createdAt: string; photo?: string })[] | null>(null);
  const [open, setOpen] = useState<number | null>(null);

  useEffect(() => {
    if (STATIC) return setEntries([]);
    fetch("/api/memories")
      .then((r) => (r.ok ? r.json() : { memories: [] }))
      .then((d: { memories: Memory[] }) =>
        setEntries(
          (d.memories ?? [])
            .filter((m) => m.hasPages)
            // oldest written first would need dates we do not always have: the order they were shared, oldest first
            .sort((x, y) => x.createdAt.localeCompare(y.createdAt))
            .map((m) => ({ memoryId: m.id, title: m.title, author: m.author, createdAt: m.createdAt, photo: m.photoSrc }))
        )
      )
      .catch(() => setEntries([]));
  }, []);

  return (
    <main id="content" className="pb-24 pt-28 sm:pt-32">
      <Container className="flex flex-col items-center gap-10">
        {/* the book's cover, closed, waiting to be opened */}
        <div className="flex flex-col items-center gap-6 text-center">
          <span className="inline-flex items-center gap-2 text-[0.85rem] tracking-wide text-rose">
            <Feather className="h-4 w-4" aria-hidden />
            {b.eyebrow}
          </span>
          <h1 className="font-display text-[clamp(2.2rem,5vw,3.6rem)] font-light leading-tight text-burgundy">{b.title}</h1>
          <p className="max-w-2xl text-lg leading-relaxed text-ink-soft">{b.lead}</p>
        </div>

        <motion.button
          type="button"
          onClick={() => entries?.length && setOpen(0)}
          disabled={!entries?.length}
          initial={{ opacity: 0, y: 20, rotate: -1.5 }}
          animate={{ opacity: 1, y: 0, rotate: -1.5 }}
          whileHover={{ rotate: 0, y: -6 }}
          transition={{ duration: 0.9, ease }}
          aria-label={t.book.page.openBook}
          className="group relative h-[22rem] w-[16rem] rounded-e-[14px] rounded-s-[5px] bg-[#1f2d4a] text-start text-[#f5f0e6] shadow-[0_24px_50px_-18px_rgba(20,25,40,0.7),inset_10px_0_14px_-8px_rgba(0,0,0,0.5)] disabled:cursor-default sm:h-[26rem] sm:w-[19rem]"
        >
          {/* pages peeking out at the edge */}
          <span aria-hidden className="absolute inset-y-2 -end-1.5 w-2 rounded-e-[6px] bg-[repeating-linear-gradient(180deg,#fbf6ea_0_2px,#e8dcc4_2px_3px)]" />
          <span className="absolute inset-0 flex flex-col items-center justify-center gap-5 px-8 text-center">
            <span className="h-px w-16 bg-[#d8b878]/70" />
            <span className="font-display text-[1.65rem] leading-snug sm:text-[1.9rem]">{t.book.coverTitle}</span>
            <span className="h-px w-16 bg-[#d8b878]/70" />
            <span className="font-hand text-lg text-[#d8b878]">{t.book.coverBy}</span>
          </span>
          {!!entries?.length && (
            <span className="absolute inset-x-0 -bottom-5 mx-auto flex w-fit items-center gap-2 rounded-full bg-rose px-5 py-2.5 text-[0.95rem] text-white shadow-lg transition-transform group-hover:scale-105">
              <BookOpen className="h-4 w-4" aria-hidden />
              {b.openBook}
            </span>
          )}
        </motion.button>

        {entries && !entries.length && (
          <div className="flex max-w-md flex-col items-center gap-4 text-center">
            <p className="text-ink-soft">{b.empty}</p>
            <TLink href="/share" className={buttonClass.secondary}>
              {b.add}
            </TLink>
          </div>
        )}

        {/* contents: each opens the book on its own pages */}
        {!!entries?.length && (
          <section className="mt-6 w-full max-w-2xl">
            <h2 className="mb-4 text-center font-display text-2xl text-burgundy">{t.book.contents}</h2>
            <ol className="flex flex-col divide-y divide-line rounded-[14px] border border-line bg-paper">
              {entries.map((e, i) => (
                <li key={e.memoryId}>
                  <button type="button" onClick={() => setOpen(i)} className="flex w-full items-center gap-4 px-5 py-4 text-start transition-colors hover:bg-blush/30">
                    {e.photo && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={e.photo} alt="" className="h-14 w-11 shrink-0 rounded-[3px] object-cover shadow-[0_1px_4px_rgba(40,30,10,0.25)]" />
                    )}
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate font-display text-[1.2rem] text-burgundy" dir="auto">
                        {e.title || t.book.untitled}
                      </span>
                      {e.author && <span className="text-[0.85rem] text-ink-soft">{t.book.sharedBy(e.author)}</span>}
                    </span>
                    <BookOpen className={cn("h-5 w-5 shrink-0 text-rose")} aria-hidden />
                  </button>
                </li>
              ))}
            </ol>
          </section>
        )}
      </Container>

      {open !== null && entries && <BookReader entries={entries} start={open} withCover onClose={() => setOpen(null)} />}
    </main>
  );
}
