import { NextResponse } from "next/server";
import { MIN_PASSWORD, adminLocked, isAdmin, passwordChosen, rateLimited, setAdminPassword } from "@/server/auth";

export const runtime = "nodejs";

/** whether a password was chosen yet: until then the admin page offers to choose the first one */
export async function GET() {
  return NextResponse.json({ chosen: await passwordChosen() });
}

/**
 * The owner chooses their own admin password, signed in with the current one. The very first one,
 * on a site that has none yet, can be chosen without signing in: whoever opens the new site's
 * admin page first sets it, and from then on only it (or the ADMIN_TOKEN) lets anyone in.
 */
export async function POST(req: Request) {
  if (adminLocked(req)) return NextResponse.json({ error: "locked" }, { status: 429 });
  const first = !(await passwordChosen());
  if (first ? rateLimited(req, 5, 10 * 60 * 1000, "first-pass") : !(await isAdmin(req))) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const b = (await req.json().catch(() => ({}))) as { password?: unknown };
  const pw = typeof b.password === "string" ? b.password : "";
  if (pw.length < MIN_PASSWORD || pw.length > 200 || pw.trim() !== pw) return NextResponse.json({ error: "weak" }, { status: 422 });
  // checked again just before saving, so two people at once cannot both set the first one
  if (first && (await passwordChosen())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  await setAdminPassword(pw);
  return NextResponse.json({ ok: true });
}
