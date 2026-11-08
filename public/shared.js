const api = (url, opts) => fetch(url, opts && { headers: { 'Content-Type': 'application/json' }, ...opts })
  .then(r => r.ok ? r.json() : Promise.reject(r));
const getScenario = () => localStorage.getItem('qs-scn') || 'flood';
const setScenario = s => localStorage.setItem('qs-scn', s);
async function mountNav(current) {
  const meta = await api('/api/scenarios');
  const tabs = [['/', 'Risk map'], ['/dashboard.html', 'Responder dashboard'], ['/triage.html', 'AI triage']];
  document.getElementById('nav').innerHTML =
    tabs.map(([h, t]) => `<a href="${h}" ${h === current ? 'aria-current="page"' : ''}>${t}</a>`).join('') +
    `<label>Disaster <select id="scnSel">${Object.entries(meta.scenarios).map(([k, n]) =>
      `<option value="${k}" ${k === getScenario() ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
     <button id="rst">Reset demo</button>`;
  document.getElementById('scnSel').onchange = e => { setScenario(e.target.value); location.reload(); };
  document.getElementById('rst').onclick = async () => { if (confirm('Clear all case changes?')) { await api('/api/reset', { method: 'POST' }); location.reload(); } };
  return meta;
}
