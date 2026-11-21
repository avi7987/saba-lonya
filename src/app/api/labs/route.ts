import { NextResponse } from "next/server";
import { binding } from "@/server/ai";
import { store, textStore } from "@/server/store";

export const runtime = "nodejs";

/*
  TEMPORARY: comparing the models Cloudflare offers for reading and translating Grandpa's pages.
  Needs a one-off key (only its hash is here); keeps nothing. To be removed after the comparison.
*/
const KEY_HASH = "a29983073896d46551f11ca6981ba2bd981ba22057f86279f0ee09a5d3362d8f";

async function sha(s: string) {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(d), (x) => x.toString(16).padStart(2, "0")).join("");
}

export async function POST(req: Request) {
  const b = (await req.json().catch(() => ({}))) as { key?: string; action?: string; model?: string; memoryId?: string; system?: string; prompt?: string; text?: string; image?: string; max?: number; input?: unknown };
  if (!b.key || (await sha(b.key)) !== KEY_HASH) return NextResponse.json({ error: "no" }, { status: 404 });
  const ai = (await binding()) as unknown as { run(m: string, i: unknown): Promise<unknown>; models?: (p?: unknown) => Promise<unknown> } | undefined;
  if (!ai) return NextResponse.json({ error: "no ai" }, { status: 500 });
  try {
    if (b.action === "models") return NextResponse.json({ models: ai.models ? await ai.models({ per_page: 200 }) : "no models()" });
    if (b.action === "ocrtext") {
      const t = (await textStore.list("approved")).find((x) => x.memoryId === b.memoryId && x.source === "ocr");
      return NextResponse.json({ text: t?.text });
    }
    if (b.action === "page") {
      const m = await store.get(b.memoryId ?? "");
      const f = m?.files.find((x) => x.kind === "image");
      const bytes = f ? await store.readFile(m!.id, f.name) : undefined;
      return NextResponse.json({ size: bytes?.byteLength });
    }
    // a raw run: messages built from system / text / image, or the exact input given
    const content: unknown[] = [];
    if (b.prompt) content.push({ type: "text", text: b.prompt });
    if (b.image) content.push({ type: "image_url", image_url: { url: b.image.startsWith("data:") ? b.image : `data:image/jpeg;base64,${b.image}` } });
    const messages = [...(b.system ? [{ role: "system", content: b.system }] : []), { role: "user", content: content.length > 1 || b.image ? content : (b.text ?? b.prompt ?? "") }];
    const t0 = Date.now();
    const out = await ai.run(b.model ?? "", b.input ?? { messages, max_tokens: b.max ?? 2500, temperature: 0.2 });
    return NextResponse.json({ ms: Date.now() - t0, out });
  } catch (e) {
    return NextResponse.json({ error: String((e as Error)?.message ?? e).slice(0, 500) }, { status: 500 });
  }
}
