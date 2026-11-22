import { NextResponse } from "next/server";
import { nightlyCareful } from "@/server/careful";
import { runJobs } from "@/server/knowledge";

export const runtime = "nodejs";

/**
 * The hourly run (see worker.ts): does the waiting work for about twelve minutes. Only the Worker's
 * own scheduled call gets in, with a key it made a moment ago; anyone else gets "not found".
 */
export async function POST(req: Request) {
  const key = (globalThis as { __jobsKey?: string }).__jobsKey;
  if (!key || req.headers.get("x-jobs-key") !== key) return NextResponse.json({ error: "not found" }, { status: 404 });
  (globalThis as { __jobsKey?: string }).__jobsKey = undefined;
  // once a night, the careful reading by Claude is started for the pages waiting for it
  await nightlyCareful().catch(() => {});
  const done = await runJobs({ limit: 200, until: Date.now() + 12 * 60 * 1000 });
  return NextResponse.json({ ok: true, done });
}
