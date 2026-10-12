// Segítő – MI-beszélgetések modul: nyomtatási nézet (PDF) (v0.5.28 · modul v0.1.2)
/* global AIKDB, AIK_EX, AIK_FIX */
(async () => {
  document.getElementById('css').textContent = AIK_EX.CSS;
  const q = new URLSearchParams(location.search), key = q.get('key'), n = +q.get('v') || 0;
  const c = key && await AIKDB.get('convs', key);
  if (!c) { document.getElementById('m').innerHTML = '<p>Ez a beszélgetés nincs meg.</p>'; return; }
  const v = n ? await AIKDB.get('versions', `${key}#${n}`) : null;
  let turns = (v && v.turns) || c.turns;
  if (q.get('fix') === '1' && AIK_FIX) turns = AIK_FIX.repairConv({ site: c.site, turns }).turns.map(t => ({ ...t, text: AIK_FIX.turnText(t, true) }));   // v0.1.2: javított tördelés
  const html = AIK_EX.toHtml(c, turns);
  document.title = `${c.title} – MI-beszélgetés`;
  document.getElementById('m').innerHTML = html.replace(/^[\s\S]*<main>/, '').replace(/<\/main>[\s\S]*$/, '');
  if (q.get('noprint') !== '1') setTimeout(() => window.print(), 400);
})();
