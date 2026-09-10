# Climb Log

**Live:** <https://climb-log.ten-person-climb-log.workers.dev>

A ten-person bouldering tracker for a group that climbs across Singapore gyms
with incompatible grading systems.

- **One record type** — a *send*: one person, one branch, one grade, one date.
- **One shared action** — log a send. The board shows each person's best per chain.
- **One rule** — everyone can read every send; you can only edit or delete your own.

## The two ideas that make it work

**Grades belong to the chain, not the branch.** All four Boulder Movements
grade the same way, so a personal best is per *chain* and the branch is only
where it happened. `chains` owns the `system_id`; `gyms` is just a list of
branches hanging off it.

**`rank` is the shared scale.** Every gym's own label — BFF's `7`, Boulder+'s
`Blue`, Boruda's `3-kyū` — carries a number, `(V-grade + 3) × 10`. That single
column is the only reason two gyms can be compared. The +3 offset keeps the
sub-V0 bottom of gym ladders positive.

**Estimates are marked, not hidden.** `systems.confidence` is `sourced` or
`estimated`. Boulder Movement publishes no V mapping, so its ladder is
interpolated — every chip drawn from it renders dashed with a `~` prefix, and
a legend names the chain. A guess should never read as a fact.

## Running it

```sh
npm install
npm run db:reset   # apply migrations + seed reference data (local)
npm run db:demo    # optional: 19 sample sends so the board isn't empty
npm run dev        # http://localhost:5173
```

`npm run db:demo` wipes existing sends and loads `seed/demo.sql`. Delete that
file before the group starts using the app for real.

`npm run db:reset` is safe to re-run: the seed upserts, so retuning a grade
rank or renaming a member does not touch anyone's logged sends.

## Deploying to Cloudflare

Already done once; these are the steps if you ever start from a clean account.

```sh
npm run wrangler -- login      # opens a browser to authorise
npm run db:create              # prints a database_id
# paste that id into wrangler.jsonc, then regenerate types
npm run types
npm run db:migrate:remote
npm run db:seed:remote
npm run deploy
```

To ship a change after that, `npm run deploy` on its own is enough. Only re-run
the migrate/seed steps when the schema or the reference data changes.

A brand-new `workers.dev` subdomain takes a minute or two to get its TLS
certificate. Until it does, every request fails the handshake
(`SSL_ALERT_HANDSHAKE_FAILURE`) rather than returning an HTTP error — that is
normal on a first deploy and not worth debugging.

### Routing

`run_worker_first: ["/api/*"]` means only API paths invoke the Worker;
everything else is served by the asset router. Two reasons: static requests are
free and unmetered when they never reach the Worker, and the
`single-page-application` fallback only fires if the Worker is *not* the
catch-all. With a Worker catching everything, a stray path hits the Worker's own
404 instead of the app. The Worker also holds an `ASSETS` binding so its
non-API branch can serve the app if that config ever changes.

`npm run deploy` builds first, then calls `wrangler deploy`. The Vite plugin
writes its own `dist/climb_log/wrangler.json` at build time and Wrangler
redirects to it automatically — so deploy always ships the built Worker plus
the `dist/client` assets, not the TypeScript source. Check it without
deploying with `npm run wrangler -- deploy --dry-run`.

## Where the grade data came from

Nine chains are seeded. Eight ladders come from a published cross-gym
conversion table at
<https://blog.ngzhian.com/bouldering-singapore.html> — BFF `1–15`, Boulder
Planet `1–12`, Fit Bloc `1–8`, Boulder+ `White–Black` + wild-card, Lighthouse
mahjong `1–9`, Boruda `9-kyū–2-dan`, Ground Up plain V-scale, Climba
`blue/yellow/red`. Each system's `source` column records what it was derived
from.

Boulder Movement uses `1–20` then `FLUX 1–5` and publishes no V mapping, so
its ranks are a linear interpolation (`1≈V0`, `20≈V7`) and the system is
flagged `estimated`.

**Known gaps, worth an evening of checking against the actual walls:**

- Boulder Movement's whole mapping is a guess. If your group climbs mostly at
  BM, this is the one to fix first.
- One source says Fit Bloc tops out at `9`, the conversion table stops at `8`.
- Boruda's `8-kyū` and `9-kyū` are extrapolated below where the table starts.
- Branch lists go stale as outlets open and close.

Fixing one rank fixes every comparison in the app at once. Edit
`seed/seed.sql`, then `npm run db:seed`. The ten member names are still
`Member 1`…`Member 10`.

## The board

The four tabs are **By person**, **By gym**, **Recent** and **My log**.

By person is the one that matters. Every member sits on a single V0–V10 axis
with a bar drawn to their best grade anywhere, so the shared scale is something
you can see rather than something you have to work out from labels. A vertical
line on every row marks the group median, which is the cheapest way to answer
"where do I sit?" without turning it into a podium. Bars from an estimated
ladder are hatched and their number carries a `~`.

By gym flips it — everyone's best at each chain, which branches got visited,
and a collapsible **how X grades convert** showing that chain's whole ladder
with V equivalents and the note saying where the mapping came from. That
disclosure is the bit that settles arguments.

Recent groups by Today / This week / Last week / month, since the group climbs
weekly and that's the rhythm people actually think in.

## On identity

You pick your name from a list and it goes in an `HttpOnly` cookie. This is
**not authentication** — anyone who can reach the URL can claim to be anyone.
That is a deliberate trade for a group of ten who know each other, and it keeps
the interesting rule (ownership) visible instead of buried under a login flow.

What the cookie does buy: the server never trusts a `member_id` from a request
body, so the client cannot quietly post as someone else. If this ever needs to
be real, `readMemberId` in `src/worker/index.ts` is the single seam to replace.

## Layout

```
index.html            client entry
worker-configuration.d.ts  generated Env + runtime types (committed)
src/client/main.ts    the whole UI — four tabs, no framework
src/client/style.css
src/worker/index.ts   the API; the rule lives in `assertOwner`
migrations/           schema (wrangler-tracked)
seed/seed.sql         chains, branches, ladders — the part you'll edit
```

Client and Worker have incompatible globals (DOM vs the Workers runtime), so
each half has its own tsconfig. `npm run typecheck` builds both.

Worker types are generated, not hand-written: `worker-configuration.d.ts` comes
from `npm run types`, which reads the bindings out of `wrangler.jsonc`. It is
committed on purpose so a fresh clone typechecks without running Wrangler.
**Re-run `npm run types` after changing any binding** — `npm run types --
--check` tells you whether it is stale.

## Machine notes

Group policy on this machine blocks the `.exe`/`.cmd` shims npm installs, so
`npx wrangler` and `npx vite` fail with *"This program is blocked by group
policy."* Every script in `package.json` therefore calls the tool through Node
directly (`node node_modules/wrangler/bin/wrangler.js …`). Use `npm run …`
rather than the bare binaries.

`npm audit` reports 4 high advisories, all from `sharp` pulled in transitively
by `miniflare` (the local dev runtime). It is a dev-only dependency and the
only fix npm offers downgrades `@cloudflare/vite-plugin` by 52 minor versions,
so it is left as-is.
