// Segítő – MI-beszélgetések modul: a panel logikája (v0.5.30 · modul v0.1.3)
// v0.1.2: a tördelés-javítás (aik-repair.js) – ahol a modell egy kódot tartalmazó Markdown-fájlt adott (```markdown, benne
// ```powershell), és a Gemini ettől szétszedte (a fájl egy része szövegként, a szöveges válasz kódblokkban), a nézet felismeri
// („javítva” jelzés), a fájlt egyben mutatja (másolás, letöltés .md-ként, előnézet), az eredetire visszaváltható, és az export
// is a javítottat viszi.
// Lapok: Beszélgetések (keresés: szöveg, oldal, dátum, kódnyelv), Megnyitva (fordulók, változatok és összevetésük, export
// egyenként: MD / JSON / HTML / TXT / DOCX / PDF), Export (ZIP: segito-aik/<oldal>/…), Beállítások (a modul saját lapja).
/* global AIK, AIKDB, AIK_EX, AIK_FIX, SegitoUI */
(async () => {
  const $ = (id) => document.getElementById(id);
  const esc = AIK_EX.esc, SKEY = 'aik_settings';
  const fmt = (t) => t ? new Date(t).toLocaleString('hu-HU', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : '–';
  const dayOf = (c) => String(c.firstAt || new Date(c.firstSaved).toISOString()).slice(0, 10);
  const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const integrated = chrome.runtime.getManifest().name === 'Segítő';

  // ---------- oldal-ikonok (a böngésző ikontárából; ha nincs, csak a név) ----------
  const ICO = {};
  for (const s of AIK.SITES) ICO[s.id] = SegitoUI.favicon(s.home, 32).catch(() => null);
  const siteLabel = (id) => { const s = AIK.site(id); return `<span data-aik-site="${esc(id)}">${esc(s ? s.short || s.name : id)}</span>`; };
  async function icons(root) {
    for (const el of root.querySelectorAll('[data-aik-site]:not([data-done])')) {
      el.dataset.done = '1';
      const src = await ICO[el.dataset.aikSite];
      if (src && el.isConnected) el.insertAdjacentHTML('afterbegin', `<img class="site-ico sm" alt="" src="${esc(src)}">`);
    }
  }

  // ---------- lapfülek ----------
  function show(tab) {
    document.querySelectorAll('#p-nav button').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
    document.querySelectorAll('main > section').forEach(s => s.classList.toggle('active', s.id === 'tab-' + tab));
  }
  $('p-nav').addEventListener('click', (e) => { const b = e.target.closest('button[data-tab]'); if (b) { show(b.dataset.tab); if (b.dataset.tab === 'set') { loadSet(); loadWalk(); } } });

  // ---------- lista és keresés ----------
  let all = [], shown = [];
  async function load() {
    all = (await AIKDB.all('convs')).sort((a, b) => b.lastSaved - a.lastSaved);
    const langs = [...new Set(all.flatMap(c => c.langs || []))].sort();
    const fl = $('f-lang'), cur = fl.value;
    fl.innerHTML = '<option value="">Minden kódnyelv</option>' + langs.map(l => `<option value="${esc(l)}">${esc(l)}</option>`).join('');
    fl.value = langs.includes(cur) ? cur : '';
    const vers = await AIKDB.count('versions'), set = await settings();
    $('status-line').innerHTML = `${all.length.toLocaleString('hu-HU')} beszélgetés · ${vers.toLocaleString('hu-HU')} változat · utolsó mentés: ${all[0] ? fmt(all[0].lastSaved) : '–'}${set.enabled ? '' : ' · <b class="warn">a mentés KI van kapcsolva</b> (Beállítások)'}${integrated ? '' : ' · önálló modul v' + AIK.VERSION}`;
    $('n-badge').textContent = all.length || '';
    render();
  }
  function filtered() {
    const terms = norm($('q').value).split(/\s+/).filter(Boolean);
    const site = $('f-site').value, from = $('f-from').value, to = $('f-to').value, lang = $('f-lang').value, code = $('f-code').checked;
    return all.filter(c => {
      if (site && c.site !== site && !(site === 'gemini-all' && /gemini|google-ai/.test(c.site))) return false;
      const d = dayOf(c);
      if (from && d < from) return false;
      if (to && d > to) return false;
      if (lang && !(c.langs || []).includes(lang)) return false;
      if (code && !(c.langs || []).length) return false;
      if (terms.length) { const hay = c._hay || (c._hay = norm(c.title + '\n' + AIK.convText(c.turns))); if (!terms.every(t => hay.includes(t))) return false; }
      return true;
    });
  }
  function snippet(c, terms) {
    if (!terms.length) return '';
    const text = AIK.convText(c.turns), n = norm(text), i = n.indexOf(terms[0]);
    if (i < 0) return '';
    const s = Math.max(0, i - 60), part = text.slice(s, i + 140);
    let h = esc(part);
    for (const t of terms) h = h.replace(new RegExp(`(${t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'), '<mark>$1</mark>');   // (ékezet nélkül beírt szót ékezetes szövegben nem jelöl – a találat ettől még megvan)
    return `<div class="snip">${s ? '… ' : ''}${h}${i + 140 < text.length ? ' …' : ''}</div>`;
  }
  function render() {
    shown = filtered();
    const terms = norm($('q').value).split(/\s+/).filter(Boolean);
    $('count').textContent = `${shown.length} / ${all.length}`;
    $('ex-n').textContent = shown.length;
    if (!all.length) { $('list').innerHTML = `<div class="empty">Még nincs mentett beszélgetés. Nyiss meg egy beszélgetést a ChatGPT-n, a Groknál vagy a Google AI-módjában – a modul magától menti (a Beállítások lapon oldalanként kikapcsolható), vagy fent: „Nyitottak mentése”.</div>`; return; }
    if (!shown.length) { $('list').innerHTML = '<div class="empty">A keresésnek / szűrőknek egy beszélgetés sem felel meg.</div>'; return; }
    $('list').innerHTML = `<table><thead><tr><th>Oldal</th><th>Cím</th><th>Dátum</th><th>Utolsó mentés</th><th>Fordulók</th><th>Kód</th><th>Változat</th><th></th></tr></thead><tbody>${shown.slice(0, 500).map(c => `<tr class="row" data-key="${esc(c.key)}"><td>${siteLabel(c.site)}</td><td><b>${esc(c.title)}</b>${c.garbled ? ` <span class="tag warn" title="A modell a válasz tördelését elrontotta (szétesett Markdown-fájl, szöveg kódblokkban, szétszakított kód). Megnyitva a „javítva” nézet egyben mutatja és másolhatóvá teszi.">tördelés javítva</span>` : ''}${snippet(c, terms)}</td><td>${esc(dayOf(c))}</td><td>${fmt(c.lastSaved)}</td><td>${c.turnCount}</td><td>${esc((c.langs || []).join(', '))}</td><td>${c.version}</td><td style="white-space:nowrap">${c.url ? `<a href="${esc(c.url)}" target="_blank" rel="noopener" title="Megnyitás az oldalon" data-stop>↗</a> ` : ''}${SegitoUI.iconBtn('trash', 'Törlés (minden változatával)', 'data-del="' + esc(c.key) + '"')}</td></tr>`).join('')}</tbody></table>${shown.length > 500 ? `<p class="muted">Az első 500 látszik – szűkíts a keresővel.</p>` : ''}`;
    SegitoUI.cols($('list'), 'aik-list');
    icons($('list'));
  }
  ['q', 'f-from', 'f-to', 'f-lang', 'f-code', 'f-site'].forEach(id => $(id).addEventListener(id === 'q' ? 'input' : 'change', render));
  $('f-site').innerHTML = '<option value="">Minden oldal</option>' + AIK.SITES.map(s => `<option value="${esc(s.id)}">${esc(s.name)}</option>`).join('');
  $('list').addEventListener('click', async (e) => {
    if (e.target.closest('[data-stop]')) return;
    const del = e.target.closest('[data-del]');
    if (del) {
      e.stopPropagation();
      const c = all.find(x => x.key === del.dataset.del);
      if (!c || !confirm(`Törlöd ezt a beszélgetést minden változatával?\n\n${c.title}`)) return;
      await AIKDB.delConv(c.key); SegitoUI.toast('Törölve.', 'ok'); load(); return;
    }
    const tr = e.target.closest('tr[data-key]');
    if (tr) openConv(tr.dataset.key);
  });

  // ---------- egy beszélgetés ----------
  let cur = null, curVer = null, curFix = null, viewFixed = true;
  function curTurns() {   // a megjelenített / exportált fordulók (javított, ha van és azt kérik)
    const base = (curVer && curVer.turns) || cur.turns;
    if (viewFixed && curFix && curFix.garbled) return curFix.turns.map(t => ({ ...t, text: AIK_FIX.turnText(t, true) }));
    return base;
  }
  function renderTurns() {
    const turns = curTurns();
    $('turns').innerHTML = turns.map(t => `<div class="turn ${t.role}"><div class="who">${esc(AIK_EX.roleName(t.role, cur.site))}${t.at ? ' · ' + esc(String(t.at).replace('T', ' ').slice(0, 16)) : ''}${viewFixed && t.fixed ? ' <span class="tag warn" title="Ennek a válasznak a tördelését a modell elrontotta – itt a javított változat látszik (a kód egyben, a szöveg nem kódblokkban).">javítva</span>' : ''}</div>${AIK_EX.render(t.text, { copy: true })}</div>`).join('');
    SegitoUI.decorate($('turns'));
    icons($('turns'));
  }
  async function openConv(key, vn) {
    const c = await AIKDB.get('convs', key);
    if (!c) { SegitoUI.toast('Ez a beszélgetés már nincs meg.', 'warn'); return; }
    const vs = (await AIKDB.all('versions', 'conv', IDBKeyRange.only(key))).sort((a, b) => b.n - a.n);
    cur = c; curVer = vs.find(v => v.n === (vn || c.version)) || vs[0] || { n: c.version, turns: c.turns, at: c.lastSaved };
    curFix = AIK_FIX.repairConv({ site: c.site, turns: curVer.turns || c.turns });
    viewFixed = curFix.garbled;   // ha van mit javítani, alapból a javított nézet
    $('nav-view').hidden = false;
    $('view').innerHTML = `<div class="card">
      <h2>${siteLabel(c.site)} · ${esc(c.title)}</h2>
      <dl class="kv"><dt>Oldal</dt><dd>${c.url ? `<a href="${esc(c.url)}" target="_blank" rel="noopener">${esc(c.url)}</a>` : '–'}</dd><dt>Első forduló</dt><dd>${esc(c.firstAt || '–')}</dd><dt>Mentve</dt><dd>először ${fmt(c.firstSaved)}, utoljára ${fmt(c.lastSaved)}</dd><dt>Méret</dt><dd>${c.turnCount} forduló · ${c.words.toLocaleString('hu-HU')} szó${(c.langs || []).length ? ' · kód: ' + esc(c.langs.join(', ')) : ''}</dd><dt>Látható változat</dt><dd>${curVer.n}. (${fmt(curVer.at)}${curVer.n !== c.version ? ' – <b class="warn">korábbi változat</b>' : ''})</dd></dl>
      ${curFix.garbled ? `<div class="card sample-card" style="margin:0 0 10px"><b>Tördelés javítva.</b> Ebben a beszélgetésben a modell ${curFix.garbledCount} választ hibásan tördelt (a kódot tartalmazó Markdown-fájl szétesett: egy része szövegként, a szöveges válasz kódblokkban jelent meg). Itt a <b>javított</b> nézet látszik: a fájl egyben (másolható, letölthető .md-ként), a szöveg nem kódblokkban. Az export is ezt viszi. <button id="fix-toggle" class="small" type="button">Eredeti mutatása</button></div>` : ''}
      <div class="toolbar">${['md', 'json', 'html', 'txt', 'docx'].map(f => `<button data-ex="${f}" data-ico="save">${f.toUpperCase()}</button>`).join('')}<button data-ex="pdf" title="A böngésző nyomtatási ablaka nyílik – ott „Mentés PDF-ként”">PDF</button><span class="push"></span>${SegitoUI.iconBtn('trash', 'Törlés (minden változatával)', 'id="v-del"')}</div>
    </div>
    ${vs.length > 1 ? `<div class="card"><h3 style="margin-top:0">Változatok</h3><table><thead><tr><th>#</th><th>Mikor</th><th>Mi történt</th><th>Fordulók</th><th>Összevetés</th><th></th></tr></thead><tbody>${vs.map(v => `<tr><td>${v.n}.</td><td>${fmt(v.at)}${v.updatedAt && v.updatedAt !== v.at ? ` <span class="muted">(frissítve ${fmt(v.updatedAt)})</span>` : ''}</td><td>${esc(v.type)}</td><td>${v.turnCount}</td><td><label class="c"><input type="radio" name="va" value="${v.n}"${v.n === (vs[1] || {}).n ? ' checked' : ''}> A</label> <label class="c"><input type="radio" name="vb" value="${v.n}"${v.n === vs[0].n ? ' checked' : ''}> B</label></td><td><button class="small" data-ver="${v.n}">Megnézem</button></td></tr>`).join('')}</tbody></table>
      <div class="toolbar" style="margin-top:8px"><button id="v-diff">Összevetés (A → B)</button><span class="muted" id="v-diff-info"></span></div><div id="v-diff-out"></div></div>` : ''}
    <div id="turns"></div>`;
    renderTurns();
    SegitoUI.decorate($('view'));
    icons($('view'));
    show('view');
    window.scrollTo(0, 0);
  }
  $('view').addEventListener('click', async (e) => {
    const cp = e.target.closest('[data-copy]');
    if (cp) {
      const code = cp.parentElement.querySelector('code');
      const text = code ? code.textContent : '';
      try { await navigator.clipboard.writeText(text); } catch (_) { const ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); } catch (__) { /* */ } ta.remove(); }
      const o = cp.textContent; cp.textContent = 'Másolva ✓'; cp.classList.add('ok'); setTimeout(() => { cp.textContent = o; cp.classList.remove('ok'); }, 1500);
      return;
    }
    // v0.1.2: Markdown-fájl letöltése (a kódblokk tartalma, betűre) és előnézete
    const dl = e.target.closest('[data-dl]');
    if (dl && cur) {
      const pre = dl.closest('pre'), code = pre.querySelector('code').textContent;
      const all = [...$('turns').querySelectorAll('pre.code[data-lang="markdown"], pre.code[data-lang="md"]')], k = all.indexOf(pre) + 1;
      const h = (code.match(/^#{1,3}\s+(.+)$/m) || [])[1];
      const name = AIK.fileSafe(h || `${cur.title} ${k}`, 70) + '.md';
      await download(code.endsWith('\n') ? code : code + '\n', `segito-aik/${AIK_EX.folderOf(cur)}/${name}`, MIME.md);
      SegitoUI.toast(`Letöltve: ${name}`);
      return;
    }
    const pv = e.target.closest('[data-prev]');
    if (pv) {
      const pre = pv.closest('pre');
      let box = pre.nextElementSibling;
      if (box && box.classList.contains('md-prev')) { box.remove(); pv.textContent = 'Előnézet'; return; }
      box = document.createElement('div'); box.className = 'md-prev';
      box.innerHTML = AIK_EX.render(pre.querySelector('code').textContent, { copy: true });
      pre.after(box); pv.textContent = 'Előnézet bezárása';
      return;
    }
    if (e.target.closest('#fix-toggle')) {
      viewFixed = !viewFixed;
      e.target.closest('#fix-toggle').textContent = viewFixed ? 'Eredeti mutatása' : 'Javított mutatása';
      renderTurns();
      return;
    }
    const ex = e.target.closest('[data-ex]');
    if (ex && cur) return exportOne(ex.dataset.ex, ex);
    const ver = e.target.closest('[data-ver]');
    if (ver && cur) return openConv(cur.key, +ver.dataset.ver);
    if (e.target.closest('#v-del') && cur) {
      if (!confirm(`Törlöd ezt a beszélgetést minden változatával?\n\n${cur.title}`)) return;
      await AIKDB.delConv(cur.key); $('nav-view').hidden = true; cur = null; SegitoUI.toast('Törölve.', 'ok'); show('list'); load(); return;
    }
    if (e.target.closest('#v-diff') && cur) {
      const a = +(document.querySelector('input[name=va]:checked') || {}).value, b = +(document.querySelector('input[name=vb]:checked') || {}).value;
      const va = await AIKDB.get('versions', `${cur.key}#${a}`), vb = await AIKDB.get('versions', `${cur.key}#${b}`);
      if (!va || !vb) return;
      const d = AIK_EX.diff(AIK.convText(va.turns), AIK.convText(vb.turns));
      $('v-diff-info').textContent = `${a}. → ${b}.: +${d.added} sor, −${d.removed} sor (azonos eleje: ${d.same} sor)`;
      $('v-diff-out').innerHTML = d.lines.length ? `<div class="diff">${d.same ? `<div class="s">… ${d.same} azonos sor …</div>` : ''}${d.lines.map(l => `<div class="${l.t === '+' ? 'a' : l.t === '-' ? 'r' : 's'}">${l.t} ${esc(l.x)}</div>`).join('')}${d.sameEnd ? `<div class="s">… ${d.sameEnd} azonos sor …</div>` : ''}</div>` : '<p class="muted">A két változat azonos.</p>';
    }
  });

  // ---------- export ----------
  function download(bytesOrText, name, mime) {
    const blob = bytesOrText instanceof Blob ? bytesOrText : new Blob([bytesOrText], { type: mime });
    const url = URL.createObjectURL(blob);
    return new Promise((res) => chrome.downloads.download({ url, filename: name, conflictAction: 'uniquify', saveAs: false }, (id) => { setTimeout(() => URL.revokeObjectURL(url), 60e3); res(id); }))
      .catch(() => { const a = document.createElement('a'); a.href = url; a.download = name.split('/').pop(); a.click(); });
  }
  const MIME = { md: 'text/markdown;charset=utf-8', json: 'application/json', html: 'text/html;charset=utf-8', txt: 'text/plain;charset=utf-8', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' };
  const build = (f, c, turns) => f === 'md' ? AIK_EX.toMd(c, turns) : f === 'json' ? AIK_EX.toJson(c, turns) : f === 'html' ? AIK_EX.toHtml(c, turns) : f === 'txt' ? AIK_EX.toTxt(c, turns) : AIK_EX.toDocx(c, turns);
  async function exportOne(f, btn) {
    const turns = curTurns();
    if (f === 'pdf') { await chrome.tabs.create({ url: new URL(`aik-print.html?key=${encodeURIComponent(cur.key)}&v=${curVer.n}${viewFixed ? '&fix=1' : ''}`, location.href).href }); return; }
    const done = SegitoUI.busy(btn, 'Mentés…');
    await download(build(f, cur, turns), `segito-aik/${AIK_EX.folderOf(cur)}/${AIK_EX.fileName(cur, f)}`, MIME[f]);
    done();
    SegitoUI.toast(`Letöltve: Letöltések\\segito-aik\\${AIK_EX.folderOf(cur)}\\${AIK_EX.fileName(cur, f)}`, 'ok');
  }
  async function exportZip(list, btn) {
    const fm = [...document.querySelectorAll('.ex-f:checked')].map(x => x.value);
    if (!fm.length) { SegitoUI.toast('Jelölj ki legalább egy formátumot.', 'warn'); return; }
    if (!list.length) { SegitoUI.toast('Nincs mit exportálni.', 'warn'); return; }
    const done = SegitoUI.busy(btn, 'Csomagolás…');
    const fix = $('ex-fix').checked;
    const files = [], used = new Set(), idx = ['# MI-beszélgetések – tartalom', '', `Készült: ${new Date().toLocaleString('hu-HU')} · ${list.length} beszélgetés · Segítő MI-beszélgetések modul v${AIK.VERSION}${fix ? ' · a hibás tördelés kijavítva' : ''}`, '', '| Dátum | Oldal | Cím | Fordulók | Kód | Fájl |', '|---|---|---|---|---|---|'];
    for (const c of list) {
      const turns = fix ? AIK_FIX.repairConv(c).turns.map(t => ({ ...t, text: AIK_FIX.turnText(t, true) })) : c.turns;   // repairConv a nem hibás fordulókat változatlanul hagyja
      let base = `segito-aik/${AIK_EX.folderOf(c)}/${AIK_EX.fileName(c, '').replace(/\.$/, '')}`;
      for (let i = 2; used.has(base); i++) base = base.replace(/( \(\d+\))?$/, ` (${i})`);
      used.add(base);
      for (const f of fm) files.push({ name: `${base}.${f}`, data: build(f, c, turns) });
      idx.push(`| ${dayOf(c)} | ${(AIK.site(c.site) || {}).name || c.site} | ${String(c.title).replace(/\|/g, '/')} | ${c.turnCount} | ${(c.langs || []).join(', ')} | ${base.replace(/^segito-aik\//, '')}.${fm[0]} |`);
    }
    files.push({ name: 'segito-aik/tartalom.md', data: idx.join('\n') + '\n' });
    const z = AIK_EX.zip(files);
    await download(new Blob([z], { type: 'application/zip' }), `segito-aik/segito-aik-${new Date().toISOString().slice(0, 10)}.zip`);
    done();
    $('ex-info').textContent = `${list.length} beszélgetés, ${files.length} fájl, ${(z.length / 1048576).toFixed(1).replace('.', ',')} MB`;
    SegitoUI.toast(`Kész: ${list.length} beszélgetés egy ZIP-ben (Letöltések\\segito-aik).`, 'ok');
  }
  $('ex-run').addEventListener('click', (e) => exportZip(document.querySelector('input[name=ex-scope]:checked').value === 'filter' ? filtered() : all, e.currentTarget));
  $('btn-export-all').addEventListener('click', (e) => exportZip(all, e.currentTarget));

  // ---------- a nyitott beszélgetések mentése most ----------
  $('btn-save-open').addEventListener('click', async () => {
    const done = SegitoUI.busy($('btn-save-open'), 'Mentés…');
    const tabs = (await chrome.tabs.query({})).filter(t => t.url && AIK.siteOfUrl(t.url));
    let ok = 0; const bad = [];
    for (const t of tabs) {
      const r = await chrome.tabs.sendMessage(t.id, { type: 'aik-save-now' }).catch(() => null);
      if (r && r.ok) ok++; else bad.push(`${(AIK.site(AIK.siteOfUrl(t.url)) || {}).name}: ${(r && (r.error || (r.off && 'kikapcsolva'))) || 'az oldal még nem töltötte be a modult (frissítsd az oldalt)'}`);
    }
    done();
    SegitoUI.toast(!tabs.length ? 'Nincs nyitva támogatott beszélgetés (ChatGPT, Grok, Gemini, Google AI-mód, Claude).' : `${ok} beszélgetés mentve.${bad.length ? ' Nem sikerült: ' + bad.join('; ') : ''}`, !tabs.length ? 'info' : bad.length ? 'warn' : 'ok');
    load();
  });

  // ---------- beállítások (a modul saját lapja) ----------
  async function settings() {
    const s = (await chrome.storage.local.get(SKEY))[SKEY] || {};
    const auto = {}; for (const x of AIK.SITES) auto[x.id] = s.auto && typeof s.auto[x.id] === 'boolean' ? s.auto[x.id] : x.auto;
    return { enabled: s.enabled !== false, auto, versionHours: +s.versionHours >= 0 && s.versionHours !== '' && s.versionHours != null ? +s.versionHours : 6 };
  }
  async function loadSet() {
    const s = await settings();
    $('s-enabled').checked = s.enabled;
    $('s-vh').value = s.versionHours;
    $('s-sites').innerHTML = AIK.SITES.map(x => `<div class="sw"><div class="t"><b>${siteLabel(x.id)} – automatikus mentés</b><span>${x.ready ? `Kész (a ${esc(x.sample || '')}-i mentett minta alapján).` : '<b class="warn">Még nem működik:</b> ehhez az oldalhoz mentett minta kell (egy megnyitott beszélgetés, Ctrl+S → „Weboldal, teljes”).'}${x.auto ? '' : ' Alapból KI.'}</span></div><div class="ctl"><input type="checkbox" class="toggle" data-auto="${esc(x.id)}"${s.auto[x.id] ? ' checked' : ''}></div></div>`).join('');
    icons($('s-sites'));
    $('s-where').innerHTML = `${integrated ? 'A Segítő része, de az adatai <b>teljesen külön</b> vannak' : 'Önálló bővítmény'}: saját adatbázis (<code>${AIKDB.NAME}</code>), saját beállítások. Nem kerülnek a gépek közötti szinkronba, a Segítő exportjába vagy mentéseibe, és a Segítő többi része sem olvassa őket. Exportnál a böngésző Letöltések mappájában a <code>segito-aik</code> almappába kerülnek, oldalanként külön mappába. Most: ${all.length} beszélgetés, ${(await AIKDB.count('versions'))} változat.`;
  }
  $('s-save').addEventListener('click', async () => {
    const done = SegitoUI.busy($('s-save'), 'Mentés…');
    const auto = {}; document.querySelectorAll('[data-auto]').forEach(x => { auto[x.dataset.auto] = x.checked; });
    const prevS = (await chrome.storage.local.get(SKEY))[SKEY] || {};
    await chrome.storage.local.set({ [SKEY]: { ...prevS, enabled: $('s-enabled').checked, auto, versionHours: Math.min(720, Math.max(0, Math.round(+$('s-vh').value || 0))) } });
    done(); SegitoUI.toast('Mentve – a megnyitott oldalakon azonnal érvényes.', 'ok'); load();
  });
  // ---------- v0.1.3: a korábbi beszélgetések bejárása ----------
  async function loadWalk() {
    const r = await chrome.runtime.sendMessage({ type: 'aik-walk-status' }).catch(() => null);
    if (!r || !r.ok) { $('w-status').textContent = 'A háttér nem válaszolt.'; return; }
    const w = r.walk;
    $('w-on').checked = w.on; $('w-min').value = w.minutes; $('w-days').value = w.revisitDays;
    $('w-sites').innerHTML = AIK.SITES.filter(x => AIK.WALK[x.id]).map(x => `<label class="c" style="margin-left:12px"><input type="checkbox" data-walk="${esc(x.id)}"${w.sites[x.id] ? ' checked' : ''}> ${siteLabel(x.id)}</label>`).join('');
    icons($('w-sites'));
    const by = Object.entries(r.bySite).map(([k, v]) => `${esc((AIK.site(k) || {}).name || k)}: ${v}`).join(', ');
    $('w-status').innerHTML = `${w.on ? '<b class="ok">Bekapcsolva</b>' : '<b class="warn">Kikapcsolva</b>'} · a sorban: <b>${r.queue}</b>${by ? ` (${by})` : ''}${r.cur ? ` · most: <a href="${esc(r.cur.item.url)}" target="_blank" rel="noopener">${esc(r.cur.item.title || r.cur.item.url)}</a> (${fmt(r.cur.at)} óta)` : ''}${r.next && w.on ? ` · a következő: ${fmt(r.next)}` : ''}`;
    $('w-log').innerHTML = r.log.length ? `<table><thead><tr><th>Mikor</th><th>Oldal</th><th>Mit</th><th>Eredmény</th></tr></thead><tbody>${r.log.map(x => `<tr><td style="white-space:nowrap">${fmt(x.t)}</td><td>${siteLabel(x.site)}</td><td>${x.url ? `<a href="${esc(x.url)}" target="_blank" rel="noopener">${esc(x.title || x.url)}</a>` : esc(x.title || '')}${x.kind === 'list' ? ' <span class="tag">lista</span>' : ''}</td><td>${x.ok ? `<span class="ok">${x.kind === 'list' ? `${x.found || 0} tétel a listán` : `elmentve${x.turns ? ` – ${x.turns} forduló` : ''}`}</span>` : `<span class="bad">${esc(x.error || 'nem sikerült')}</span>`}</td></tr>`).join('')}</tbody></table>` : '<div class="empty">Még nem járt be semmit. Nyiss meg egy MI-oldalt (ahol be vagy jelentkezve) – az oldalsáv beszélgetései a sorba kerülnek.</div>';
    SegitoUI.cols($('w-log'), 'aik-walk');
    icons($('w-log'));
  }
  $('w-save').addEventListener('click', async () => {
    const done = SegitoUI.busy($('w-save'), 'Mentés…');
    const cur = (await chrome.storage.local.get(SKEY))[SKEY] || {}, sites = {};
    document.querySelectorAll('[data-walk]').forEach(x => { sites[x.dataset.walk] = x.checked; });
    cur.walk = { on: $('w-on').checked, minutes: Math.min(240, Math.max(2, Math.round(+$('w-min').value || 5))), revisitDays: Math.min(365, Math.max(1, Math.round(+$('w-days').value || 30))), sites };
    await chrome.storage.local.set({ [SKEY]: cur });
    done(); SegitoUI.toast('A bejárás beállításai mentve.', 'ok'); loadWalk();
  });
  $('w-now').addEventListener('click', async () => {
    const done = SegitoUI.busy($('w-now'), 'Indítás…');
    const r = await chrome.runtime.sendMessage({ type: 'aik-walk-now' }).catch(() => null);
    done();
    SegitoUI.toast(!r ? 'A háttér nem válaszolt.' : r.busy ? 'Most is dolgozik egy beszélgetésen – megvárja.' : r.empty ? 'Nincs mit bejárni (üres a sor, és a kezdőlapokat 12 órán belül már végignézte).' : r.started ? `Megnyitva (háttérlapon): ${r.started.title || r.started.url}` : 'Ki van kapcsolva.', r && r.started ? 'ok' : 'info');
    loadWalk();
  });
  $('w-clear').addEventListener('click', async () => {
    if (!confirm('Üríted a bejárás sorát? (A már mentett beszélgetések megmaradnak.)')) return;
    await chrome.runtime.sendMessage({ type: 'aik-walk-clear' }).catch(() => null);
    SegitoUI.toast('A sor ürítve.', 'ok'); loadWalk();
  });
  setInterval(() => { if (!document.hidden && $('tab-set').classList.contains('active')) loadWalk(); }, 15000);

  $('s-wipe').addEventListener('click', async () => {
    if (!confirm(`Minden mentett beszélgetést (${all.length}) és minden változatát törlöd? Ez nem vonható vissza – előtte érdemes exportálni.`)) return;
    const done = SegitoUI.busy($('s-wipe'), 'Törlés…');
    await AIKDB.clearAll(); done(); SegitoUI.toast('Minden mentett beszélgetés törölve.', 'ok'); load(); loadSet();
  });

  // a háttér mentéseire frissül (ha a panel nyitva van)
  let lastSeen = 0;
  setInterval(async () => { const r = await AIKDB.kv.get('recent', []); const t = r[0] ? r[0].t : 0; if (t !== lastSeen) { lastSeen = t; if (!document.hidden) load(); } }, 8000);
  await load();
  lastSeen = ((await AIKDB.kv.get('recent', []))[0] || {}).t || 0;
  if (location.hash === '#set') { show('set'); loadSet(); loadWalk(); }
})();
