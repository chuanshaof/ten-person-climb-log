-- Reference data: the ten, the chains, their branches, and their grade ladders.
--
-- Re-runnable and non-destructive: every insert upserts, so you can retune a
-- rank or rename a member and re-run without touching anybody's logged sends.
--   npm run db:seed          (local)
--   npm run db:seed:remote   (production)
--
-- `rank` = (V-grade + 3) x 10.  V1 = 40, V5 = 80, V8 = 110.
-- The +3 offset exists so the sub-V0 bottom of gym ladders stays positive.
--
-- Most ladders below come from a published cross-gym conversion table
-- (blog.ngzhian.com/bouldering-singapore.html). Those systems are marked
-- confidence='sourced'. Boulder Movement publishes no V mapping at all, so
-- its ladder is confidence='estimated' and the app shows those comparisons
-- dashed. Correcting an estimate is a one-line edit here.
--
-- !! The ten member names are still placeholders.

-- ── the ten ────────────────────────────────────────────────────────────────
INSERT INTO members (id, name, emoji) VALUES
  (1,  'Member 1',  '🧗'),
  (2,  'Member 2',  '🐒'),
  (3,  'Member 3',  '🦎'),
  (4,  'Member 4',  '🪨'),
  (5,  'Member 5',  '🐢'),
  (6,  'Member 6',  '🐙'),
  (7,  'Member 7',  '🦍'),
  (8,  'Member 8',  '🐈'),
  (9,  'Member 9',  '🦔'),
  (10, 'Member 10', '🐝')
ON CONFLICT(id) DO UPDATE SET name = excluded.name, emoji = excluded.emoji;

-- ── grading systems (one per chain) ────────────────────────────────────────
INSERT INTO systems (id, name, confidence, source) VALUES
  ('bm',       'BM grades 1–20 + FLUX',   'estimated',
   'BM publishes no V mapping. Linear interpolation: 1≈V0, 20≈V7, FLUX above.'),
  ('bff',      'BFF 1–15',                'sourced',
   'Conversion table: 1/2=V1 … 15=V8. Odd/even pairs split the half-grade.'),
  ('planet',   'Boulder Planet 1–12',     'sourced',
   'Conversion table: 4=V1 … 12=V9. Grades 1–3 sit below V1.'),
  ('fitbloc',  'Fit Bloc 1–8',            'sourced',
   'Conversion table: 1=V1 … 8=V8. One source says the ladder tops out at 9 — check.'),
  ('plus',     'Boulder+ colours',        'sourced',
   'Conversion table: white=V1 … black=V8, plus a wild-card above.'),
  ('lighthouse','Lighthouse mahjong 1–9', 'sourced',
   'Conversion table: mahjong tile n ≈ Vn.'),
  ('boruda',   'Boruda kyū/dan',          'sourced',
   'Conversion table: 7Q=V1 … 1Q=V7, 1D=V8, 2D=V9. 8Q/9Q extrapolated below.'),
  ('v',        'V-scale',                 'sourced',
   'Gyms that set in V-grades directly.'),
  ('climba',   'Climba blue/yellow/red',  'sourced',
   'Conversion table: blue=V1–V2, yellow=V3–V4, red=V5–V7. Ranks are band midpoints.')
ON CONFLICT(id) DO UPDATE SET
  name = excluded.name, confidence = excluded.confidence, source = excluded.source;

-- ── ladders ────────────────────────────────────────────────────────────────

