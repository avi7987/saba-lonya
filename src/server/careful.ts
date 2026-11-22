import "server-only";
import { pendingPages } from "./knowledge";
import { setting } from "./notify";
import { store } from "./store";

/*
  Starting the careful reading (a scheduled Claude Code task on the owner's own subscription) from
  the site: by the owner's button, and once a night by the site's own hourly run. Each start hands
  the task a one-time key, good for one hour and only for the careful-reading routes, so the task
  needs no password of its own.
*/

const enc = (s: string) => new TextEncoder().encode(s);
const hex = (b: ArrayBuffer) => Array.from(new Uint8Array(b), (x) => x.toString(16).padStart(2, "0")).join("");
const sha = async (s: string) => hex(await crypto.subtle.digest("SHA-256", enc(s)));
const KEY = "careful-key";
const HOUR = 60 * 60 * 1000;

/** the task's start address and key, set by the owner in Cloudflare (CLAUDE_TASK_URL, CLAUDE_TASK_TOKEN) */
async function trigger() {
  const url = (await setting("CLAUDE_TASK_URL"))?.trim();
  const token = (await setting("CLAUDE_TASK_TOKEN"))?.trim();
  // only Anthropic's own address for starting a scheduled task: the key is never sent anywhere else
  const ok = !!url && /^https:\/\/api\.anthropic\.com\/v1\/claude_code\/routines\/trig_[A-Za-z0-9]+\/fire$/.test(url) && !!token;
  return ok ? { url: url!, token: token! } : undefined;
}

export const carefulReady = async () => !!(await trigger());

/**
 * The task's own standing key (only its hash is here; the key itself is in the task's instructions in
 * the owner's Claude account). It opens nothing but the careful-reading routes: the pages waiting,
 * and saving what was read.
 */
const STANDING = "b8303f0e94d53d0c2414333d9242e50c249b0951e0238dbc58eadc6663337b84";

/** is this request from the task (its standing key, or the one-time key it was started with)? */
export async function carefulKeyOk(req: Request) {
  const given = req.headers.get("x-careful-key") ?? "";
  if (given.length < 20) return false;
  if ((await sha(given)) === STANDING) return true;
  try {
    const k = JSON.parse((await store.getMeta(KEY)) ?? "null") as { hash: string; until: number } | null;
    return !!k && Date.now() < k.until && (await sha(given)) === k.hash;
  } catch {
    return false;
  }
}

/** start the task now (if pages wait for it), handing it a fresh one-time key */
export async function fireCareful(why: string): Promise<{ ok?: boolean; waiting?: number; session?: string; error?: string; status?: number }> {
  const t = await trigger();
  if (!t) return { error: "not set up" };
  const last = Date.parse((await store.getMeta("careful-started").catch(() => undefined)) ?? "");
  if (Number.isFinite(last) && Date.now() - last < 2 * 60 * 1000) return { error: "just started" };
  const waiting = (await pendingPages(60)).reduce((n, m) => n + m.pages.length, 0);
  if (!waiting) return { ok: true, waiting: 0 };
  const key = hex(crypto.getRandomValues(new Uint8Array(24)).buffer);
  await store.setMeta(KEY, JSON.stringify({ hash: await sha(key), until: Date.now() + HOUR }));
  const r = await fetch(t.url, {
    method: "POST",
    headers: { Authorization: `Bearer ${t.token}`, "anthropic-beta": "experimental-cc-routine-2026-04-01", "anthropic-version": "2023-06-01", "Content-Type": "application/json" },
    body: JSON.stringify({ text: `${why} Pages waiting: ${waiting}. careful-key: ${key}` }),
  }).catch(() => null);
  if (!r?.ok) return { error: "start failed", status: r?.status ?? 0 };
  await store.setMeta("careful-started", new Date().toISOString());
  const d = (await r.json().catch(() => ({}))) as { claude_code_session_url?: string };
  return { ok: true, waiting, session: d.claude_code_session_url };
}

/** once a night (about 3:00 in Israel), from the site's hourly run */
export async function nightlyCareful() {
  const hour = Number(new Intl.DateTimeFormat("en-GB", { hour: "numeric", hourCycle: "h23", timeZone: "Asia/Jerusalem" }).format(new Date()));
  if (hour !== 3) return;
  const day = new Date().toISOString().slice(0, 10);
  if ((await store.getMeta("careful-night").catch(() => undefined)) === day) return;
  await store.setMeta("careful-night", day);
  await fireCareful("Nightly run.").catch(() => {});
}
