"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight, Music2, X } from "lucide-react";
import { useLang } from "@/lib/i18n";
import { useBackClose } from "@/lib/useBackClose";
import Portal from "../Portal";
import { Note } from "../Botanical";
import { cn } from "../ui";

/*
  Grandpa's pages as a book. Each piece of writing opens with its own title page and a page about
  it (who it was written to, when, notes for a Hebrew reader); then every photographed page is laid
  beside its words: the page itself on the right, its translation (or the original words) on the
  left, the way a Hebrew book opens. A big screen shows two pages at once; a phone shows one.
  Pages turn like paper: the page lifts at its edge and folds over the spine. Arrows, the keyboard
  (left = on, right = back) and a swipe all turn; "back" on a phone closes the book.
*/

type Page = { file: string; src: string; full?: string; original?: string; originalCareful?: boolean; originalChecked?: boolean; he?: string; heCareful?: boolean; heChecked?: boolean };
type About = { kind?: string; to?: string; date?: string; place?: string; summary_he?: string; summary_ru?: string; people?: string[]; places?: string[]; notes_he?: string[]; notes_ru?: string[] };
type Reading = { pages: Page[]; about?: About; waiting: boolean };
export type BookEntry = { memoryId: string; title?: string; author?: string };

type Leaf =
  | { kind: "cover" }
  | { kind: "contents" }
  | { kind: "title"; e: number }
  | { kind: "about"; e: number }
  | { kind: "scan"; e: number; p: number }
  | { kind: "text"; e: number; p: number }
  | { kind: "blank" };


