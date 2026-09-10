/** Request/response plumbing shared by the route tests. */

import worker from "../../src/worker/index.ts";
import { FakeD1, fixture, type Tables } from "./fake-d1.ts";

export interface Harness {
  db: FakeD1;
  assets: { calls: Request[] };
  /** Send a request as nobody, or as `as` if given a member id. */
  call(
    path: string,
    init?: RequestInit & { as?: number | string },
  ): Promise<Response>;
}

export function harness(tables: Tables = fixture()): Harness {
  const db = new FakeD1(tables);
  const assets = { calls: [] as Request[] };
  const env = {
    DB: db,
    ASSETS: {
      fetch(req: Request) {
        assets.calls.push(req);
        return new Response("the app", { headers: { "content-type": "text/html" } });
      },
    },
  };

  return {
    db,
    assets,
    async call(path, init = {}) {
      const { as, ...rest } = init;
      const headers = new Headers(rest.headers);
      if (as !== undefined) headers.set("cookie", `climb_member=${as}`);
      if (rest.body !== undefined && !headers.has("content-type")) {
        headers.set("content-type", "application/json");
      }
      const req = new Request(`https://climb.test${path}`, { ...rest, headers });
      // The Worker only reads DB and ASSETS off Env; the generated type is far
      // wider, so the cast is the seam rather than a hand-written Env stub.
      return worker.fetch(req, env as unknown as Parameters<typeof worker.fetch>[1]);
    },
  };
}

/** Status plus parsed JSON body, which is what nearly every assertion wants. */
export async function readJson(res: Response): Promise<{ status: number; body: any }> {
  return { status: res.status, body: await res.json() };
}

/** Today's date as the Worker computes it, for tests that straddle "now". */
export const todayUtc = () => new Date().toISOString().slice(0, 10);

export function offsetDay(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
