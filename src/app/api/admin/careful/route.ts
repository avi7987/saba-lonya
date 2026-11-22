import { NextResponse } from "next/server";
import { isAdmin } from "@/server/auth";
import { pendingPages, saveCareful, type CarefulResult } from "@/server/knowledge";
import { store } from "@/server/store";
import { carefulKeyOk, carefulReady, fireCareful } from "@/server/careful";

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

/** the owner (admin password) or the task itself (the one-time key it was started with) */
const allowed = async (req: Request) => (await carefulKeyOk(req)) || (await isAdmin(req));

export async function GET(req: Request) {
  if (!(await allowed(req))) return json({ error: "unauthorized" }, 401);
  const limit = Math.min(Math.max(Number(new URL(req.url).searchParams.get("limit")) || 20, 1), 60);
  const pending = await pendingPages(limit);
  return json({
    pending,
    waiting: pending.reduce((n, m) => n + m.pages.length, 0),
    last: (await store.getMeta("careful-last").catch(() => undefined)) ?? null,
    started: (await store.getMeta("careful-started").catch(() => undefined)) ?? null,
    button: await carefulReady(),
  });
}

export async function POST(req: Request) {
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  // the task may only send what it read; starting it is for the owner
  if (!(b.action === "save" ? await allowed(req) : await isAdmin(req))) return json({ error: "unauthorized" }, 401);

  if (b.action === "save") {
    const r = b as unknown as CarefulResult;
    if (typeof r.memoryId !== "string" || !Array.isArray(r.pages)) return json({ error: "shape" }, 422);
    const res = await saveCareful(r);
    return json(res, res.ok ? 200 : 404);
  }

  if (b.action === "run") {
    const r = await fireCareful("The site's owner pressed the button.");
    if (r.error === "not set up") return json(r, 409);
    if (r.error === "just started") return json(r, 429);
    if (r.error) return json(r, 502);
    return json(r);
  }

  return json({ error: "action" }, 400);
}
