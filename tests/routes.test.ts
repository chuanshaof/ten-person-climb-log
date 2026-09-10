import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { harness, readJson, offsetDay, todayUtc } from "./support/helpers.ts";
import { fixture } from "./support/fake-d1.ts";

const validSend = () => ({
  gym_id: 100,
  grade_id: 200,
  sent_on: "2026-09-01",
  note: "flashed it",
});

const post = (path: string, payload: unknown, as?: number | string) => ({
  method: "POST",
  body: JSON.stringify(payload),
  ...(as === undefined ? {} : { as }),
});

describe("routing", () => {
  test("a non-API path is handed to the asset binding, not 404'd", async () => {
    const h = harness();
    const res = await h.call("/anything/at/all");
    assert.equal(res.status, 200);
    assert.equal(await res.text(), "the app");
    assert.equal(h.assets.calls.length, 1);
    assert.equal(h.db.log.length, 0);
  });

  test("the bare root goes to assets too", async () => {
    const h = harness();
    await h.call("/");
    assert.equal(h.assets.calls.length, 1);
  });

  test("an unknown /api path is a 404 with a message", async () => {
    const { status, body } = await readJson(await harness().call("/api/nope"));
    assert.equal(status, 404);
    assert.equal(body.error, "No such endpoint.");
  });

  test("a wrong method on a real endpoint is a 404, not a hang", async () => {
    const { status } = await readJson(await harness().call("/api/bootstrap", { method: "POST" }));
    assert.equal(status, 404);
  });

  test("every error response is JSON", async () => {
    const res = await harness().call("/api/nope");
    assert.equal(res.headers.get("content-type"), "application/json");
  });

  test("an unexpected database failure becomes a 500, not a crash", async () => {
    const h = harness();
    h.db.prepare = () => {
      throw new Error("D1 is having a day");
    };
    const original = console.error;
    console.error = () => {};
    try {
      const { status, body } = await readJson(await h.call("/api/sends"));
      assert.equal(status, 500);
      assert.equal(body.error, "Something broke on our side.");
    } finally {
      console.error = original;
    }
  });
});

describe("GET /api/bootstrap", () => {
  test("returns every reference table the client needs", async () => {
    const { status, body } = await readJson(await harness().call("/api/bootstrap"));
    assert.equal(status, 200);
    assert.deepEqual(Object.keys(body).sort(), [
      "chains",
      "grades",
      "gyms",
      "me",
      "members",
      "systems",
    ]);
    assert.equal(body.members.length, 3);
    assert.equal(body.systems.length, 2);
    assert.equal(body.chains.length, 2);
    assert.equal(body.gyms.length, 3);
    assert.equal(body.grades.length, 3);
  });

  test("me is null without a cookie", async () => {
    const { body } = await readJson(await harness().call("/api/bootstrap"));
    assert.equal(body.me, null);
  });

  test("me is the cookie's member when the cookie names a real member", async () => {
    const { body } = await readJson(await harness().call("/api/bootstrap", { as: 2 }));
    assert.equal(body.me, 2);
  });

  test("reading the board needs no identity at all", async () => {
    const { status } = await readJson(await harness().call("/api/bootstrap"));
    assert.equal(status, 200);
  });
});

describe("cookie parsing", () => {
  const meFor = async (cookie: string) => {
    const { body } = await readJson(
      await harness().call("/api/bootstrap", { headers: { cookie } }),
    );
    return body.me;
  };

  test("finds the cookie among others, whatever the spacing", async () => {
    assert.equal(await meFor("theme=dark;climb_member=3; other=1"), 3);
    assert.equal(await meFor("climb_member=3"), 3);
  });

  test("ignores a cookie whose name merely contains ours", async () => {
    assert.equal(await meFor("xclimb_member=3"), null);
    assert.equal(await meFor("climb_member_backup=3"), null);
  });

  test("rejects values that are not plain positive integers", async () => {
    for (const raw of ["", "abc", "0", "-1", "3.0", " 3 ", "3x", "0x3", "1e3"]) {
      assert.equal(await meFor(`climb_member=${raw}`), null, `accepted ${JSON.stringify(raw)}`);
    }
  });

  test("rejects an id too large to be a safe integer", async () => {
    assert.equal(await meFor("climb_member=99999999999999999999"), null);
  });

  test("no cookie header at all is fine", async () => {
    const { body } = await readJson(await harness().call("/api/bootstrap"));
    assert.equal(body.me, null);
  });
});