export default function BookReader({ entries, start = 0, withCover = false, onClose }: { entries: BookEntry[]; start?: number; withCover?: boolean; onClose: () => void }) {
  const { t, lang } = useLang();
  const b = t.book;
  const reduce = useReducedMotion();
  useBackClose(true, onClose);

  // everything each piece of writing has: its pages, their words, what it is
  const [data, setData] = useState<Record<string, Reading | null>>({});
  useEffect(() => {
    let live = true;
    for (const e of entries)
      fetch(`/api/memories/${e.memoryId}/reading`)
        .then((r) => (r.ok ? (r.json() as Promise<Reading>) : null))
        .catch(() => null)
        .then((d) => live && setData((cur) => ({ ...cur, [e.memoryId]: d })));
    return () => {
      live = false;
    };
  }, [entries]);

  const [view, setView] = useState<"he" | "original">(lang === "ru" ? "original" : "he");

  // the book, leaf by leaf (always an even number per piece, so pages pair into spreads)
  const { leaves, startOf } = useMemo(() => {
    const out: Leaf[] = withCover ? [{ kind: "cover" }, { kind: "contents" }] : [];
    const starts: number[] = [];
    entries.forEach((e, ei) => {
      starts.push(out.length);
      out.push({ kind: "title", e: ei }, { kind: "about", e: ei });
      const pages = data[e.memoryId]?.pages ?? [];
      pages.forEach((_, pi) => out.push({ kind: "scan", e: ei, p: pi }, { kind: "text", e: ei, p: pi }));
    });
    return { leaves: out, startOf: starts };
  }, [entries, data, withCover]);

  // two pages side by side on a wide screen, one on a phone
  const [wide, setWide] = useState(false);
  useEffect(() => {
    const m = window.matchMedia("(min-width: 1024px)");
    const on = () => setWide(m.matches);
    on();
    m.addEventListener("change", on);
    return () => m.removeEventListener("change", on);
  }, []);
  const step = wide ? 2 : 1;

  // opens on the cover, or (from the contents of the writings page) on one piece, once every piece is in
  const [at, setAt] = useState(0);
  const target = useRef(withCover && start > 0 ? start : -1);
  const loaded = entries.every((e) => e.memoryId in data);
  useEffect(() => {
    if (target.current < 0 || !loaded) return;
    const leaf = startOf[target.current] ?? 0;
    target.current = -1;
    setAt(leaf);
  }, [loaded, startOf]);
  const here = wide ? at - (at % 2) : at;

  // a page turning: which way, and where it lands
  const [turn, setTurn] = useState<{ dir: 1 | -1; to: number } | null>(null);
  const go = useCallback(
    (dir: 1 | -1) => {
      if (turn) return;
      const to = here + dir * step;
      if (to < 0 || to >= leaves.length) return;
      if (reduce) return setAt(to);
      setTurn({ dir, to });
    },
    [turn, here, step, leaves.length, reduce]
  );
  const jump = (leaf: number) => setAt(wide ? leaf - (leaf % 2) : leaf);

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") go(1);
      else if (e.key === "ArrowRight") go(-1);
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [go]);

  // a swipe turns the page: to the right goes on (a Hebrew book turns that way), to the left goes back
  const touch = useRef<{ x: number; y: number } | null>(null);
  const [zoom, setZoom] = useState<string | null>(null);

  const entryOf = (leaf: Leaf) => ("e" in leaf ? entries[leaf.e] : undefined);
  const readingOf = (leaf: Leaf) => {
    const e = entryOf(leaf);
    return e ? data[e.memoryId] : undefined;
  };

  /* ---------- one page ---------- */
  const paper = (side: "right" | "left" | "single", children: ReactNode, n?: number) => (
    <div
      className={cn(
        "relative flex h-full w-full flex-col overflow-hidden bg-[#fbf6ea] text-charcoal",
        side === "right" && "rounded-s-[4px] rounded-e-[10px] shadow-[inset_14px_0_22px_-14px_rgba(60,40,10,0.35)]",
        side === "left" && "rounded-e-[4px] rounded-s-[10px] shadow-[inset_-14px_0_22px_-14px_rgba(60,40,10,0.35)]",
        side === "single" && "rounded-[10px] shadow-[inset_-10px_0_18px_-12px_rgba(60,40,10,0.3)]"
      )}
      style={{ backgroundImage: "radial-gradient(ellipse at 50% 0%, rgba(255,255,255,0.55), transparent 60%), linear-gradient(180deg, rgba(140,106,40,0.04), rgba(140,106,40,0.08))" }}
    >
      {children}
      {n !== undefined && <span className="pointer-events-none absolute inset-x-0 bottom-3 text-center font-display text-[0.85rem] text-ink-soft/70">{n + 1}</span>}
    </div>
  );

  const content = (i: number, side: "right" | "left" | "single") => {
    const leaf = leaves[i];
    if (!leaf) return paper(side, null);
    const e = entryOf(leaf);
    const r = readingOf(leaf);
    switch (leaf.kind) {
      case "cover":
        return paper(
          side,
          <div className="flex h-full flex-col items-center justify-center gap-6 bg-[#1f2d4a] px-10 text-center text-[#f5f0e6]">
            <Music2 className="h-14 w-14 text-[#d8b878]" strokeWidth={1.2} aria-hidden />
            <span className="font-display text-[clamp(1.9rem,3.4vw,2.8rem)] leading-tight">{b.coverTitle}</span>
            <span className="max-w-xs text-[1rem] leading-relaxed text-[#e8dcc4]/85">{b.coverLead}</span>
            <span className="mt-6 h-px w-24 bg-[#d8b878]/60" />
            <span className="font-hand text-xl text-[#d8b878]">{b.coverBy}</span>
          </div>
        );
      case "contents":
        return paper(
          side,
          <div className="flex h-full flex-col px-8 py-10 sm:px-12">
            <h2 className="mb-6 text-center font-display text-3xl text-burgundy">{b.contents}</h2>
            <ol className="flex flex-col gap-3 overflow-auto">
              {entries.map((x, ei) => (
                <li key={x.memoryId}>
                  <button type="button" onClick={() => jump(startOf[ei])} className="flex w-full items-baseline gap-3 text-start hover:text-burgundy">
                    <span className="font-display text-[1.15rem]" dir="auto">
                      {x.title || b.untitled}
                    </span>
                    <span className="flex-1 border-b border-dotted border-charcoal/25" />
                    <span className="font-display text-ink-soft">{startOf[ei] + 1}</span>
                  </button>
                </li>
              ))}
            </ol>
          </div>,
          i
        );
      case "title":
        return paper(
          side,
          <div className="flex h-full flex-col items-center justify-center gap-5 px-10 text-center">
            <Note className="h-12 w-8" still />
            <h2 className="font-display text-[clamp(1.8rem,3vw,2.6rem)] leading-tight text-burgundy" dir="auto">
              {e?.title || b.untitled}
            </h2>
            {(r?.about?.date || r?.about?.place) && <p className="font-display text-lg text-ink-soft" dir="auto">{[r.about.place, r.about.date].filter(Boolean).join(" · ")}</p>}
            {r?.about?.to && (
              <p className="text-[1rem] text-ink-soft" dir="auto">
                {b.to}: {r.about.to}
              </p>
            )}
            {e?.author && <p className="mt-8 font-hand text-lg text-[#8a6420]">{b.sharedBy(e.author)}</p>}
          </div>,
          i
        );
      case "about": {
        const a = r?.about;
        const summary = (lang === "ru" ? a?.summary_ru : a?.summary_he) || a?.summary_he || a?.summary_ru;
        const notes = (lang === "ru" ? a?.notes_ru : a?.notes_he) ?? a?.notes_he;
        return paper(
          side,
          <div className="flex h-full flex-col gap-4 overflow-auto px-8 pb-14 pt-10 sm:px-12" dir={lang === "ru" ? "ltr" : "rtl"}>
            {r === undefined ? (
              <p className="text-ink-soft">{b.loading}</p>
            ) : !a ? (
              <p className="text-ink-soft">{r?.waiting ? b.waiting : b.noAbout}</p>
            ) : (
              <>
                <span className="text-[0.8rem] tracking-wide text-rose">{b.aboutTitle}</span>
                {summary && <p className="font-display text-[1.25rem] leading-relaxed">{summary}</p>}
                {!!a.people?.length && (
                  <p className="text-[0.95rem]">
                    <span className="text-ink-soft">{t.memories.aboutPeople}: </span>
                    {a.people.join(", ")}
                  </p>
                )}
                {!!a.places?.length && (
                  <p className="text-[0.95rem]">
                    <span className="text-ink-soft">{t.memories.aboutPlaces}: </span>
                    {a.places.join(", ")}
                  </p>
                )}
                {!!notes?.length && (
                  <div className="mt-2 border-t border-[#e0d6c3] pt-4">
                    <span className="text-[0.85rem] text-ink-soft">{t.memories.aboutNotes}</span>
                    <ul className="mt-2 flex list-disc flex-col gap-1.5 ps-5 text-[0.92rem] leading-relaxed">
                      {notes.map((x) => (
                        <li key={x}>{x}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </>
            )}
          </div>,
          i
        );
      }
      case "scan": {
        const p = r?.pages[leaf.p];
        return paper(
          side,
          <button type="button" onClick={() => p && setZoom(p.full ?? p.src)} aria-label={b.zoom} className="flex h-full w-full cursor-zoom-in items-center justify-center p-5 sm:p-7">
            {p && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={p.full ?? p.src} alt={b.scanAlt(leaf.p + 1)} className="max-h-full max-w-full rounded-[3px] object-contain shadow-[0_2px_10px_rgba(40,30,10,0.25)]" />
            )}
          </button>,
          i
        );
      }
      case "text": {
        const p = r?.pages[leaf.p];
        const words = view === "he" ? p?.he : p?.original;
        const careful = view === "he" ? p?.heCareful || p?.heChecked : p?.originalCareful || p?.originalChecked;
        return paper(
          side,
          <div className="flex h-full flex-col px-7 pb-12 pt-8 sm:px-11">
            <div className="mb-3 flex items-baseline justify-between gap-3 border-b border-[#e0d6c3] pb-2 text-[0.82rem] text-ink-soft">
              <span className="truncate font-display text-[0.95rem] text-burgundy" dir="auto">
                {e?.title}
              </span>
              <span className="shrink-0">{b.pageOf(leaf.p + 1, r?.pages.length ?? 1)}</span>
            </div>
            {words ? (
              <p dir={view === "he" ? "rtl" : "auto"} className={cn("flex-1 overflow-auto whitespace-pre-line font-display text-charcoal/90", words.length > 900 ? "text-[1.02rem] leading-[1.75]" : "text-[1.15rem] leading-[1.9]")}>
                {words}
              </p>
            ) : (
              <p className="flex-1 text-ink-soft">{view === "he" ? b.noHebrew : b.noWords}</p>
            )}
            {words && <p className="mt-2 text-[0.72rem] text-ink-soft/80">{careful ? b.careful : b.machine}</p>}
          </div>,
          i
        );
      }
      default:
        return paper(side, null);
    }
  };

  /* ---------- the open book ---------- */
  // room for the bar above and the arrows below
  const pageH = wide ? "min(calc(100vh - 160px), 860px)" : "min(calc(100vh - 170px), 760px)";
  const pageW = wide ? `calc(${pageH} * 0.7)` : `min(calc(100vw - 32px), calc(${pageH} * 0.72))`;
  const spring = { duration: 0.85, ease: [0.45, 0.05, 0.25, 1] as const };

  // during a turn the base shows what the moving page uncovers; the moving page carries the old face and the new one
  const base = (() => {
    if (!turn) return wide ? { right: here, left: here + 1 } : { one: here };
    if (wide) return turn.dir === 1 ? { right: here, left: turn.to + 1 } : { right: turn.to, left: here + 1 };
    return { one: turn.dir === 1 ? turn.to : here };
  })();

  const leaf = (() => {
    if (!turn) return null;
    if (wide)
      return turn.dir === 1
        ? { side: "left" as const, front: here + 1, back: turn.to, from: 0, to: 180, origin: "right center" }
        : { side: "right" as const, front: here, back: turn.to + 1, from: 0, to: -180, origin: "left center" };
    return turn.dir === 1 ? { side: "single" as const, front: here, back: -1, from: 0, to: 180, origin: "right center" } : { side: "single" as const, front: turn.to, back: -1, from: 180, to: 0, origin: "right center" };
  })();

  const last = leaves.length - 1;
  const canNext = here + step <= last;
  const canPrev = here > 0;

  return (
    <Portal>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        role="dialog"
        aria-modal="true"
        aria-label={b.label}
        className="fixed inset-0 z-[120] flex flex-col items-center justify-center bg-[#161b26] px-4 pb-4 pt-16"
        style={{ backgroundImage: "radial-gradient(ellipse at 50% 40%, rgba(80,70,50,0.35), transparent 70%)" }}
        onTouchStart={(e) => (touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY })}
        onTouchEnd={(e) => {
          const s = touch.current;
          touch.current = null;
          if (!s || zoom) return;
          const dx = e.changedTouches[0].clientX - s.x;
          const dy = e.changedTouches[0].clientY - s.y;
          if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.4) go(dx > 0 ? 1 : -1);
        }}
      >
        {/* top bar: which words to read, and close */}
        <div className="absolute inset-x-0 top-0 flex items-center justify-between gap-3 px-4 py-3 text-[#f5f0e6] sm:px-6">
          <span role="tablist" className="inline-flex gap-1 rounded-full bg-white/10 p-1">
            {(["he", "original"] as const).map((v) => (
              <button key={v} type="button" role="tab" aria-selected={view === v} onClick={() => setView(v)} className={cn("min-h-9 rounded-full px-4 text-[0.9rem] transition-colors", view === v ? "bg-[#f5f0e6] text-[#1f2d4a]" : "text-[#f5f0e6]/85 hover:bg-white/10")}>
                {v === "he" ? t.memories.pageHebrew : t.memories.pageOriginal}
              </button>
            ))}
          </span>
          <button type="button" onClick={onClose} aria-label={t.nav.close} className="flex h-11 w-11 items-center justify-center rounded-full bg-white/10 hover:bg-white/20">
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>

        {/* the book */}
        <div className="relative flex" dir="ltr" style={{ height: pageH, perspective: "2400px" }}>
          {wide ? (
            <>
              <div style={{ width: pageW }} className="h-full">
                {content(base.left!, "left")}
              </div>
              <div style={{ width: pageW }} className="h-full">
                {content(base.right!, "right")}
              </div>
              {/* the spine */}
              <span aria-hidden className="pointer-events-none absolute inset-y-0 left-1/2 w-10 -translate-x-1/2 bg-[linear-gradient(90deg,transparent,rgba(60,40,10,0.18),transparent)]" />
            </>
          ) : (
            <div style={{ width: pageW }} className="h-full">
              {content(base.one!, "single")}
            </div>
          )}

          {/* the page turning */}
          <AnimatePresence>
            {leaf && turn && (
              <motion.div
                key={`${here}-${turn.to}`}
                className="absolute inset-y-0"
                style={{
                  width: pageW,
                  left: wide ? (leaf.side === "left" ? 0 : pageW) : 0,
                  transformOrigin: leaf.origin,
                  transformStyle: "preserve-3d",
                  zIndex: 5,
                }}
                initial={{ rotateY: leaf.from }}
                animate={{ rotateY: leaf.to }}
                transition={spring}
                onAnimationComplete={() => {
                  setAt(turn.to);
                  setTurn(null);
                }}
              >
                <div className="absolute inset-0" style={{ backfaceVisibility: "hidden" }}>
                  {content(leaf.front, leaf.side === "single" ? "single" : leaf.side)}
                  {/* light across the lifting paper */}
                  <motion.span aria-hidden className="pointer-events-none absolute inset-0 rounded-[10px] bg-[linear-gradient(90deg,rgba(0,0,0,0.18),transparent_60%)]" initial={{ opacity: 0 }} animate={{ opacity: [0, 1, 0] }} transition={spring} />
                </div>
                <div className="absolute inset-0" style={{ backfaceVisibility: "hidden", transform: "rotateY(180deg)" }}>
                  {leaf.back >= 0 ? content(leaf.back, leaf.side === "left" ? "right" : "left") : paper("single", null)}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* turning by hand: on is to the left, back is to the right, as in a Hebrew book */}
        <div className="mt-4 flex items-center gap-6 text-[#f5f0e6]">
          <button type="button" onClick={() => go(-1)} disabled={!canPrev} aria-label={b.prev} className="flex h-12 w-12 items-center justify-center rounded-full bg-white/10 hover:bg-white/20 disabled:opacity-25">
            <ChevronRight className="h-6 w-6" aria-hidden />
          </button>
          <span dir="ltr" className="min-w-[6rem] text-center font-display text-[0.95rem] text-[#f5f0e6]/80">
            {wide ? b.spread(here + 1, Math.min(here + 2, leaves.length), leaves.length) : b.spread(here + 1, here + 1, leaves.length)}
          </span>
          <button type="button" onClick={() => go(1)} disabled={!canNext} aria-label={b.next} className="flex h-12 w-12 items-center justify-center rounded-full bg-white/10 hover:bg-white/20 disabled:opacity-25">
            <ChevronLeft className="h-6 w-6" aria-hidden />
          </button>
        </div>

        {/* a page seen close up */}
        <AnimatePresence>
          {zoom && (
            <motion.button
              type="button"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setZoom(null)}
              aria-label={b.unzoom}
              className="fixed inset-0 z-[90] flex cursor-zoom-out items-center justify-center overflow-auto bg-black/90 p-3"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={zoom} alt="" className="max-h-full max-w-full object-contain" />
            </motion.button>
          )}
        </AnimatePresence>
      </motion.div>
    </Portal>
  );
}
