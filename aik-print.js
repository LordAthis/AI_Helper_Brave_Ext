// Segítő – MI-beszélgetések modul: nyomtatási nézet (PDF) (v0.5.26 · modul v0.1.0)
/* global AIKDB, AIK_EX */
(async () => {
  document.getElementById('css').textContent = AIK_EX.CSS;
  const q = new URLSearchParams(location.search), key = q.get('key'), n = +q.get('v') || 0;
  const c = key && await AIKDB.get('convs', key);
  if (!c) { document.getElementById('m').innerHTML = '<p>Ez a beszélgetés nincs meg.</p>'; return; }
  const v = n ? await AIKDB.get('versions', `${key}#${n}`) : null;
  const html = AIK_EX.toHtml(c, (v && v.turns) || c.turns);
  document.title = `${c.title} – MI-beszélgetés`;
  document.getElementById('m').innerHTML = html.replace(/^[\s\S]*<main>/, '').replace(/<\/main>[\s\S]*$/, '');
  if (q.get('noprint') !== '1') setTimeout(() => window.print(), 400);
})();
