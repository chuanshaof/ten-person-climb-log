/**
 * Climb Log — one record type (a send), one shared action (log it),
 * one rule (you can only edit your own).
 *
 * Grades belong to a CHAIN, not a branch, so a personal best is per chain and
 * the branch is only where it happened. `rank` — (V + 3) x 10 — is the shared
 * scale that lets "7 at BFF" and "Blue at Boulder+" sit side by side.
 *
 * Where a chain publishes no V mapping, its system is confidence='estimated'
 * and every chip drawn from it is dashed. A guess should never read as a fact.
 */

interface Member { id: number; name: string; emoji: string }
interface System { id: string; name: string; confidence: "sourced" | "estimated"; source: string | null }
interface Chain { id: number; name: string; system_id: string }
interface Gym { id: number; chain_id: number; branch: string }
interface Grade { id: number; system_id: string; label: string; rank: number; ordinal: number; colour: string | null }
interface Send {
  id: number; member_id: number; gym_id: number; chain_id: number; grade_id: number;
  sent_on: string; note: string | null; created_at: string;
  grade_label: string; grade_rank: number; grade_colour: string | null;
  grade_confidence: "sourced" | "estimated";
}

type Tab = "board" | "gyms" | "recent" | "mine";

const state = {
  me: null as number | null,
  members: [] as Member[],
  systems: [] as System[],
  chains: [] as Chain[],
  gyms: [] as Gym[],
  grades: [] as Grade[],
  sends: [] as Send[],
  tab: "board" as Tab,
  editing: null as number | null,
  error: "" as string,
};

const app = document.getElementById("app")!;
const byId = <T extends { id: number | string }>(xs: T[], id: number | string) =>
  xs.find((x) => x.id === id);

const ESCAPES: Record<string, string> = {
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
};
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ESCAPES[c]);

/** rank = (V + 3) x 10, so undo the offset to show a V-grade back. */
const V_OFFSET = 3;
const asV = (rank: number) => {
  const v = rank / 10 - V_OFFSET;
  return `V${v.toFixed(Number.isInteger(v) ? 0 : 1)}`;
};

/** The board axis runs V0 -> V10. Everything is positioned as a % of that. */
const SCALE_MIN = 30;   // V0
const SCALE_MAX = 130;  // V10
const pctOf = (rank: number) =>
  Math.max(0, Math.min(100, ((rank - SCALE_MIN) / (SCALE_MAX - SCALE_MIN)) * 100));

const median = (xs: number[]) => {
  if (!xs.length) return null;
  const sorted = [...xs].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

const chainOf = (g: Gym) => byId(state.chains, g.chain_id);
const gymLabel = (g: Gym) => {
  const c = chainOf(g);
  return c ? (g.branch ? `${c.name} · ${g.branch}` : c.name) : "?";
};
const systemOfChain = (c: Chain) => state.systems.find((s) => s.id === c.system_id);
/**
 * Today in Singapore, which is where the group climbs — not `toISOString()`,
 * which is UTC and so is eight hours behind. It sets the date field's `max`,
 * so if it disagreed with the server's own idea of today the picker would
 * refuse a date the API accepts, or offer one the API rejects as "in the
 * future". Same zone, same answer, both sides. Keep it in step with
 * `localToday` in src/worker/index.ts.
 */
const today = () => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Singapore",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const at = (type: string) => parts.find((part) => part.type === type)!.value;
  return `${at("year")}-${at("month")}-${at("day")}`;
};
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
                "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** "9 Sep" — unambiguous unlike 09/09, and identical in every locale. */
const shortDate = (iso: string) => {
  const [, m, d] = iso.split("-");
  return `${Number(d)} ${MONTHS[Number(m) - 1]}`;
};

