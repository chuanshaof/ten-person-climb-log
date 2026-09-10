/**
 * A dependency-free stand-in for the D1 binding.
 *
 * It is not a SQL engine. It recognises exactly the queries `src/worker/index.ts`
 * issues and answers them from in-memory tables, which is enough to exercise
 * every route, every validation branch and the ownership rule without a
 * Miniflare/D1 instance. If the Worker gains a query, this throws rather than
 * quietly returning nothing — an unrecognised statement is a test-harness bug,
 * not an empty result.
 */

export type Row = Record<string, unknown>;

export interface Tables {
  members: Row[];
  systems: Row[];
  chains: Row[];
  gyms: Row[];
  grades: Row[];
  sends: Row[];
}

/** The seed every test starts from: two chains on two systems, three members. */
export function fixture(): Tables {
  return {
    members: [
      { id: 1, name: "Member 1", emoji: "🧗" },
      { id: 2, name: "Member 2", emoji: "🐒" },
      { id: 3, name: "Member 3", emoji: "🦎" },
    ],
    systems: [
      { id: "bff", name: "BFF", confidence: "sourced", source: "conversion table" },
      { id: "bm", name: "Boulder Movement", confidence: "estimated", source: "interpolated" },
    ],
    chains: [
      { id: 10, name: "Boulder Movement", system_id: "bm" },
      { id: 11, name: "BFF", system_id: "bff" },
    ],
    gyms: [
      { id: 100, chain_id: 10, branch: "Tai Seng" },
      { id: 101, chain_id: 10, branch: "Bugis" },
      { id: 110, chain_id: 11, branch: "" },
    ],
    grades: [
      { id: 200, system_id: "bm", label: "5", rank: 45, ordinal: 5, colour: null },
      { id: 201, system_id: "bm", label: "6", rank: 48, ordinal: 6, colour: null },
      { id: 210, system_id: "bff", label: "7", rank: 70, ordinal: 7, colour: "red" },
    ],
    sends: [
      {
        id: 900,
        member_id: 1,
        gym_id: 100,
        grade_id: 200,
        sent_on: "2026-09-01",
        note: "first one",
        created_at: "2026-09-01 10:00:00",
      },
      {
        id: 901,
        member_id: 2,
        gym_id: 110,
        grade_id: 210,
        sent_on: "2026-09-02",
        note: null,
        created_at: "2026-09-02 10:00:00",
      },
    ],
  };
}

const squash = (sql: string) => sql.replace(/\s+/g, " ").trim();

export class FakeD1 {
  /** Every statement the Worker prepared, in order, with its bound values. */
  readonly log: { sql: string; binds: unknown[] }[] = [];
  private nextSendId = 1000;

  constructor(readonly tables: Tables = fixture()) {}

  prepare(sql: string) {
    return new FakeStatement(this, squash(sql));
  }

  /** Only `prepare` is used by the Worker; the rest of D1 is deliberately absent. */
  record(sql: string, binds: unknown[]) {
    this.log.push({ sql, binds });
  }

  allocateSendId() {
    return this.nextSendId++;
  }
}

class FakeStatement {
  private binds: unknown[] = [];

  constructor(
    private readonly db: FakeD1,
    private readonly sql: string,
  ) {}

  bind(...values: unknown[]) {
    this.binds = values;
    return this;
  }

  async first(): Promise<Row | null> {
    this.db.record(this.sql, this.binds);
    return this.resolveFirst();
  }

  async all(): Promise<{ results: Row[]; success: true; meta: Row }> {
    this.db.record(this.sql, this.binds);
    return { results: this.resolveAll(), success: true, meta: {} };
  }

  async run(): Promise<{ success: true; meta: Row }> {
    this.db.record(this.sql, this.binds);
    this.resolveWrite();
    return { success: true, meta: {} };
  }

