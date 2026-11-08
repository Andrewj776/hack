const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync(process.env.DB_PATH || 'quiet-signal.db');
db.exec('PRAGMA journal_mode = WAL');
db.exec(`
CREATE TABLE IF NOT EXISTS households (
  id INTEGER PRIMARY KEY, scenario TEXT NOT NULL, x INTEGER, y INTEGER, age INTEGER, damage REAL,
  medical INTEGER, no_car INTEGER, low_cash INTEGER, lives_alone INTEGER, mobility INTEGER,
  lep INTEGER, kids INTEGER, underinsured INTEGER);
CREATE INDEX IF NOT EXISTS idx_hh_scenario ON households(scenario);
CREATE TABLE IF NOT EXISTS cases (
  household_id INTEGER PRIMARY KEY REFERENCES households(id),
  team TEXT, status TEXT NOT NULL DEFAULT 'New', contacted INTEGER NOT NULL DEFAULT 0, updated_at TEXT);
CREATE TABLE IF NOT EXISTS activity (
  id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT NOT NULL, scenario TEXT, text TEXT NOT NULL);
`);

const mul = s => () => { s |= 0; s = s + 0x6D2B79F5 | 0; let t = Math.imul(s ^ s >>> 15, 1 | s);
  t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
const W = 14, D = 10;
const SCN = {
  flood:{n:'Flood',s:7,f:(x,y)=>Math.max(0,1-Math.abs(y-4.5-1.6*Math.sin(x/2.3))/2.6)},
  fire:{n:'Wildfire',s:21,f:(x,y)=>Math.exp(-((x-9.5)**2+(y-3.5)**2)/16)},
  hail:{n:'Hailstorm',s:42,f:(x,y)=>.2+.7*Math.max(0,Math.sin((x+y)/1.7))*(1-y/12)},
  quake:{n:'Earthquake',s:63,f:(x,y)=>Math.min(1,Math.exp(-((x-4.5)**2+(y-5)**2)/26)+.25*Math.max(0,1-Math.abs(y-(1+.7*x))/1.2))},
  tornado:{n:'Tornado',s:84,f:(x,y)=>Math.pow(Math.max(0,1-Math.abs(y-(1.2+.55*x))/1.7),1.2)},
  hurricane:{n:'Hurricane',s:105,f:(x,y)=>Math.min(1,.15+.7*Math.pow(y/(D-1),1.4)+.12*Math.sin(x/1.8))},
  winter:{n:'Winter storm',s:126,f:(x,y)=>.4+.5*Math.sin(x/2.6+1)*Math.cos(y/2.2)},
  heat:{n:'Heat wave',s:147,f:(x,y)=>.1+.75*Math.exp(-((x-3)**2+(y-6.5)**2)/22)}
};

function seed() {
  if (db.prepare('SELECT COUNT(*) n FROM households').get().n) return;
  const ins = db.prepare(`INSERT INTO households
    (scenario,x,y,age,damage,medical,no_car,low_cash,lives_alone,mobility,lep,kids,underinsured)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  db.exec('BEGIN');
  try {
    for (const [k, sc] of Object.entries(SCN)) {
      const r = mul(sc.s), r2 = mul(sc.s * 31 + 5);
      for (let y = 0; y < D; y++) for (let x = 0; x < W; x++) {
        const dm = Math.min(1, Math.max(0, sc.f(x, y) + (r() - .5) * .3));
        const age = r() < .2 ? 75 + Math.floor(r() * 15) : 20 + Math.floor(r() * 55), a = age >= 75;
        const m = r() < .1, nc = r() < .15, lc = r() < .35;
        const ls = r2() < (a ? .45 : .15), mob = r2() < (a ? .3 : .05), lep = r2() < .1,
              kid = !a && r2() < .22, ui = r2() < .2;
        ins.run(k, x, y, age, dm, +m, +nc, +lc, +ls, +mob, +lep, +kid, +ui);
      }
    }
    db.exec('COMMIT');
  } catch (e) { db.exec('ROLLBACK'); throw e; }
}
seed();
module.exports = db;
module.exports.SCENARIOS = Object.fromEntries(Object.entries(SCN).map(([k, v]) => [k, v.n]));
module.exports.GRID = { W, D };
