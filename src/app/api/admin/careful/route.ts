import { NextResponse } from "next/server";
import { isAdmin } from "@/server/auth";
import { setting } from "@/server/notify";
import { pendingPages, saveCareful, type CarefulResult } from "@/server/knowledge";
import { store } from "@/server/store";

export const runtime = "nodejs";

/*
  Careful reading of Grandpa's pages by Claude, through a scheduled task on the owner's own
  Claude Code subscription (it runs every night, and when the owner presses the button):
  GET   what waits for it (and whether the button is set up)
  POST  {action: "save", ...}  what the task read, translated and found in one memory
  POST  {action: "run"}        the owner's button: starts the task now
  Everything here needs the admin password (the task sends it through its secure network settings).
*/

const json = (b: unknown, status = 200) => NextResponse.json(b, { status, headers: { "Cache-Control": "no-store" } });

/** the task's own start address and key, set by the owner in Cloudflare (CLAUDE_TASK_URL, CLAUDE_TASK_TOKEN) */
async function taskTrigger() {
  const url = (await setting("CLAUDE_TASK_URL"))?.trim();
  const token = (await setting("CLAUDE_TASK_TOKEN"))?.trim();
  // only Anthropic's own address for starting a scheduled task: the key is never sent anywhere else
  const ok = !!url && /^https:\/\/api\.anthropic\.com\/v1\/claude_code\/routines\/trig_[A-Za-z0-9]+\/fire$/.test(url) && !!token;
  return ok ? { url: url!, token: token! } : undefined;
}

export async function GET(req: Request) {
  if (!(await isAdmin(req))) return json({ error: "unauthorized" }, 401);
  const limit = Math.min(Math.max(Number(new URL(req.url).searchParams.get("limit")) || 20, 1), 60);
  const pending = await pendingPages(limit);
  return json({
    pending,
    waiting: pending.reduce((n, m) => n + m.pages.length, 0),
    last: (await store.getMeta("careful-last").catch(() => undefined)) ?? null,
    started: (await store.getMeta("careful-started").catch(() => undefined)) ?? null,
    button: !!(await taskTrigger()),
  });
}

export async function POST(req: Request) {
  if (!(await isAdmin(req))) return json({ error: "unauthorized" }, 401);
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;

  if (b.action === "save") {
    const r = b as unknown as CarefulResult;
    if (typeof r.memoryId !== "string" || !Array.isArray(r.pages)) return json({ error: "shape" }, 422);
    const res = await saveCareful(r);
    return json(res, res.ok ? 200 : 404);
  }

  if (b.action === "run") {
    const t = await taskTrigger();
    if (!t) return json({ error: "not set up" }, 409);
    // one start every two minutes is plenty (the task itself may run up to 30 times an hour)
    const last = Date.parse((await store.getMeta("careful-started").catch(() => undefined)) ?? "");
    if (Number.isFinite(last) && Date.now() - last < 2 * 60 * 1000) return json({ error: "just started" }, 429);
    const waiting = (await pendingPages(60)).reduce((n, m) => n + m.pages.length, 0);
    if (!waiting) return json({ ok: true, waiting: 0 });
    const r = await fetch(t.url, {
      method: "POST",
      headers: { Authorization: `Bearer ${t.token}`, "anthropic-beta": "experimental-cc-routine-2026-04-01", "anthropic-version": "2023-06-01", "Content-Type": "application/json" },
      body: JSON.stringify({ text: `The site's owner pressed the button: ${waiting} page(s) are waiting.` }),
    }).catch(() => null);
    if (!r?.ok) return json({ error: "start failed", status: r?.status ?? 0 }, 502);
    await store.setMeta("careful-started", new Date().toISOString());
    const d = (await r.json().catch(() => ({}))) as { claude_code_session_url?: string };
    return json({ ok: true, waiting, session: d.claude_code_session_url });
  }

  return json({ error: "action" }, 400);
}
