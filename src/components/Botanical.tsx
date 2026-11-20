"use client";

import { motion, useReducedMotion } from "motion/react";
import { ease } from "@/lib/motion";

/*
  Hand-drawn line work: a saxophone and its notes (Lonya played). The drawings draw themselves in
  slowly the first time they are seen; the notes from the saxophone keep rising, gently, as if it
  were playing. With reduced motion everything simply stands still.
*/

type DrawProps = { className?: string; delay?: number; still?: boolean };

function useDraw(delay = 0, still = false) {
  const reduce = useReducedMotion();
  if (reduce || still) return () => ({});
  return (i: number, len = 2.2) => ({
    initial: { pathLength: 0, opacity: 0 },
    whileInView: { pathLength: 1, opacity: 1 },
    viewport: { once: true, margin: "0px 0px -10% 0px" },
    transition: { pathLength: { duration: len, delay: delay + i * 0.18, ease }, opacity: { duration: 0.3, delay: delay + i * 0.18 } },
  });
}

const ink = { fill: "none", stroke: "currentColor", strokeLinecap: "round" as const, strokeLinejoin: "round" as const, vectorEffect: "non-scaling-stroke" as const };

/** a note head, filled, tilted as written by hand */
const Head = ({ x = 0, y = 0, s = 1 }: { x?: number; y?: number; s?: number }) => (
  <ellipse cx={x} cy={y} rx={5 * s} ry={3.6 * s} transform={`rotate(-25 ${x} ${y})`} fill="var(--color-burgundy)" stroke="none" />
);
/** one eighth note: head, stem and a small flag */
const Eighth = ({ s = 1 }: { s?: number }) => (
  <>
    <Head s={s} />
    <path d={`M${4.4 * s} ${-1.5 * s} V${-24 * s} C${9 * s} ${-20 * s} ${12 * s} ${-16 * s} ${11 * s} ${-10 * s}`} />
  </>
);
/** two eighth notes joined by a beam */
const Pair = ({ s = 1 }: { s?: number }) => (
  <>
    <Head s={s} />
    <Head x={18 * s} y={-6 * s} s={s} />
    <path d={`M${4.4 * s} ${-1.5 * s} V${-24 * s} L${22.4 * s} ${-30 * s} V${-7.5 * s} M${4.4 * s} ${-19 * s} L${22.4 * s} ${-25 * s}`} />
  </>
);

/** An alto saxophone with notes rising from its bell. Used beside the portrait in the opening. */
export function Saxophone({ className, delay = 0, still }: DrawProps) {
  const d = useDraw(delay, still);
  const reduce = useReducedMotion() || still;
  // the notes come out of the bell one after another, rise and fade, over and over, slowly
  const rise = (i: number) =>
    reduce
      ? {}
      : {
          initial: { opacity: 0, y: 26 },
          animate: { opacity: [0, 1, 1, 0], y: [26, 0, -12, -26] },
          transition: { duration: 7, times: [0, 0.25, 0.75, 1], delay: delay + 2.2 + i * 1.6, repeat: Infinity, repeatDelay: 1.4, ease: "easeInOut" as const },
        };
  return (
    <svg viewBox="0 0 200 420" className={className} aria-hidden="true">
      <defs>
        <filter id="wash" x="-20%" y="-20%" width="140%" height="140%">
          <feTurbulence type="fractalNoise" baseFrequency="0.035" numOctaves="2" seed="7" />
          <feDisplacementMap in="SourceGraphic" scale="9" />
          <feGaussianBlur stdDeviation="2.2" />
        </filter>
      </defs>
      {/* a warm wash of brass behind the bell */}
      <motion.ellipse
        cx="148"
        cy="246"
        rx="40"
        ry="32"
        fill="var(--color-dusty)"
        opacity="0.18"
        filter="url(#wash)"
        initial={{ scale: 0.6, opacity: 0 }}
        whileInView={{ scale: 1, opacity: 0.18 }}
        viewport={{ once: true }}
        transition={{ duration: 2.4, delay: delay + 0.8, ease }}
      />
      {/* the saxophone, in brass */}
      <g {...ink} stroke="var(--color-rose)" strokeWidth="1.1">
        <motion.path d="M40 34 L52 26 L60 36 L49 44 Z" {...d(0, 0.8)} />
        <motion.path d="M55 40 C66 50 78 60 86 74 C90 82 92 90 92 98 M50 44 C61 54 72 64 79 77 C83 85 85 92 85 98" {...d(0, 1.4)} />
        <motion.path d="M85 98 C84 160 82 240 80 318 M99 98 C101 160 104 240 106 318 M84 98 L100 98" {...d(1, 2)} />
        <motion.path d="M80 318 C78 372 150 380 154 326 M106 318 C108 346 130 350 132 328" {...d(2, 1.6)} />
        <motion.path d="M154 326 C156 300 160 280 177 254 M132 328 C132 302 128 280 115 258" {...d(3, 1.6)} />
        <motion.ellipse cx="146" cy="252" rx="32" ry="8.5" transform="rotate(-8 146 252)" {...d(4, 1.4)} />
        <motion.path d="M124 272 C138 277 156 275 168 268" strokeOpacity="0.5" {...d(5, 1)} />
      </g>
      {/* its keys */}
      <g {...ink} stroke="var(--color-sage-deep)" strokeWidth="0.9">
        <motion.path d="M96 130 a5 5 0 1 1 -10 0 a5 5 0 1 1 10 0 M96.4 160 a5.4 5.4 0 1 1 -10.8 0 a5.4 5.4 0 1 1 10.8 0 M97.8 192 a5.8 5.8 0 1 1 -11.6 0 a5.8 5.8 0 1 1 11.6 0 M98 226 a6 6 0 1 1 -12 0 a6 6 0 1 1 12 0 M99.2 260 a6.2 6.2 0 1 1 -12.4 0 a6.2 6.2 0 1 1 12.4 0 M99.4 292 a6.4 6.4 0 1 1 -12.8 0 a6.4 6.4 0 1 1 12.8 0" {...d(3, 2)} />
        <motion.path d="M100 145 C108 150 108 205 101 212 M101 240 C110 246 112 280 104 290 M82 175 l-6 2 M82 245 l-6 2" {...d(4, 1.6)} />
      </g>
      {/* the music */}
      <g {...ink} stroke="var(--color-burgundy)" strokeWidth="1.1">
        <motion.g {...rise(0)}>
          <g transform="translate(150 204)">
            <Eighth />
          </g>
        </motion.g>
        <motion.g {...rise(1)}>
          <g transform="translate(172 158)">
            <Pair />
          </g>
        </motion.g>
        <motion.g {...rise(2)}>
          <g transform="translate(140 112)">
            <Eighth s={0.88} />
          </g>
        </motion.g>
        <motion.g {...rise(3)} opacity={reduce ? 0.7 : undefined}>
          <g transform="translate(170 68)">
            <Eighth s={0.76} />
          </g>
        </motion.g>
      </g>
    </svg>
  );
}