-- Boulder Movement: 1–20 then FLUX 1–5. ESTIMATED — no published V mapping.
INSERT INTO grades (system_id, label, rank, ordinal, colour) VALUES
  ('bm', '1',  30,  1,  NULL), ('bm', '2',  34,  2,  NULL),
  ('bm', '3',  37,  3,  NULL), ('bm', '4',  41,  4,  NULL),
  ('bm', '5',  45,  5,  NULL), ('bm', '6',  48,  6,  NULL),
  ('bm', '7',  52,  7,  NULL), ('bm', '8',  56,  8,  NULL),
  ('bm', '9',  59,  9,  NULL), ('bm', '10', 63,  10, NULL),
  ('bm', '11', 67,  11, NULL), ('bm', '12', 71,  12, NULL),
  ('bm', '13', 74,  13, NULL), ('bm', '14', 78,  14, NULL),
  ('bm', '15', 82,  15, NULL), ('bm', '16', 85,  16, NULL),
  ('bm', '17', 89,  17, NULL), ('bm', '18', 93,  18, NULL),
  ('bm', '19', 96,  19, NULL), ('bm', '20', 100, 20, NULL),
  ('bm', 'FLUX 1', 105, 21, NULL), ('bm', 'FLUX 2', 110, 22, NULL),
  ('bm', 'FLUX 3', 116, 23, NULL), ('bm', 'FLUX 4', 122, 24, NULL),
  ('bm', 'FLUX 5', 130, 25, NULL),

  -- BFF: 1/2=V1, 3/4=V2 … 15=V8.
  ('bff', '1',  40,  1,  NULL), ('bff', '2',  45,  2,  NULL),
  ('bff', '3',  50,  3,  NULL), ('bff', '4',  55,  4,  NULL),
  ('bff', '5',  60,  5,  NULL), ('bff', '6',  65,  6,  NULL),
  ('bff', '7',  70,  7,  NULL), ('bff', '8',  75,  8,  NULL),
  ('bff', '9',  80,  9,  NULL), ('bff', '10', 85,  10, NULL),
  ('bff', '11', 90,  11, NULL), ('bff', '12', 95,  12, NULL),
  ('bff', '13', 100, 13, NULL), ('bff', '14', 105, 14, NULL),
  ('bff', '15', 110, 15, NULL),

  -- Boulder Planet: 4=V1 … 12=V9.
  ('planet', '1',  10,  1,  NULL), ('planet', '2',  20,  2,  NULL),
  ('planet', '3',  30,  3,  NULL), ('planet', '4',  40,  4,  NULL),
  ('planet', '5',  50,  5,  NULL), ('planet', '6',  60,  6,  NULL),
  ('planet', '7',  70,  7,  NULL), ('planet', '8',  80,  8,  NULL),
  ('planet', '9',  90,  9,  NULL), ('planet', '10', 100, 10, NULL),
  ('planet', '11', 110, 11, NULL), ('planet', '12', 120, 12, NULL),

  -- Fit Bloc: 1=V1 … 8=V8.
  ('fitbloc', '1', 40,  1, NULL), ('fitbloc', '2', 50,  2, NULL),
  ('fitbloc', '3', 60,  3, NULL), ('fitbloc', '4', 70,  4, NULL),
  ('fitbloc', '5', 80,  5, NULL), ('fitbloc', '6', 90,  6, NULL),
  ('fitbloc', '7', 100, 7, NULL), ('fitbloc', '8', 110, 8, NULL),

  -- Boulder+: white=V1 … black=V8, wild-card above.
  ('plus', 'White',     40,  1, '#e8e8e8'),
  ('plus', 'Yellow',    50,  2, '#f2c94c'),
  ('plus', 'Red',       60,  3, '#eb5757'),
  ('plus', 'Blue',      70,  4, '#2f80ed'),
  ('plus', 'Purple',    80,  5, '#9b51e0'),
  ('plus', 'Green',     90,  6, '#27ae60'),
  ('plus', 'Pink',      100, 7, '#f178b6'),
  ('plus', 'Black',     110, 8, '#333333'),
  ('plus', 'Wild-card', 120, 9, NULL),

  -- Lighthouse: mahjong tile n ≈ Vn.
  ('lighthouse', '1', 40,  1, NULL), ('lighthouse', '2', 50,  2, NULL),
  ('lighthouse', '3', 60,  3, NULL), ('lighthouse', '4', 70,  4, NULL),
  ('lighthouse', '5', 80,  5, NULL), ('lighthouse', '6', 90,  6, NULL),
  ('lighthouse', '7', 100, 7, NULL), ('lighthouse', '8', 110, 8, NULL),
  ('lighthouse', '9', 120, 9, NULL),

  -- Boruda: 7Q=V1 … 2D=V9. 9Q/8Q extrapolated below the table.
  ('boruda', '9-kyū', 20,  1,  NULL), ('boruda', '8-kyū', 30,  2,  NULL),
  ('boruda', '7-kyū', 40,  3,  NULL), ('boruda', '6-kyū', 50,  4,  NULL),
  ('boruda', '5-kyū', 60,  5,  NULL), ('boruda', '4-kyū', 70,  6,  NULL),
  ('boruda', '3-kyū', 80,  7,  NULL), ('boruda', '2-kyū', 90,  8,  NULL),
  ('boruda', '1-kyū', 100, 9,  NULL), ('boruda', '1-dan', 110, 10, NULL),
  ('boruda', '2-dan', 120, 11, NULL),

  -- Plain V-scale.
  ('v', 'VB',  20,  1,  NULL), ('v', 'V0',  30,  2,  NULL),
  ('v', 'V1',  40,  3,  NULL), ('v', 'V2',  50,  4,  NULL),
  ('v', 'V3',  60,  5,  NULL), ('v', 'V4',  70,  6,  NULL),
  ('v', 'V5',  80,  7,  NULL), ('v', 'V6',  90,  8,  NULL),
  ('v', 'V7',  100, 9,  NULL), ('v', 'V8',  110, 10, NULL),
  ('v', 'V9',  120, 11, NULL), ('v', 'V10', 130, 12, NULL),

  -- Climba: three broad bands, ranked at the band midpoint.
  ('climba', 'Blue',   45, 1, '#2f80ed'),
  ('climba', 'Yellow', 65, 2, '#f2c94c'),
  ('climba', 'Red',    90, 3, '#eb5757')
ON CONFLICT(system_id, label) DO UPDATE SET
  rank = excluded.rank, ordinal = excluded.ordinal, colour = excluded.colour;

-- ── chains ─────────────────────────────────────────────────────────────────
-- The ladder belongs here, not to the branch: all four BMs grade the same way.
INSERT INTO chains (id, name, system_id) VALUES
  (1, 'Boulder Movement', 'bm'),
  (2, 'BFF Climb',        'bff'),
  (3, 'Boulder Planet',   'planet'),
  (4, 'Fit Bloc',         'fitbloc'),
  (5, 'Boulder+',         'plus'),
  (6, 'Lighthouse',       'lighthouse'),
  (7, 'Boruda',           'boruda'),
  (8, 'Ground Up',        'v'),
  (9, 'Climba',           'climba')
ON CONFLICT(id) DO UPDATE SET name = excluded.name, system_id = excluded.system_id;

-- ── branches ───────────────────────────────────────────────────────────────
-- '' branch = the chain has one location. Add or delete rows freely.
INSERT INTO gyms (chain_id, branch) VALUES
  (1, 'Downtown'),   (1, 'Tai Seng'), (1, 'Rochor'), (1, 'Bugis'),
  (2, 'Bendemeer'),  (2, 'Our Tampines Hub'), (2, 'yo:HA Tampines'),
  (3, 'Tai Seng'),   (3, 'Sembawang'),
  (4, 'Science Park'), (4, 'Depot Road'),
  (5, 'Aperia Mall'), (5, 'Chevrons'),
  (6, ''),
  (7, ''),
  (8, ''),
  (9, '')
ON CONFLICT(chain_id, branch) DO NOTHING;
