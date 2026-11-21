/*
  The site's Worker: the Next.js site as OpenNext builds it, plus a run once an hour that does the
  waiting work (reading pages, translating them, finding what they tell) by itself. Work started
  after a visitor's reply is cut short on the free plan; a scheduled run may go on for minutes, so
  nothing waits for someone to open a page.
*/
// eslint-disable-next-line @typescript-eslint/ban-ts-comment -- the file exists only after the OpenNext build
// @ts-ignore built by OpenNext before the Worker is bundled (absent until then)
import handler from "./.open-next/worker.js";

type Ctx = { waitUntil(p: Promise<unknown>): void };
type Fetch = { fetch(req: Request, env: unknown, ctx: Ctx): Promise<Response> };

const worker = {
  fetch: (req: Request, env: unknown, ctx: Ctx) => (handler as Fetch).fetch(req, env, ctx),
  async scheduled(_event: unknown, env: unknown, ctx: Ctx) {
    // a key known only inside this running Worker: the jobs route accepts only this call
    const key = crypto.randomUUID();
    (globalThis as { __jobsKey?: string }).__jobsKey = key;
    ctx.waitUntil((handler as Fetch).fetch(new Request("https://worker.internal/api/jobs", { method: "POST", headers: { "x-jobs-key": key } }), env, ctx));
  },
};

export default worker;