/** A single note, for dividers, the logo mark and small places. */
export function Note({ className, delay = 0, still }: DrawProps) {
  const d = useDraw(delay, still);
  return (
    <svg viewBox="0 0 40 60" className={className} aria-hidden="true">
      <g {...ink} strokeWidth="1.2">
        <motion.path stroke="var(--color-burgundy)" d="M27 8 V44 M27 8 C34 14 37 20 35 28" {...d(0, 1.4)} />
        <motion.ellipse cx="20" cy="45" rx="8" ry="5.8" transform="rotate(-25 20 45)" stroke="var(--color-burgundy)" fill="var(--color-burgundy)" fillOpacity="0.9" {...d(1, 1)} />
      </g>
    </svg>
  );
}

/** A gently rising line with a few notes on it; for section openers. */
export function NoteLine({ className, delay = 0, still }: DrawProps) {
  const d = useDraw(delay, still);
  return (
    <svg viewBox="0 0 220 60" className={className} aria-hidden="true">
      <g {...ink} stroke="var(--color-sage-deep)" strokeWidth="1">
        <motion.path d="M6 50 C60 46 120 38 214 18" {...d(0, 2)} />
      </g>
      <g {...ink} stroke="var(--color-burgundy)" strokeWidth="1.1">
        <motion.g initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }} transition={{ duration: 1, delay: delay + 0.8 }}>
          <g transform="translate(58 44)">
            <Eighth s={0.7} />
          </g>
          <g transform="translate(118 36)">
            <Pair s={0.7} />
          </g>
          <g transform="translate(182 24)">
            <Eighth s={0.7} />
          </g>
        </motion.g>
      </g>
    </svg>
  );
}

/** Two notes joined, in a soft circle: the closing mark. */
export function Notes({ className, delay = 0, still }: DrawProps) {
  const d = useDraw(delay, still);
  return (
    <svg viewBox="0 0 120 120" className={className} aria-hidden="true">
      <g {...ink} stroke="var(--color-dusty)" strokeWidth="1">
        <motion.path d="M60 12 C88 12 108 32 108 60 C108 88 88 108 60 108 C32 108 12 88 12 60 C12 34 30 15 54 12" {...d(0, 2.6)} />
      </g>
      <g {...ink} stroke="var(--color-burgundy)" strokeWidth="1.2">
        <motion.g initial={{ opacity: 0, y: 6 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 1.2, delay: delay + 0.9, ease }}>
          <g transform="translate(44 76)">
            <Pair s={1.25} />
          </g>
        </motion.g>
      </g>
    </svg>
  );
}

/** Thin rule with a note in the middle; marks a turn between chapters. */
export function Divider({ className }: { className?: string }) {
  return (
    <div className={`flex items-center justify-center gap-5 ${className ?? ""}`} aria-hidden="true">
      <span className="h-px w-24 bg-line sm:w-40" />
      <Note className="h-10 w-7" delay={0.2} />
      <span className="h-px w-24 bg-line sm:w-40" />
    </div>
  );
}
