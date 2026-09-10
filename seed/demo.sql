-- Optional sample sends, so the board has something in it while you're
-- building or demoing. Not loaded by `npm run db:seed`.
--   npm run db:demo    (local; wipes existing sends first)
--
-- Rows are written by (chain, branch, grade label) rather than by id, so this
-- keeps working if the seed's ids ever shift. D1 caps how many terms a
-- compound SELECT may have, hence the batches. Delete this file before the
-- group starts using the app for real.

DELETE FROM sends;

INSERT INTO sends (member_id, gym_id, grade_id, sent_on, note)
SELECT d.member_id, g.id, gr.id, d.sent_on, d.note
  FROM (
            SELECT 1 AS member_id, 'Boulder Movement' AS chain_name, 'Bugis' AS branch,
                 '14' AS grade_label, '2026-09-06' AS sent_on, 'so close to FLUX' AS note
  UNION ALL SELECT 1 AS member_id, 'Boulder Movement' AS chain_name, 'Tai Seng' AS branch,
                 '12' AS grade_label, '2026-08-23' AS sent_on, NULL AS note
  UNION ALL SELECT 1 AS member_id, 'BFF Climb' AS chain_name, 'Bendemeer' AS branch,
                 '11' AS grade_label, '2026-08-30' AS sent_on, 'crimpy' AS note
  UNION ALL SELECT 2 AS member_id, 'Boulder Movement' AS chain_name, 'Downtown' AS branch,
                 '9' AS grade_label, '2026-09-07' AS sent_on, NULL AS note
  UNION ALL SELECT 2 AS member_id, 'Fit Bloc' AS chain_name, 'Depot Road' AS branch,
                 '4' AS grade_label, '2026-08-16' AS sent_on, 'slab day' AS note
  ) d
  JOIN chains ch ON ch.name = d.chain_name
  JOIN gyms   g  ON g.chain_id = ch.id AND g.branch = d.branch
  JOIN grades gr ON gr.system_id = ch.system_id AND gr.label = d.grade_label;

INSERT INTO sends (member_id, gym_id, grade_id, sent_on, note)
SELECT d.member_id, g.id, gr.id, d.sent_on, d.note
  FROM (
            SELECT 3 AS member_id, 'BFF Climb' AS chain_name, 'Our Tampines Hub' AS branch,
                 '13' AS grade_label, '2026-09-05' AS sent_on, 'took 8 goes' AS note
  UNION ALL SELECT 3 AS member_id, 'Boulder Planet' AS chain_name, 'Tai Seng' AS branch,
                 '9' AS grade_label, '2026-08-29' AS sent_on, NULL AS note
  UNION ALL SELECT 3 AS member_id, 'Boulder+' AS chain_name, 'Aperia Mall' AS branch,
                 'Purple' AS grade_label, '2026-07-19' AS sent_on, NULL AS note
  UNION ALL SELECT 4 AS member_id, 'Boulder Movement' AS chain_name, 'Rochor' AS branch,
                 '7' AS grade_label, '2026-09-06' AS sent_on, 'back after a month off' AS note
  UNION ALL SELECT 5 AS member_id, 'Ground Up' AS chain_name, '' AS branch,
                 'V5' AS grade_label, '2026-09-02' AS sent_on, NULL AS note
  ) d
  JOIN chains ch ON ch.name = d.chain_name
  JOIN gyms   g  ON g.chain_id = ch.id AND g.branch = d.branch
  JOIN grades gr ON gr.system_id = ch.system_id AND gr.label = d.grade_label;

INSERT INTO sends (member_id, gym_id, grade_id, sent_on, note)
SELECT d.member_id, g.id, gr.id, d.sent_on, d.note
  FROM (
            SELECT 5 AS member_id, 'Lighthouse' AS chain_name, '' AS branch,
                 '5' AS grade_label, '2026-08-09' AS sent_on, NULL AS note
  UNION ALL SELECT 6 AS member_id, 'Boulder+' AS chain_name, 'Chevrons' AS branch,
                 'Green' AS grade_label, '2026-09-08' AS sent_on, 'proud of this one' AS note
  UNION ALL SELECT 6 AS member_id, 'BFF Climb' AS chain_name, 'Bendemeer' AS branch,
                 '12' AS grade_label, '2026-08-22' AS sent_on, NULL AS note
  UNION ALL SELECT 7 AS member_id, 'Boulder Movement' AS chain_name, 'Bugis' AS branch,
                 '5' AS grade_label, '2026-09-07' AS sent_on, 'week two' AS note
  UNION ALL SELECT 8 AS member_id, 'Boruda' AS chain_name, '' AS branch,
                 '3-kyū' AS grade_label, '2026-08-31' AS sent_on, NULL AS note
  ) d
  JOIN chains ch ON ch.name = d.chain_name
  JOIN gyms   g  ON g.chain_id = ch.id AND g.branch = d.branch
  JOIN grades gr ON gr.system_id = ch.system_id AND gr.label = d.grade_label;

INSERT INTO sends (member_id, gym_id, grade_id, sent_on, note)
SELECT d.member_id, g.id, gr.id, d.sent_on, d.note
  FROM (
            SELECT 8 AS member_id, 'Boulder Planet' AS chain_name, 'Sembawang' AS branch,
                 '8' AS grade_label, '2026-09-06' AS sent_on, NULL AS note
  UNION ALL SELECT 9 AS member_id, 'Fit Bloc' AS chain_name, 'Science Park' AS branch,
                 '6' AS grade_label, '2026-09-04' AS sent_on, 'comp route' AS note
  UNION ALL SELECT 9 AS member_id, 'Boulder Movement' AS chain_name, 'Tai Seng' AS branch,
                 '15' AS grade_label, '2026-09-09' AS sent_on, 'session best' AS note
  UNION ALL SELECT 10 AS member_id, 'Climba' AS chain_name, '' AS branch,
                 'Yellow' AS grade_label, '2026-08-15' AS sent_on, 'holiday session' AS note
  ) d
  JOIN chains ch ON ch.name = d.chain_name
  JOIN gyms   g  ON g.chain_id = ch.id AND g.branch = d.branch
  JOIN grades gr ON gr.system_id = ch.system_id AND gr.label = d.grade_label;
