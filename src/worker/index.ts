/**
 * The one rule lives here, in `assertOwner`:
 *   everyone can read every send; you can only write your own.
 *
 * Identity is honour-system — you pick your name from a list and it goes in a
 * cookie. That's deliberate for a group of ten who know each other. It is NOT
 * authentication: anyone who can reach the app can claim to be anyone. What the
 * cookie does buy is that the *client* can't quietly post as someone else — the
 * server never trusts a member_id from the request body.
 */

const COOKIE = "climb_member";

interface Env {
  DB: D1Database;
}

type Json = Record<string, unknown> | unknown[];

const json = (body: Json, init: ResponseInit = {}) =>
  new Response(JSON.stringify(body), {
    ...init,
    headers: { "content-type": "application/json", ...(init.headers ?? {}) },
  });

class HttpError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

function readMemberId(req: Request): number | null {
  const raw = req.headers.get("cookie") ?? "";
  const hit = raw.split(";").map((c) => c.trim()).find((c) => c.startsWith(`${COOKIE}=`));
  if (!hit) return null;
  const id = Number(hit.slice(COOKIE.length + 1));
  return Number.isInteger(id) && id > 0 ? id : null;
}

function requireMe(req: Request): number {
  const id = readMemberId(req);
  if (id === null) throw new HttpError(401, "Pick who you are first.");
  return id;
}

/** The rule. */
async function assertOwner(env: Env, sendId: number, meId: number) {
  const row = await env.DB.prepare("SELECT member_id FROM sends WHERE id = ?")
    .bind(sendId)
    .first<{ member_id: number }>();
  if (!row) throw new HttpError(404, "No such send.");
  if (row.member_id !== meId) {
    throw new HttpError(403, "That's someone else's send — you can only change your own.");
  }
}

async function body(req: Request): Promise<Record<string, unknown>> {
  try {
    const parsed = await req.json();
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    /* fall through */
  }
  throw new HttpError(400, "Expected a JSON object.");
}

function intField(src: Record<string, unknown>, key: string): number {
  const n = Number(src[key]);
  if (!Number.isInteger(n) || n <= 0) throw new HttpError(400, `Missing or invalid "${key}".`);
  return n;
}

function dateField(src: Record<string, unknown>, key: string): string {
  const v = String(src[key] ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) throw new HttpError(400, `"${key}" must look like 2026-09-10.`);
  return v;
}

function noteField(src: Record<string, unknown>): string | null {
  const v = src.note;
  if (v === undefined || v === null || v === "") return null;
  const s = String(v).trim().slice(0, 280);
  return s === "" ? null : s;
}

/**
 * A grade must be on the ladder of the chain that owns this branch. Grades hang
 * off the chain, so logging a BFF grade at a Boulder Planet branch is rejected.
 */
async function assertGradeFitsGym(env: Env, gymId: number, gradeId: number) {
  const ok = await env.DB.prepare(
    `SELECT 1
       FROM gyms g
       JOIN chains c  ON c.id = g.chain_id
       JOIN grades gr ON gr.system_id = c.system_id
      WHERE g.id = ? AND gr.id = ?`,
  )
    .bind(gymId, gradeId)
    .first();
  if (!ok) throw new HttpError(400, "That grade isn't on that gym's ladder.");
}

const SENDS_SQL = `
  SELECT s.id, s.member_id, s.gym_id, s.grade_id, s.sent_on, s.note, s.created_at,
         g.chain_id,
         gr.label AS grade_label, gr.rank AS grade_rank, gr.colour AS grade_colour,
         sy.confidence AS grade_confidence
    FROM sends s
    JOIN gyms g    ON g.id = s.gym_id
    JOIN chains c  ON c.id = g.chain_id
    JOIN systems sy ON sy.id = c.system_id
    JOIN grades gr ON gr.id = s.grade_id
   ORDER BY s.sent_on DESC, s.id DESC`;

