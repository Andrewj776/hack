/* realdata.js: drives the existing 3D town with REAL Texas census-tract data.
   Add ONE line to index.html, just above </body>:  <script src="realdata.js"></script>
   Each block of 4 x 2 houses (the areas between roads) becomes one real census tract. */
(function () {
  // Real Census rates and how much each counts toward a neighborhood's vulnerability.
  const KEYS = [['age75', .25], ['no_car', .25], ['poverty', .2], ['alone', .15], ['limited_english', .1], ['kids', .05]];
  const CODES = ['B01003_001E', 'B01001_023E', 'B01001_024E', 'B01001_025E', 'B01001_047E', 'B01001_048E', 'B01001_049E',
    'B25044_001E', 'B25044_003E', 'B25044_010E', 'B11001_001E', 'B11001_008E', 'B17001_001E', 'B17001_002E',
    'C16002_001E', 'C16002_004E', 'C16002_007E', 'C16002_010E', 'C16002_013E', 'B11005_001E', 'B11005_002E'];
  const $ = id => document.getElementById(id);
  const pc = v => v == null ? 'n/a' : (v * 100).toFixed(1) + '%';
  let blocks = null;
  const origBuild = build, origUi = ui, origCard = card;
 
  /* ---- 1. Get real data from the Census (same numbers as fetch_texas_data.py) ---- */
  async function live(county) {
    let rows, year;
    for (year of [2024, 2023]) {
      try {
        const r = await fetch('https://api.census.gov/data/' + year + '/acs/acs5?get=NAME,' + CODES.join(',') + '&for=tract:*&in=state:48%20county:' + county);
        if (!r.ok) throw 0;
        rows = await r.json();
        break;
      } catch (e) { }
    }
    if (!rows) throw 0;
    const head = rows[0], tracts = [];
    rows.slice(1).forEach(v => {
      const r = {}; head.forEach((k, i) => { r[k] = v[i]; });
      const n = k => { const x = parseFloat(r[k]); return isNaN(x) || x < 0 ? 0 : x; };
      const g = (...ks) => ks.reduce((s, k) => s + n(k), 0);
      const rt = (a, b) => b ? +(a / b).toFixed(4) : null;
      const pop = g('B01003_001E'), hh = g('B25044_001E');
      if (!pop || !hh) return;
      tracts.push({
        geoid: r.state + r.county + r.tract, name: r.NAME.split(',')[0], pop, households: hh,
        age75: rt(g('B01001_023E', 'B01001_024E', 'B01001_025E', 'B01001_047E', 'B01001_048E', 'B01001_049E'), pop),
        no_car: rt(g('B25044_003E', 'B25044_010E'), hh), alone: rt(g('B11001_008E'), g('B11001_001E')),
        poverty: rt(g('B17001_002E'), g('B17001_001E')),
        limited_english: rt(g('C16002_004E', 'C16002_007E', 'C16002_010E', 'C16002_013E'), g('C16002_001E')),
        kids: rt(g('B11005_002E'), g('B11005_001E'))
      });
    });
    return { source: 'U.S. Census Bureau, ACS ' + year + ' 5-year estimates', tracts };
  }
 
  /* ---- 2. Choose 20 real tracts, one for each block of houses ---- */
  function use(d) {
    const T = d.tracts.filter(t => t.pop > 0);
    if (!T.length) throw 0;
    KEYS.forEach(([k]) => {
      const v = T.map(t => t[k]).filter(x => x != null).sort((a, b) => a - b);
      T.forEach(t => { t['p_' + k] = t[k] == null ? .5 : v.filter(x => x < t[k]).length / Math.max(1, v.length - 1); });
    });
    T.forEach(t => { t.vul = KEYS.reduce((s, [k, w]) => s + w * t['p_' + k], 0); });
    const sorted = T.slice().sort((a, b) => a.vul - b.vul), pick = [];
    for (let i = 0; i < 20; i++) pick.push(sorted[Math.round(i * (sorted.length - 1) / 19)]);
    const q = mul(11);
    for (let i = 19; i > 0; i--) { const j = Math.floor(q() * (i + 1)); const tmp = pick[i]; pick[i] = pick[j]; pick[j] = tmp; }
    blocks = pick;
    document.querySelector('.badge').textContent = 'Real Census neighborhoods · simulated households';
    document.querySelector('aside .note').textContent = 'Neighborhood rates are real U.S. Census estimates. Individual households, disaster damage and a few traits (medical equipment, mobility, insurance) are simulated. Risk only changes who is helped first. It never changes coverage or claim decisions, and people make the final call.';
    $('rdmsg').textContent = 'Loaded ' + T.length + ' real census tracts (' + d.source + '). 20 of them, spread from least to most vulnerable, drive the 20 blocks of houses.';
    build();
  }
 
  /* ---- 3. Rebuild each house's traits from its neighborhood's real rates ---- */
  function realize() {
    beacons.forEach(b => { world.remove(b.beam); b.rings.forEach(r => world.remove(r.rg)); });
    beacons = [];
    const q = mul(2024); // fixed seed: the same town every time, whichever disaster is picked
    H.forEach(h => {
      const t = blocks[Math.floor(h.y / 2) * 4 + Math.floor(h.x / 4)];
      const a = q() < Math.min(.6, (t.age75 || 0) * 2.2);
      const m = q() < (a ? .25 : .04), nc = q() < (t.no_car || 0), lc = q() < Math.min(.8, (t.poverty || 0) * 1.8);
      const ls = q() < (t.alone || 0), mob = q() < (a ? .3 : .05), lep = q() < (t.limited_english || 0);
      const kid = !a && q() < (t.kids || 0), uin = q() < .08 + (t.poverty || 0) * .8;
      Object.assign(h, { tr: t, a, m, nc, lc, ls, mob, lep, kid, ui: uin, age: a ? 75 + Math.floor(q() * 15) : 20 + Math.floor(q() * 55) });
      h.score = Math.round(h.dm * 50 + (a ? 10 : 0) + (m ? 16 : 0) + (mob ? 9 : 0) + (nc ? 6 : 0) + (lc ? 6 : 0) + (ls ? 6 : 0) + (lep ? 5 : 0) + (kid ? 5 : 0) + (uin ? 5 : 0));
      h.lv = h.score >= 55 ? 3 : h.score >= 40 ? 2 : h.score >= 25 ? 1 : 0;
      if (h.lv === 3) {
        const beam = new THREE.Mesh(new THREE.CylinderGeometry(.05, .05, 3.2, 8), new THREE.MeshBasicMaterial({ color: 0xff4d5a, transparent: true, opacity: .3, depthWrite: false }));
        beam.position.set(h.px, 3.4, h.pz); world.add(beam);
        const rings = [0, .5].map(o => {
          const m2 = new THREE.MeshBasicMaterial({ color: 0xff4d5a, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false });
          const rg = new THREE.Mesh(new THREE.RingGeometry(.85, 1, 32), m2);
          rg.rotation.x = -Math.PI / 2; rg.position.set(h.px, 2.9, h.pz); world.add(rg);
          return { rg, m: m2, o };
        });
        beacons.push({ i: h.i, beam, rings });
      }
    });
    S.sel = null; ring.visible = false; recolor(); dashReset();
  }
 
  /* ---- 4. Hook into the existing map ---- */
  build = function () { origBuild(); if (blocks) realize(); };
  ui = function (cnt, n) {
    origUi(cnt, n);
    const h = H[S.sel];
    if (h && h.tr && blocks) {
      const t = h.tr;
      $('det').insertAdjacentHTML('beforeend', '<p class="sub" style="margin-top:8px"><b>Real neighborhood:</b> ' + t.name + ' · ' + t.pop.toLocaleString() + ' people. Age 75+ ' + pc(t.age75) + ', no vehicle ' + pc(t.no_car) + ', lives alone ' + pc(t.alone) + ', below poverty ' + pc(t.poverty) + '. This household is simulated from those real rates.</p>');
    }
  };
  card = function (h) {
    origCard(h);
    if (h && h.tr && blocks) $('card').insertAdjacentHTML('beforeend', '<small style="margin-top:6px">Real neighborhood: ' + h.tr.name + '</small>');
  };
 
  /* ---- 5. Sidebar controls ---- */
  const css = document.createElement('style');
  css.textContent = '#rd select{font:inherit;padding:5px 8px;border-radius:8px;border:1px solid var(--line);background:var(--card);color:var(--ink)}#rd input{max-width:100%;font-size:13px}';
  document.head.appendChild(css);
  document.querySelector('aside .sub').insertAdjacentHTML('afterend',
    '<div class="det" id="rd" style="margin-top:10px"><b>Real Texas data</b>' +
    '<p class="sub" id="rdmsg">Each block of houses is one real census tract. Load a county to drive the town with real neighborhood numbers.</p>' +
    '<div class="row"><select id="rdc" aria-label="County"><option value="113">Dallas County</option><option value="085">Collin County</option><option value="121">Denton County</option><option value="439">Tarrant County</option><option value="201">Harris County</option><option value="453">Travis County</option><option value="029">Bexar County</option><option value="265">Kerr County</option></select>' +
    '<button class="chip" id="rdgo">Load from Census</button></div>' +
    '<p class="sub" style="margin-top:8px">Or choose a saved file: <input type="file" id="rdf" accept=".json" aria-label="Choose texas_tracts.json"></p></div>');
  $('rdgo').addEventListener('click', async () => {
    const b = $('rdgo'); b.disabled = true; $('rdmsg').textContent = 'Contacting the Census Bureau…';
    try { use(await live($('rdc').value)); }
    catch (e) { $('rdmsg').textContent = 'Could not load from the Census here. Run fetch_texas_data.py, then choose the file below.'; }
    b.disabled = false;
  });
  $('rdf').addEventListener('change', e => {
    const f = e.target.files[0]; if (!f) return;
    const r = new FileReader();
    r.onload = () => { try { use(JSON.parse(r.result)); } catch (x) { $('rdmsg').textContent = 'That file could not be read.'; } };
    r.readAsText(f);
  });
  fetch('texas_tracts.json').then(r => { if (!r.ok) throw 0; return r.json(); }).then(use).catch(() => { });
})();
 
