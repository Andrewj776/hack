const express = require('express');
const db = require('./db');
const { score, level, why, WEIGHTS, LEVELS } = require('./scoring');

const app = express();
app.use(express.json());
app.use(express.static('public'));

const TEAMS = ['Alpha', 'Bravo', 'Charlie', 'Delta'];
const STATUSES = ['New', 'Assigned', 'En route', 'Resolved'];
const scn = q => (db.SCENARIOS[q] ? q : 'flood');

const shape = r => { const s = score(r);
  return { ...r, score: s, level: level(s), levelName: LEVELS[level(s)], why: why(r),
    team: r.team ?? null, status: r.status ?? 'New', contacted: !!r.contacted }; };

app.get('/api/scenarios', (_, res) => res.json({ scenarios: db.SCENARIOS, teams: TEAMS, statuses: STATUSES, grid: db.GRID }));
app.get('/api/rules', (_, res) => res.json(WEIGHTS));

app.get('/api/households', (req, res) => {
  const rows = db.prepare(`SELECT h.*, c.team, c.status, c.contacted
    FROM households h LEFT JOIN cases c ON c.household_id = h.id WHERE h.scenario = ?`).all(scn(req.query.scenario));
  res.json(rows.map(shape));
});

app.patch('/api/cases/:id', (req, res) => {
  const { team, status, contacted } = req.body || {};
  if (team != null && !TEAMS.includes(team)) return res.status(400).json({ error: 'bad team' });
  if (status != null && !STATUSES.includes(status)) return res.status(400).json({ error: 'bad status' });
  const id = +req.params.id;
  const hh = db.prepare('SELECT scenario FROM households WHERE id=?').get(id);
  if (!hh) return res.status(404).json({ error: 'not found' });
  const cur = db.prepare('SELECT * FROM cases WHERE household_id=?').get(id) || { team: null, status: 'New', contacted: 0 };
  const next = { team: team !== undefined ? team : cur.team, status: status ?? cur.status,
    contacted: contacted !== undefined ? +!!contacted : cur.contacted };
  if (next.status === 'Resolved') next.contacted = 1;
  if (next.team && next.status === 'New') next.status = 'Assigned';
  if (!next.team && team === null) next.status = 'New';
  db.prepare(`INSERT INTO cases (household_id,team,status,contacted,updated_at) VALUES (?,?,?,?,datetime('now'))
    ON CONFLICT(household_id) DO UPDATE SET team=excluded.team, status=excluded.status,
    contacted=excluded.contacted, updated_at=excluded.updated_at`).run(id, next.team, next.status, next.contacted);
  db.prepare('INSERT INTO activity (ts,scenario,text) VALUES (?,?,?)').run(new Date().toISOString(), hh.scenario,
    `Household ${100 + id}: ${next.team ? 'Team ' + next.team : 'unassigned'}, ${next.status}, ${next.contacted ? 'contacted' : 'not contacted'}`);
  res.json({ ok: true, ...next });
});

app.get('/api/activity', (req, res) =>
  res.json(db.prepare('SELECT * FROM activity WHERE scenario=? ORDER BY id DESC LIMIT 20').all(scn(req.query.scenario))));

app.post('/api/reset', (_, res) => { db.exec('DELETE FROM cases; DELETE FROM activity;'); res.json({ ok: true }); });

app.listen(process.env.PORT || 3000, () => console.log('Quiet Signal on http://localhost:' + (process.env.PORT || 3000)));