describe("POST /api/session", () => {
  test("claims an identity and sets an HttpOnly cookie for a year", async () => {
    const res = await harness().call("/api/session", post("/api/session", { member_id: 2 }));
    const { status, body } = await readJson(res);
    assert.equal(status, 200);
    assert.deepEqual(body, { me: 2 });
    const cookie = res.headers.get("set-cookie")!;
    assert.match(cookie, /^climb_member=2;/);
    assert.match(cookie, /HttpOnly/);
    assert.match(cookie, /SameSite=Lax/);
    assert.match(cookie, /Max-Age=31536000/);
    assert.match(cookie, /Path=\//);
  });

  test("accepts a digit string as well as a number", async () => {
    const { body } = await readJson(
      await harness().call("/api/session", post("/api/session", { member_id: "3" })),
    );
    assert.equal(body.me, 3);
  });

  test("an unknown member is a 404, not a new identity", async () => {
    const { status, body } = await readJson(
      await harness().call("/api/session", post("/api/session", { member_id: 999 })),
    );
    assert.equal(status, 404);
    assert.equal(body.error, "Not one of the ten.");
  });

  test("a missing or nonsense member_id is a 400", async () => {
    for (const member_id of [undefined, null, 0, -2, 1.5, "two", true, [3], {}, "03 "]) {
      const { status, body } = await readJson(
        await harness().call("/api/session", post("/api/session", { member_id })),
      );
      assert.equal(status, 400, `accepted ${JSON.stringify(member_id)}`);
      assert.equal(body.error, 'Missing or invalid "member_id".');
    }
  });

  test("a body that is not a JSON object is a 400", async () => {
    for (const raw of ["", "not json", "[1,2]", "null", '"hi"', "7"]) {
      const { status, body } = await readJson(
        await harness().call("/api/session", { method: "POST", body: raw }),
      );
      assert.equal(status, 400, `accepted ${JSON.stringify(raw)}`);
      assert.equal(body.error, "Expected a JSON object.");
    }
  });
});

describe("DELETE /api/session", () => {
  test("expires the cookie and reports nobody", async () => {
    const res = await harness().call("/api/session", { method: "DELETE" });
    const { status, body } = await readJson(res);
    assert.equal(status, 200);
    assert.deepEqual(body, { me: null });
    const cookie = res.headers.get("set-cookie")!;
    assert.match(cookie, /^climb_member=;/);
    assert.match(cookie, /Max-Age=0/);
  });

  test("signing out works even when you were never signed in", async () => {
    const { status } = await readJson(await harness().call("/api/session", { method: "DELETE" }));
    assert.equal(status, 200);
  });
});

describe("GET /api/sends", () => {
  test("everyone reads everything, no cookie required", async () => {
    const { status, body } = await readJson(await harness().call("/api/sends"));
    assert.equal(status, 200);
    assert.equal(body.sends.length, 2);
  });

  test("newest first, ties broken by id descending", async () => {
    const t = fixture();
    t.sends.push({
      id: 902,
      member_id: 3,
      gym_id: 101,
      grade_id: 201,
      sent_on: "2026-09-02",
      note: null,
      created_at: "x",
    });
    const { body } = await readJson(await harness(t).call("/api/sends"));
    assert.deepEqual(
      body.sends.map((s: any) => s.id),
      [902, 901, 900],
    );
  });

  test("each send carries the grade label, rank and confidence for the shared scale", async () => {
    const { body } = await readJson(await harness().call("/api/sends"));
    const bff = body.sends.find((s: any) => s.id === 901);
    assert.equal(bff.grade_label, "7");
    assert.equal(bff.grade_rank, 70);
    assert.equal(bff.grade_confidence, "sourced");
    assert.equal(bff.chain_id, 11);
    const bm = body.sends.find((s: any) => s.id === 900);
    assert.equal(bm.grade_confidence, "estimated");
  });
});

describe("POST /api/sends — identity", () => {
  test("logging a send without a cookie is a 401", async () => {
    const { status, body } = await readJson(
      await harness().call("/api/sends", post("/api/sends", validSend())),
    );
    assert.equal(status, 401);
    assert.equal(body.error, "Pick who you are first.");
  });

  test("a cookie naming a member who no longer exists is a 401, not a 500", async () => {
    const { status, body } = await readJson(
      await harness().call("/api/sends", post("/api/sends", validSend(), 404)),
    );
    assert.equal(status, 401);
    assert.equal(body.error, "Pick who you are first.");
  });

  test("the member_id in the body is ignored — the cookie decides", async () => {
    const h = harness();
    const { status, body } = await readJson(
      await h.call("/api/sends", post("/api/sends", { ...validSend(), member_id: 2 }, 1)),
    );
    assert.equal(status, 201);
    const stored = h.db.tables.sends.find((s) => s.id === body.id)!;
    assert.equal(stored.member_id, 1);
  });
});

describe("POST /api/sends — validation", () => {
  const bad = async (patch: Record<string, unknown>) =>
    readJson(await harness().call("/api/sends", post("/api/sends", { ...validSend(), ...patch }, 1)));

  test("gym_id and grade_id must be positive integers", async () => {
    for (const key of ["gym_id", "grade_id"]) {
      for (const value of [undefined, null, 0, -1, 2.5, "abc", true]) {
        const { status, body } = await bad({ [key]: value });
        assert.equal(status, 400, `${key}=${JSON.stringify(value)} was accepted`);
        assert.equal(body.error, `Missing or invalid "${key}".`);
      }
    }
  });

  test("a grade from another chain's ladder is rejected", async () => {
    const { status, body } = await bad({ gym_id: 100, grade_id: 210 });
    assert.equal(status, 400);
    assert.equal(body.error, "That grade isn't on that gym's ladder.");
  });

  test("a grade is valid at any branch of its own chain", async () => {
    const { status } = await bad({ gym_id: 101, grade_id: 201 });
    assert.equal(status, 201);
  });

  test("an unknown gym is rejected by the ladder check", async () => {
    const { status, body } = await bad({ gym_id: 9999 });
    assert.equal(status, 400);
    assert.equal(body.error, "That grade isn't on that gym's ladder.");
  });

  test("sent_on must look like a calendar date", async () => {
    for (const sent_on of [undefined, null, "", "2026-9-1", "01-09-2026", "2026/09/01", "today"]) {
      const { status, body } = await bad({ sent_on });
      assert.equal(status, 400, `accepted ${JSON.stringify(sent_on)}`);
      assert.equal(body.error, '"sent_on" must look like 2026-09-10.');
    }
  });

  test("a date-shaped impossibility is rejected rather than rolled forward", async () => {
    for (const sent_on of ["2026-02-31", "2026-13-01", "2026-00-10", "2026-09-31", "2025-02-29"]) {
      const { status, body } = await bad({ sent_on });
      assert.equal(status, 400, `accepted ${sent_on}`);
      assert.equal(body.error, `"sent_on" isn't a real date.`);
    }
  });

  test("a real leap day is accepted", async () => {
    const { status } = await bad({ sent_on: "2024-02-29" });
    assert.equal(status, 201);
  });

  test("you cannot log a send you have not climbed yet", async () => {
    const { status, body } = await bad({ sent_on: offsetDay(2) });
    assert.equal(status, 400);
    assert.equal(body.error, "You can't log a send in the future.");
  });

  test("today is not the future", async () => {
    const { status } = await bad({ sent_on: todayUtc() });
    assert.equal(status, 201);
  });

  test("a body that is not a JSON object is a 400 before any write", async () => {
    const h = harness();
    const { status } = await readJson(
      await h.call("/api/sends", { method: "POST", body: "[]", as: 1 }),
    );
    assert.equal(status, 400);
    assert.equal(h.db.tables.sends.length, 2);
  });
});

describe("POST /api/sends — the note", () => {
  const noteFor = async (note: unknown) => {
    const h = harness();
    const { body } = await readJson(
      await h.call("/api/sends", post("/api/sends", { ...validSend(), note }, 1)),
    );
    return h.db.tables.sends.find((s) => s.id === body.id)!.note;
  };

  test("an absent, null or empty note is stored as NULL", async () => {
    assert.equal(await noteFor(undefined), null);
    assert.equal(await noteFor(null), null);
    assert.equal(await noteFor(""), null);
  });

  test("a whitespace-only note is stored as NULL", async () => {
    assert.equal(await noteFor("   \n\t "), null);
  });

  test("surrounding whitespace is trimmed", async () => {
    assert.equal(await noteFor("  crimpy  "), "crimpy");
  });

  test("a long note is capped at 280 characters", async () => {
    const note = await noteFor("x".repeat(500));
    assert.equal(note, "x".repeat(280));
  });
});

describe("POST /api/sends — success", () => {
  test("returns 201 and the new id, and the send is readable", async () => {
    const h = harness();
    const { status, body } = await readJson(
      await h.call("/api/sends", post("/api/sends", validSend(), 1)),
    );
    assert.equal(status, 201);
    assert.equal(typeof body.id, "number");

    const { body: list } = await readJson(await h.call("/api/sends"));
    assert.ok(list.sends.some((s: any) => s.id === body.id));
  });

  test("stores exactly what was sent", async () => {
    const h = harness();
    const { body } = await readJson(
      await h.call("/api/sends", post("/api/sends", validSend(), 2)),
    );
    assert.deepEqual(
      { ...h.db.tables.sends.find((s) => s.id === body.id)!, id: undefined, created_at: undefined },
      {
        id: undefined,
        created_at: undefined,
        member_id: 2,
        gym_id: 100,
        grade_id: 200,
        sent_on: "2026-09-01",
        note: "flashed it",
      },
    );
  });
});

describe("DELETE /api/sends/:id — the rule", () => {
  test("you can delete your own send", async () => {
    const h = harness();
    const { status, body } = await readJson(await h.call("/api/sends/900", { method: "DELETE", as: 1 }));
    assert.equal(status, 200);
    assert.deepEqual(body, { deleted: 900 });
    assert.equal(h.db.tables.sends.length, 1);
  });

  test("you cannot delete someone else's", async () => {
    const h = harness();
    const { status, body } = await readJson(await h.call("/api/sends/900", { method: "DELETE", as: 2 }));
    assert.equal(status, 403);
    assert.match(body.error, /someone else's send/);
    assert.equal(h.db.tables.sends.length, 2);
  });

  test("a send that does not exist is a 404", async () => {
    const { status, body } = await readJson(
      await harness().call("/api/sends/12345", { method: "DELETE", as: 1 }),
    );
    assert.equal(status, 404);
    assert.equal(body.error, "No such send.");
  });

  test("no identity is a 401 and touches nothing", async () => {
    const h = harness();
    const { status } = await readJson(await h.call("/api/sends/900", { method: "DELETE" }));
    assert.equal(status, 401);
    assert.equal(h.db.tables.sends.length, 2);
  });
});

describe("PATCH /api/sends/:id", () => {
  const edit = { gym_id: 101, grade_id: 201, sent_on: "2026-09-03", note: "regraded" };

  test("you can edit your own send", async () => {
    const h = harness();
    const { status, body } = await readJson(
      await h.call("/api/sends/900", { method: "PATCH", body: JSON.stringify(edit), as: 1 }),
    );
    assert.equal(status, 200);
    assert.deepEqual(body, { updated: 900 });
    const stored = h.db.tables.sends.find((s) => s.id === 900)!;
    assert.equal(stored.gym_id, 101);
    assert.equal(stored.grade_id, 201);
    assert.equal(stored.sent_on, "2026-09-03");
    assert.equal(stored.note, "regraded");
  });

  test("editing cannot move a send to another member", async () => {
    const h = harness();
    await h.call("/api/sends/900", {
      method: "PATCH",
      body: JSON.stringify({ ...edit, member_id: 3 }),
      as: 1,
    });
    assert.equal(h.db.tables.sends.find((s) => s.id === 900)!.member_id, 1);
  });

  test("you cannot edit someone else's", async () => {
    const h = harness();
    const { status } = await readJson(
      await h.call("/api/sends/901", { method: "PATCH", body: JSON.stringify(edit), as: 1 }),
    );
    assert.equal(status, 403);
    assert.equal(h.db.tables.sends.find((s) => s.id === 901)!.gym_id, 110);
  });

  test("a mismatched grade is rejected and nothing is written", async () => {
    const h = harness();
    const { status, body } = await readJson(
      await h.call("/api/sends/900", {
        method: "PATCH",
        body: JSON.stringify({ ...edit, grade_id: 210 }),
        as: 1,
      }),
    );
    assert.equal(status, 400);
    assert.equal(body.error, "That grade isn't on that gym's ladder.");
    assert.equal(h.db.tables.sends.find((s) => s.id === 900)!.grade_id, 200);
  });

  test("a future date is rejected and nothing is written", async () => {
    const h = harness();
    const { status } = await readJson(
      await h.call("/api/sends/900", {
        method: "PATCH",
        body: JSON.stringify({ ...edit, sent_on: offsetDay(3) }),
        as: 1,
      }),
    );
    assert.equal(status, 400);
    assert.equal(h.db.tables.sends.find((s) => s.id === 900)!.sent_on, "2026-09-01");
  });

  test("a send that does not exist is a 404", async () => {
    const { status } = await readJson(
      await harness().call("/api/sends/777", { method: "PATCH", body: JSON.stringify(edit), as: 1 }),
    );
    assert.equal(status, 404);
  });

  test("no identity is a 401", async () => {
    const { status } = await readJson(
      await harness().call("/api/sends/900", { method: "PATCH", body: JSON.stringify(edit) }),
    );
    assert.equal(status, 401);
  });
});

describe("/api/sends/:id — other methods", () => {
  test("a method with no handler falls through to 404", async () => {
    for (const method of ["GET", "PUT"]) {
      const { status } = await readJson(await harness().call("/api/sends/900", { method, as: 1 }));
      assert.equal(status, 404, `${method} did not 404`);
    }
  });

  test("a non-numeric id is not a send path at all", async () => {
    const { status, body } = await readJson(
      await harness().call("/api/sends/abc", { method: "DELETE", as: 1 }),
    );
    assert.equal(status, 404);
    assert.equal(body.error, "No such endpoint.");
  });

  test("a trailing slash is not a send path", async () => {
    const { status } = await readJson(
      await harness().call("/api/sends/900/", { method: "DELETE", as: 1 }),
    );
    assert.equal(status, 404);
  });
});
