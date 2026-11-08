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

/* ===== Victim Assistance Requests ===== */

// Create a separate table for resident-submitted requests.
db.exec(`
  CREATE TABLE IF NOT EXISTS assistance_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    location TEXT NOT NULL,
    injuries TEXT NOT NULL,
    urgent_needs TEXT NOT NULL,
    communication_methods TEXT NOT NULL,
    contact_details TEXT,
    additional_details TEXT,
    status TEXT NOT NULL DEFAULT 'New',
    team TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )
`);

// Residents submit assistance requests.
app.post('/api/requests', (req, res) => {
  const {
    location,
    injuries,
    urgent_needs,
    communication_methods,
    contact_details = '',
    additional_details = ''
  } = req.body || {};

  const valid = value =>
    typeof value === 'string' &&
    value.trim().length > 0 &&
    value.length <= 2000;

  if (![location, injuries, urgent_needs, communication_methods].every(valid)) {
    return res.status(400).json({
      error: 'Location, injuries, urgent needs, and communication methods are required.'
    });
  }

  if (
    typeof contact_details !== 'string' ||
    typeof additional_details !== 'string' ||
    contact_details.length > 2000 ||
    additional_details.length > 2000
  ) {
    return res.status(400).json({ error: 'Invalid additional information.' });
  }

  const result = db.prepare(`
    INSERT INTO assistance_requests
    (location, injuries, urgent_needs, communication_methods,
     contact_details, additional_details)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    location.trim(),
    injuries.trim(),
    urgent_needs.trim(),
    communication_methods.trim(),
    contact_details.trim(),
    additional_details.trim()
  );

  res.status(201).json({
    ok: true,
    id: result.lastInsertRowid,
    message: 'Assistance request received.'
  });
});

// Responders retrieve submitted requests.
app.get('/api/requests', (req, res) => {
  const requests = db.prepare(`
    SELECT * FROM assistance_requests
    ORDER BY
      CASE WHEN status = 'Resolved' THEN 1 ELSE 0 END,
      created_at DESC,
      id DESC
  `).all();

  res.json(requests);
});

// Responders update team assignments and case statuses.
app.patch('/api/requests/:id', (req, res) => {
  const id = Number(req.params.id);
  const { team, status } = req.body || {};

  if (!Number.isSafeInteger(id) || id <= 0) {
    return res.status(400).json({ error: 'Invalid request ID.' });
  }

  if (team !== undefined && team !== null && !TEAMS.includes(team)) {
    return res.status(400).json({ error: 'Invalid team.' });
  }

  if (status !== undefined && !STATUSES.includes(status)) {
    return res.status(400).json({ error: 'Invalid status.' });
  }

  const existing = db.prepare(
    'SELECT * FROM assistance_requests WHERE id = ?'
  ).get(id);

  if (!existing) {
    return res.status(404).json({ error: 'Request not found.' });
  }

  const nextTeam = team === undefined ? existing.team : team;
  let nextStatus = status === undefined ? existing.status : status;

  if (nextTeam && nextStatus === 'New') nextStatus = 'Assigned';

  db.prepare(`
    UPDATE assistance_requests
    SET team = ?, status = ?
    WHERE id = ?
  `).run(nextTeam, nextStatus, id);

  res.json({
    ok: true,
    request: db.prepare(
      'SELECT * FROM assistance_requests WHERE id = ?'
    ).get(id)
  });
});

app.listen(process.env.PORT || 3000, () => console.log('Quiet Signal on http://localhost:' + (process.env.PORT || 3000)));