async function route(req: Request, env: Env): Promise<Response> {
  const url = new URL(req.url);
  const path = url.pathname;
  const method = req.method;

  if (path === "/api/bootstrap" && method === "GET") {
    const [members, systems, chains, gyms, grades] = await Promise.all([
      env.DB.prepare("SELECT id, name, emoji FROM members ORDER BY name").all(),
      env.DB.prepare("SELECT id, name, confidence, source FROM systems ORDER BY name").all(),
      env.DB.prepare("SELECT id, name, system_id FROM chains ORDER BY name").all(),
      env.DB.prepare(
        `SELECT g.id, g.chain_id, g.branch
           FROM gyms g JOIN chains c ON c.id = g.chain_id
          ORDER BY c.name, g.branch`,
      ).all(),
      env.DB.prepare(
        "SELECT id, system_id, label, rank, ordinal, colour FROM grades ORDER BY system_id, ordinal",
      ).all(),
    ]);
    return json({
      me: readMemberId(req),
      members: members.results,
      systems: systems.results,
      chains: chains.results,
      gyms: gyms.results,
      grades: grades.results,
    });
  }

  if (path === "/api/session" && method === "POST") {
    const b = await body(req);
    const id = intField(b, "member_id");
    const exists = await env.DB.prepare("SELECT 1 FROM members WHERE id = ?").bind(id).first();
    if (!exists) throw new HttpError(404, "Not one of the ten.");
    return json(
      { me: id },
      {
        headers: {
          "set-cookie": `${COOKIE}=${id}; Path=/; HttpOnly; SameSite=Lax; Max-Age=31536000`,
        },
      },
    );
  }

  if (path === "/api/session" && method === "DELETE") {
    return json(
      { me: null },
      { headers: { "set-cookie": `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0` } },
    );
  }

  // Everyone reads everything.
  if (path === "/api/sends" && method === "GET") {
    const { results } = await env.DB.prepare(SENDS_SQL).all();
    return json({ sends: results });
  }

  if (path === "/api/sends" && method === "POST") {
    const me = requireMe(req);
    const b = await body(req);
    const gymId = intField(b, "gym_id");
    const gradeId = intField(b, "grade_id");
    await assertGradeFitsGym(env, gymId, gradeId);
    const row = await env.DB.prepare(
      `INSERT INTO sends (member_id, gym_id, grade_id, sent_on, note)
       VALUES (?, ?, ?, ?, ?) RETURNING id`,
    )
      .bind(me, gymId, gradeId, dateField(b, "sent_on"), noteField(b))
      .first<{ id: number }>();
    return json({ id: row!.id }, { status: 201 });
  }

  const one = path.match(/^\/api\/sends\/(\d+)$/);
  if (one) {
    const id = Number(one[1]);
    const me = requireMe(req);
    await assertOwner(env, id, me);

    if (method === "DELETE") {
      await env.DB.prepare("DELETE FROM sends WHERE id = ?").bind(id).run();
      return json({ deleted: id });
    }

    if (method === "PATCH") {
      const b = await body(req);
      const gymId = intField(b, "gym_id");
      const gradeId = intField(b, "grade_id");
      await assertGradeFitsGym(env, gymId, gradeId);
      await env.DB.prepare(
        "UPDATE sends SET gym_id = ?, grade_id = ?, sent_on = ?, note = ? WHERE id = ?",
      )
        .bind(gymId, gradeId, dateField(b, "sent_on"), noteField(b), id)
        .run();
      return json({ updated: id });
    }
  }

  throw new HttpError(404, "No such endpoint.");
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    if (!new URL(req.url).pathname.startsWith("/api/")) {
      // Anything else is the SPA; the assets binding handles it.
      return new Response("Not found", { status: 404 });
    }
    try {
      return await route(req, env);
    } catch (err) {
      if (err instanceof HttpError) return json({ error: err.message }, { status: err.status });
      console.error(err);
      return json({ error: "Something broke on our side." }, { status: 500 });
    }
  },
} satisfies ExportedHandler<Env>;