  private resolveFirst(): Row | null {
    const t = this.db.tables;

    if (this.sql === "SELECT 1 FROM members WHERE id = ?") {
      return t.members.some((m) => m.id === this.binds[0]) ? { 1: 1 } : null;
    }

    if (this.sql === "SELECT member_id FROM sends WHERE id = ?") {
      const send = t.sends.find((s) => s.id === this.binds[0]);
      return send ? { member_id: send.member_id } : null;
    }

    if (this.sql.startsWith("SELECT 1 FROM gyms g JOIN chains c")) {
      const [gymId, gradeId] = this.binds;
      const gym = t.gyms.find((g) => g.id === gymId);
      const chain = gym && t.chains.find((c) => c.id === gym.chain_id);
      const grade = t.grades.find((gr) => gr.id === gradeId);
      return chain && grade && grade.system_id === chain.system_id ? { 1: 1 } : null;
    }

    if (this.sql.startsWith("INSERT INTO sends")) {
      const [member_id, gym_id, grade_id, sent_on, note] = this.binds;
      const id = this.db.allocateSendId();
      t.sends.push({
        id,
        member_id,
        gym_id,
        grade_id,
        sent_on,
        note,
        created_at: "2026-09-10 00:00:00",
      });
      return { id };
    }

    throw new Error(`FakeD1: unrecognised first() query: ${this.sql}`);
  }

  private resolveAll(): Row[] {
    const t = this.db.tables;
    const byName = (a: Row, b: Row) => String(a.name).localeCompare(String(b.name));

    if (this.sql === "SELECT id, name, emoji FROM members ORDER BY name") {
      return [...t.members].sort(byName).map((m) => ({ id: m.id, name: m.name, emoji: m.emoji }));
    }

    if (this.sql === "SELECT id, name, confidence, source FROM systems ORDER BY name") {
      return [...t.systems].sort(byName);
    }

    if (this.sql === "SELECT id, name, system_id FROM chains ORDER BY name") {
      return [...t.chains].sort(byName);
    }

    if (this.sql.startsWith("SELECT g.id, g.chain_id, g.branch FROM gyms g")) {
      const chainName = (id: unknown) => String(t.chains.find((c) => c.id === id)?.name ?? "");
      return [...t.gyms]
        .sort(
          (a, b) =>
            chainName(a.chain_id).localeCompare(chainName(b.chain_id)) ||
            String(a.branch).localeCompare(String(b.branch)),
        )
        .map((g) => ({ id: g.id, chain_id: g.chain_id, branch: g.branch }));
    }

    if (this.sql.startsWith("SELECT id, system_id, label, rank, ordinal, colour FROM grades")) {
      return [...t.grades].sort(
        (a, b) =>
          String(a.system_id).localeCompare(String(b.system_id)) ||
          Number(a.ordinal) - Number(b.ordinal),
      );
    }

    if (this.sql.startsWith("SELECT s.id, s.member_id, s.gym_id, s.grade_id")) {
      return [...t.sends]
        .sort(
          (a, b) =>
            String(b.sent_on).localeCompare(String(a.sent_on)) || Number(b.id) - Number(a.id),
        )
        .map((s) => {
          const gym = t.gyms.find((g) => g.id === s.gym_id)!;
          const chain = t.chains.find((c) => c.id === gym.chain_id)!;
          const system = t.systems.find((sy) => sy.id === chain.system_id)!;
          const grade = t.grades.find((gr) => gr.id === s.grade_id)!;
          return {
            id: s.id,
            member_id: s.member_id,
            gym_id: s.gym_id,
            grade_id: s.grade_id,
            sent_on: s.sent_on,
            note: s.note,
            created_at: s.created_at,
            chain_id: gym.chain_id,
            grade_label: grade.label,
            grade_rank: grade.rank,
            grade_colour: grade.colour,
            grade_confidence: system.confidence,
          };
        });
    }

    throw new Error(`FakeD1: unrecognised all() query: ${this.sql}`);
  }

  private resolveWrite(): void {
    const t = this.db.tables;

    if (this.sql === "DELETE FROM sends WHERE id = ?") {
      t.sends = t.sends.filter((s) => s.id !== this.binds[0]);
      return;
    }

    if (this.sql.startsWith("UPDATE sends SET")) {
      const [gym_id, grade_id, sent_on, note, id] = this.binds;
      const send = t.sends.find((s) => s.id === id);
      if (send) Object.assign(send, { gym_id, grade_id, sent_on, note });
      return;
    }

    throw new Error(`FakeD1: unrecognised run() query: ${this.sql}`);
  }
}