async function api(path: string, init?: RequestInit) {
  const res = await fetch(path, {
    ...init,
    headers: init?.body ? { "content-type": "application/json" } : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error ?? `Request failed (${res.status})`);
  return data;
}

async function load() {
  const [boot, sends] = await Promise.all([
    api("/api/bootstrap") as Promise<Omit<typeof state, "tab" | "editing" | "error" | "sends">>,
    api("/api/sends") as Promise<{ sends: Send[] }>,
  ]);
  Object.assign(state, boot, { sends: sends.sends });
}

/** Best send per (member, chain) — the record the group actually cares about. */
function personalBests() {
  const best = new Map<string, Send>();
  for (const s of state.sends) {
    const key = `${s.member_id}:${s.chain_id}`;
    const prev = best.get(key);
    if (!prev || s.grade_rank > prev.grade_rank) best.set(key, s);
  }
  return best;
}

// ── views ──────────────────────────────────────────────────────────────────

function chip(s: Send, label: string) {
  const swatch = s.grade_colour ? esc(s.grade_colour) : "var(--accent)";
  const est = s.grade_confidence === "estimated";
  const title = est ? " title=\"This gym publishes no V mapping — the comparison is an estimate.\"" : "";
  return `<span class="chip${est ? " est" : ""}"${title}>
    <span class="dot" style="background:${swatch}"></span>
    <span class="where">${esc(label)}</span>
    <strong>${esc(s.grade_label)}</strong>
    <span class="v">${est ? "~" : ""}${asV(s.grade_rank)}</span></span>`;
}

/** Shown whenever anything on screen is drawn from an estimated ladder. */
function legend(sends: Send[]) {
  if (!sends.some((s) => s.grade_confidence === "estimated")) return "";
  const names = [...new Set(sends.filter((s) => s.grade_confidence === "estimated").map((s) => {
    const c = byId(state.chains, s.chain_id);
    return c?.name ?? "?";
  }))];
  return `<p class="legend"><span class="chip est"><span class="dot"></span>dashed</span>
    ${esc(names.join(", "))} ${names.length > 1 ? "publish" : "publishes"} no V mapping,
    so those comparisons are interpolated. Fix the ranks in <code>seed/seed.sql</code>.</p>`;
}

function viewBoard() {
  if (!state.sends.length) {
    return `<div class="empty">
      <strong>Nothing logged yet</strong>
      <p>Someone has to go first. Pick your name up top and add one send — the
         board starts being worth reading at about two people.</p>
    </div>`;
  }

  const best = personalBests();
  const rows = state.members
    .map((m) => {
      const mine = state.chains
        .map((c) => ({ chain: c, send: best.get(`${m.id}:${c.id}`) }))
        .filter((x): x is { chain: Chain; send: Send } => !!x.send)
        .sort((a, b) => b.send.grade_rank - a.send.grade_rank);
      return { m, mine, top: mine[0]?.send ?? null };
    })
    .sort(
      (a, b) =>
        (b.top?.grade_rank ?? -1) - (a.top?.grade_rank ?? -1) ||
        a.m.name.localeCompare(b.m.name),
    );

  const mid = median(
    rows.map((r) => r.top?.grade_rank).filter((r): r is number => r != null),
  );
  const medianMark =
    mid === null
      ? ""
      : `<span class="median" style="left:${pctOf(mid).toFixed(2)}%"
              title="group median, ${asV(mid)}"></span>`;

  const ticks = ["V0", "V2", "V4", "V6", "V8", "V10"].map((t) => `<span>${t}</span>`).join("");

  const body = rows
    .map(({ m, mine, top }) => {
      const est = top?.grade_confidence === "estimated";
      const fill = top
        ? `<span class="fill${est ? " est" : ""}" style="width:${pctOf(top.grade_rank).toFixed(2)}%"></span>`
        : "";
      return `<div class="board-row">
        <span class="who">${m.emoji} ${esc(m.name)}</span>
        <div class="track">${fill}${medianMark}</div>
        <span class="best">${top ? `${est ? "~" : ""}${asV(top.grade_rank)}` : "—"}</span>
        <div class="chips">${mine.map((x) => chip(x.send, x.chain.name)).join("")}</div>
      </div>`;
    })
    .join("");

  return `<div class="board">
    <div class="axis">
      <span class="caption">best grade, all gyms</span>
      <div class="ticks">${ticks}</div>
      ${mid === null ? "" : `<span class="median-note">med ${asV(mid)}</span>`}
    </div>
    ${body}
  </div>${legend(state.sends)}`;
}

function viewGyms() {
  const best = personalBests();
  const cards = state.chains
    .map((c) => {
      const sys = systemOfChain(c);
      const branchesVisited = [
        ...new Set(
          state.sends
            .filter((s) => s.chain_id === c.id)
            .map((s) => byId(state.gyms, s.gym_id)?.branch)
            .filter((b): b is string => !!b),
        ),
      ].sort();
      return {
        c,
        sys,
        branchesVisited,
        climbers: state.members
          .map((m) => ({ m, send: best.get(`${m.id}:${c.id}`) }))
          .filter((x): x is { m: Member; send: Send } => !!x.send)
          .sort((a, b) => b.send.grade_rank - a.send.grade_rank),
      };
    })
    .filter((x) => x.climbers.length)
    .sort((a, b) => b.climbers.length - a.climbers.length || a.c.name.localeCompare(b.c.name));

  if (!cards.length) {
    return `<div class="empty"><strong>No gyms on the board yet</strong>
      <p>Once someone logs a send, their gym appears here with everyone's best
         on it — and the grade conversion it uses.</p></div>`;
  }

  return (
    cards
      .map(
        ({ c, sys, branchesVisited, climbers }) => `<div class="card">
      <h3>${esc(c.name)}
        <span class="sub">${esc(sys?.name ?? "?")} · ${climbers.length} climbing</span></h3>
      ${branchesVisited.length ? `<p class="sub branches">at ${esc(branchesVisited.join(", "))}</p>` : ""}
      <div class="chips">${climbers.map((x) => chip(x.send, `${x.m.emoji} ${x.m.name}`)).join("")}</div>
      ${ladder(c, sys)}
    </div>`,
      )
      .join("") + legend(state.sends)
  );
}

/** The conversion itself, on demand — this is the thing people argue about. */
function ladder(c: Chain, sys: System | undefined) {
  const grades = state.grades
    .filter((g) => g.system_id === c.system_id)
    .sort((a, b) => a.ordinal - b.ordinal);
  if (!grades.length) return "";
  const est = sys?.confidence === "estimated";
  const chips = grades
    .map(
      (g) => `<span class="chip${est ? " est" : ""}">
        <span class="dot" style="background:${g.colour ? esc(g.colour) : "var(--track)"}"></span>
        <strong>${esc(g.label)}</strong><span class="v">${asV(g.rank)}</span></span>`,
    )
    .join("");
  return `<details class="ladder">
    <summary>how ${esc(c.name)} grades convert</summary>
    <div class="chips">${chips}</div>
    ${sys?.source ? `<p class="src">${esc(sys.source)}</p>` : ""}
  </details>`;
}

function sendRow(s: Send, withActions: boolean) {
  const m = byId(state.members, s.member_id);
  const g = byId(state.gyms, s.gym_id);
  const est = s.grade_confidence === "estimated";
  const actions = withActions
    ? `<span class="actions">
         <button class="link" data-edit="${s.id}">edit</button>
         <button class="link" data-delete="${s.id}">delete</button>
       </span>`
    : "";
  return `<div class="row">
    <span class="when">${esc(shortDate(s.sent_on))}</span>
    <span class="who">${m ? `${m.emoji} ${esc(m.name)}` : "?"}</span>
    <strong>${esc(s.grade_label)}</strong>
    <span class="rank${est ? " est" : ""}">${est ? "~" : ""}${asV(s.grade_rank)}</span>
    <span class="where">at ${g ? esc(gymLabel(g)) : "?"}</span>
    ${actions}
    ${s.note ? `<span class="note">${esc(s.note)}</span>` : ""}
  </div>`;
}

/** Monday-anchored buckets: a weekly group wants to see its weeks. */
function bucketOf(sentOn: string): string {
  const day = new Date(`${sentOn}T00:00:00`);
  const now = new Date(`${today()}T00:00:00`);
  if (day.getTime() === now.getTime()) return "Today";

  const monday = new Date(now);
  monday.setDate(now.getDate() - ((now.getDay() + 6) % 7));
  if (day >= monday) return "This week";

  const lastMonday = new Date(monday);
  lastMonday.setDate(monday.getDate() - 7);
  if (day >= lastMonday) return "Last week";

  const [y, m] = sentOn.split("-");
  return `${MONTHS[Number(m) - 1]} ${y}`;
}

function viewRecent() {
  if (!state.sends.length) {
    return `<div class="empty"><strong>No sends yet</strong>
      <p>Every send anyone logs shows up here, newest first.</p></div>`;
  }
  const out: string[] = [];
  let bucket = "";
  for (const s of state.sends.slice(0, 60)) {
    const b = bucketOf(s.sent_on);
    if (b !== bucket) {
      bucket = b;
      out.push(`<p class="bucket">${esc(b)}</p>`);
    }
    out.push(sendRow(s, false));
  }
  return `<div class="card">${out.join("")}</div>`;
}

function viewMine() {
  if (state.me === null) {
    return `<div class="empty"><strong>Who are you?</strong>
      <p>Pick your name up top. You can read everything without it, but you need
         it to log a send — and you can only ever edit your own.</p></div>`;
  }
  const mine = state.sends.filter((s) => s.member_id === state.me);
  const list = mine.length
    ? `<div class="card">${mine.map((s) => sendRow(s, true)).join("")}</div>`
    : `<div class="empty"><strong>Nothing logged yet</strong>
        <p>Add your hardest send from your last session above.</p></div>`;
  return `${logForm()}${list}`;
}

function logForm() {
  const editing = state.editing !== null ? byId(state.sends, state.editing) : undefined;
  // Keep whatever branch is currently picked when the form re-renders.
  const picked = Number((document.getElementById("f-gym") as HTMLSelectElement | null)?.value);
  const gymId = editing?.gym_id ?? (picked || state.gyms[0]?.id);
  const gym = byId(state.gyms, gymId) ?? state.gyms[0];
  const chain = gym ? chainOf(gym) : undefined;
  const sys = chain ? systemOfChain(chain) : undefined;
  const ladder = state.grades
    .filter((gr) => gr.system_id === chain?.system_id)
    .sort((a, b) => a.ordinal - b.ordinal);

  // Branches grouped under their chain, because the ladder follows the chain.
  const gymOptions = state.chains
    .map((c) => {
      const branches = state.gyms.filter((g) => g.chain_id === c.id);
      const opts = branches
        .map(
          (g) =>
            `<option value="${g.id}" ${g.id === gym?.id ? "selected" : ""}>${esc(g.branch ?? c.name)}</option>`,
        )
        .join("");
      return `<optgroup label="${esc(c.name)}">${opts}</optgroup>`;
    })
    .join("");

  const gradeOptions = ladder
    .map(
      (gr) =>
        `<option value="${gr.id}" ${gr.id === editing?.grade_id ? "selected" : ""}>${esc(gr.label)} · ${asV(gr.rank)}</option>`,
    )
    .join("");

  const sysNote =
    sys?.confidence === "estimated"
      ? `<p class="sub warn wide">${esc(sys.name)} has no published V mapping — logged grades are exact,
         but the cross-gym comparison is an estimate.</p>`
      : "";

  return `<form class="log card" id="log-form">
    <h3 style="grid-column:1/-1">${editing ? "Edit send" : "Log a send"}</h3>
    <label class="wide">Where
      <select id="f-gym" name="gym_id">${gymOptions}</select>
    </label>
    <label>Grade <span class="sub">${esc(sys?.name ?? "")}</span>
      <select id="f-grade" name="grade_id">${gradeOptions}</select>
    </label>
    <label>Date
      <input type="date" id="f-date" name="sent_on" value="${editing?.sent_on ?? today()}" max="${today()}" />
    </label>
    ${sysNote}
    <label class="wide">Note <span class="sub">optional</span>
      <input type="text" id="f-note" name="note" maxlength="280"
             placeholder="slabby, took 6 goes" value="${esc(editing?.note ?? "")}" />
    </label>
    <div class="actions">
      <button class="primary" type="submit">${editing ? "Save" : "Log it"}</button>
      ${editing ? `<button type="button" id="cancel-edit">Cancel</button>` : ""}
      ${state.error ? `<span class="error">${esc(state.error)}</span>` : ""}
    </div>
  </form>`;
}

function header() {
  const me = state.me !== null ? byId(state.members, state.me) : undefined;
  const whoami = me
    ? `<span>You're <strong>${me.emoji} ${esc(me.name)}</strong></span>
       <button class="link" id="switch-me">not you?</button>`
    : `<label>I'm
         <select id="pick-me">
           <option value="">pick your name…</option>
           ${state.members.map((m) => `<option value="${m.id}">${m.emoji} ${esc(m.name)}</option>`).join("")}
         </select>
       </label>`;
  return `<header class="top">
    <h1>Climb Log <small>weekly sessions · best grade per gym · one shared scale</small></h1>
    <div class="whoami">${whoami}</div>
  </header>${stats()}`;
}

function stats() {
  if (!state.sends.length) return "";
  const people = new Set(state.sends.map((s) => s.member_id)).size;
  const chains = new Set(state.sends.map((s) => s.chain_id)).size;
  const oldest = state.sends[state.sends.length - 1]?.sent_on;
  const since = oldest ? `${MONTHS[Number(oldest.slice(5, 7)) - 1]} ${oldest.slice(0, 4)}` : "";
  return `<div class="stats">
    <span><b>${people}</b> of ${state.members.length} logging</span>
    <span><b>${state.sends.length}</b> sends</span>
    <span><b>${chains}</b> gyms</span>
    ${since ? `<span>since ${esc(since)}</span>` : ""}
  </div>`;
}

const TABS: [Tab, string][] = [
  ["board", "By person"],
  ["gyms", "By gym"],
  ["recent", "Recent"],
  ["mine", "My log"],
];

function render() {
  const bodyHtml =
    state.tab === "board" ? viewBoard()
    : state.tab === "gyms" ? viewGyms()
    : state.tab === "recent" ? viewRecent()
    : viewMine();

  app.className = "";
  app.innerHTML = `${header()}
    <nav class="tabs">
      ${TABS.map(([t, label]) => `<button data-tab="${t}" aria-current="${state.tab === t}">${label}</button>`).join("")}
    </nav>
    ${bodyHtml}`;
}

// ── events ─────────────────────────────────────────────────────────────────

async function guard(fn: () => Promise<void>) {
  try {
    state.error = "";
    await fn();
  } catch (err) {
    state.error = err instanceof Error ? err.message : String(err);
  }
  render();
}

app.addEventListener("click", (ev) => {
  const el = (ev.target as HTMLElement).closest("button");
  if (!el) return;

  if (el.dataset.tab) {
    state.tab = el.dataset.tab as Tab;
    state.editing = null;
    state.error = "";
    render();
    return;
  }
  if (el.id === "switch-me") {
    guard(async () => {
      await api("/api/session", { method: "DELETE" });
      state.me = null;
      state.editing = null;
    });
    return;
  }
  if (el.id === "cancel-edit") {
    state.editing = null;
    state.error = "";
    render();
    return;
  }
  if (el.dataset.edit) {
    state.editing = Number(el.dataset.edit);
    state.error = "";
    render();
    return;
  }
  if (el.dataset.delete) {
    const id = Number(el.dataset.delete);
    if (!confirm("Delete this send?")) return;
    guard(async () => {
      await api(`/api/sends/${id}`, { method: "DELETE" });
      state.sends = state.sends.filter((s) => s.id !== id);
      if (state.editing === id) state.editing = null;
    });
  }
});

app.addEventListener("change", (ev) => {
  const el = ev.target as HTMLElement;
  if (el.id === "pick-me") {
    const id = Number((el as HTMLSelectElement).value);
    if (!id) return;
    guard(async () => {
      await api("/api/session", { method: "POST", body: JSON.stringify({ member_id: id }) });
      state.me = id;
      state.tab = "mine";
    });
    return;
  }
  // Changing branch can change the chain, and the ladder with it.
  if (el.id === "f-gym") render();
});

app.addEventListener("submit", (ev) => {
  const form = ev.target as HTMLFormElement;
  if (form.id !== "log-form") return;
  ev.preventDefault();
  const data = new FormData(form);
  const payload = {
    gym_id: Number(data.get("gym_id")),
    grade_id: Number(data.get("grade_id")),
    sent_on: String(data.get("sent_on")),
    note: String(data.get("note") ?? ""),
  };
  const editing = state.editing;
  guard(async () => {
    if (editing !== null) {
      await api(`/api/sends/${editing}`, { method: "PATCH", body: JSON.stringify(payload) });
      state.editing = null;
    } else {
      await api("/api/sends", { method: "POST", body: JSON.stringify(payload) });
    }
    const { sends } = (await api("/api/sends")) as { sends: Send[] };
    state.sends = sends;
  });
});

guard(load);
