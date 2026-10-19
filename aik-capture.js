// Segítő – MI-beszélgetések modul: tartalomszkript – a megnyitott beszélgetés mentése (v0.5.37 · modul v0.1.6)
// v0.1.3: a KORÁBBI beszélgetések bejárása – (1) a megnyitott oldal oldalsávjában lévő beszélgetéseket / listákat jelenti a
// háttérnek (percenként, csak ha változott); (2) ha ez a lap a bejáró lapja (a háttér nyitotta), végigolvassa: a beszélgetés
// elejére görget (a korábbi részek betöltése), onnan lefelé a végéig, közben ment; listaoldalon a lista aljáig görget, és jelent.
// Csak a támogatott oldalakon fut (ChatGPT, Grok, Google AI-mód; a Gemini és a Claude a minta után). TELJESÍTMÉNY (CLAUDE.md):
// nem figyeli folyamatosan az egész oldalt – 6 másodpercenként (csak ha a lap látható) egy olcsó „aláírást” néz (a fordulók
// száma + az utolsó hossza); a teljes feldolgozás csak akkor fut, ha ez megváltozott ÉS két egymás utáni nézéskor ugyanaz
// (a válasz írása – „streaming” – befejeződött). Mentés magától csak akkor, ha az oldalnál be van kapcsolva (a modul saját
// Beállítások lapján; a Claude-nál alapból KI). Kézi mentés: a panel „Mentés most” üzenete (aik-save-now).
// Ha a modul ÖNÁLLÓ bővítményként is telepítve van, a Segítőben futó példány visszalép (ne mentsen kétszer).
(async function () {
  // v0.1.6 (LordAthis 10-19: „Nyitottak mentése” → minden lapon „az oldal még nem töltötte be a modult”): a bővítmény frissítése után
  // a régi (árva) példány jelzője ugyanabban a szkript-világban marad; eddig egy sima „true” volt, ezért az újra betöltött szkript
  // azonnal kilépett, az árva pedig már nem ér el semmit. Most a jelző azt mondja meg, él-e még a régi példány.
  if (window.__aikCapture && typeof window.__aikCapture === 'function' && window.__aikCapture()) return;
  window.__aikCapture = () => { try { return !!(chrome.runtime && chrome.runtime.id); } catch (_) { return false; } };
  const A = window.AIK, AD = window.AIK_AD;
  if (!A || !AD) return;
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const root = document.documentElement;
  const integrated = chrome.runtime.getManifest().name === 'Segítő';
  if (!integrated) root.dataset.aikOwner = 'modul';
  else {
    await sleep(1500);
    if (root.dataset.aikOwner === 'modul') {
      // az önálló AI Helper is telepítve van: ő ment és jár be – ha ez a Segítő bejárójának lapja, jelezzük, hogy itt nincs teendő
      try { const r = await chrome.runtime.sendMessage({ type: 'aik-walk-role' }); if (r && r.item) chrome.runtime.sendMessage({ type: 'aik-walk-done', res: { ok: false, error: 'az önálló AI Helper is telepítve – ezt ő menti' } }); } catch (_) { /* */ }
      return;
    }
    root.dataset.aikOwner = 'segito';
  }

  let set = null;
  const loadSet = async () => { try { set = await chrome.runtime.sendMessage({ type: 'aik-settings' }); } catch (_) { set = null; } };
  await loadSet();
  try { chrome.storage.onChanged.addListener((ch, area) => { if (area === 'local' && ch.aik_settings) loadSet(); }); } catch (_) { /* a bővítmény újratöltve */ }

  let lastSig = '', stableSig = '', lastHash = '', lastUrl = location.href;
  async function capture(manual) {
    const id = A.siteOfUrl(location.href), s = id && A.site(id);
    if (!s) return { ok: false, error: 'nem támogatott oldal' };
    if (!s.ready) return { ok: false, error: `${s.name}: a feldolgozó még nincs kész (mentett minta kell az oldalról)` };
    if (!manual && !(set && set.enabled && set.auto && set.auto[id])) return { ok: false, off: true };
    const c = AD.extract(document, location.href);
    if (!c) return { ok: false, error: 'nem találtam beszélgetést ezen az oldalon' };
    const h = A.hash(JSON.stringify(c.turns));
    if (!manual && h === lastHash) return { ok: true, same: true };
    let r;
    try { r = await chrome.runtime.sendMessage({ type: 'aik-save', conv: c }); } catch (e) { return { ok: false, error: 'a bővítmény újratöltődött – frissítsd az oldalt' }; }
    if (r && r.ok) lastHash = h;
    return r;
  }
  async function tick() {
    if (document.visibilityState !== 'visible') return;
    if (location.href !== lastUrl) { lastUrl = location.href; lastSig = stableSig = ''; lastHash = ''; }
    const sig = AD.signature(document, location.href);
    if (!sig) return;
    if (sig !== lastSig) { lastSig = sig; return; }       // változik – megvárjuk, amíg megáll
    if (sig === stableSig) return;                         // ezt már mentettük
    stableSig = sig;
    await capture(false).catch(() => {});
  }
  setInterval(() => { tick().catch(() => {}); }, 6000);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden' && lastSig && lastSig !== stableSig) { stableSig = lastSig; capture(false).catch(() => {}); } });
  // ---------- v0.1.3: a korábbi beszélgetések bejárása ----------
  const SITE = A.siteOfUrl(location.href), W = SITE && A.WALK && A.WALK[SITE];
  const clean = (t) => String(t || '').replace(/\s+/g, ' ').trim().slice(0, 160);
  // az oldalon látható beszélgetések és listák (hivatkozások; a Gemininél a kattintható sorok a címükkel)
  function collect() {
    const out = [], seen = new Set();
    if (!W) return out;
    for (const a of document.querySelectorAll('a[href]')) {
      const k = A.walkKind(SITE, a.href);
      if (!k || seen.has(k.url) || k.url === location.origin + location.pathname.replace(/\/+$/, '')) continue;
      seen.add(k.url); out.push({ ...k, title: clean(a.getAttribute('title') || a.textContent) });
    }
    // v0.1.4: a Google AI-mód előzménylistája (button[data-thread-id]) – a cím az azonosítóból (mtid) és a címből épül
    if (W.threads) {
      let au = null; try { au = new URL(location.href).searchParams.get('authuser'); } catch (_) { /* */ }
      for (const el of document.querySelectorAll(W.threads)) {
        const id = el.getAttribute('data-thread-id'); if (!id || seen.has('t:' + id)) continue;
        const tt = clean((el.querySelector(W.threadTitle) || {}).textContent || String(el.getAttribute('aria-label') || '').replace(/,\s*\d+\/\d+\.?\s*$/, ''));
        seen.add('t:' + id); out.push({ kind: 'conv', key: SITE + ':' + id, cid: id, url: A.gaiUrl(id, tt, au), title: tt });
      }
    }
    if (W.click) for (const el of document.querySelectorAll(W.click)) {
      const tt = clean((el.querySelector(W.clickTitle) || el).textContent);
      if (tt && !seen.has('c:' + tt) && !el.querySelector('a[href]')) { seen.add('c:' + tt); out.push({ kind: 'click', title: tt }); }
    }
    return out;
  }
  let lastFound = '';
  // v0.1.4: a kezdőlap a felhasználó saját fiókjával (Google: authuser) – a háttér ezt nyitja meg a következő kezdőlap-bejáráskor
  function startHint() {
    if (SITE !== 'google-ai') return null;
    let au = null; try { au = new URL(location.href).searchParams.get('authuser'); } catch (_) { /* */ }
    return W.start + (au && au !== '0' ? '&authuser=' + encodeURIComponent(au) : '');
  }
  async function report() {
    if (!W || !(set && set.enabled && set.walk && set.walk.on && set.walk.sites && set.walk.sites[SITE])) return 0;
    const items = collect(), sig = items.map(x => x.url || x.title).join('|');
    if (!items.length || sig === lastFound) return items.length;
    lastFound = sig;
    try { await chrome.runtime.sendMessage({ type: 'aik-walk-found', site: SITE, items, start: startHint() }); } catch (_) { /* a bővítmény újratöltve */ }
    return items.length;
  }
  // a legközelebbi görgethető ős (a beszélgetés vagy a lista saját görgető doboza)
  function scroller(el) {
    for (let e = el && el.parentElement; e && e !== document.body; e = e.parentElement) {
      const st = getComputedStyle(e);
      if (/(auto|scroll)/.test(st.overflowY) && e.scrollHeight > e.clientHeight + 20) return e;
    }
    return document.scrollingElement || document.documentElement;
  }
  const sig = () => AD.signature(document, location.href);
  async function waitFor(fn, ms) { const t0 = Date.now(); while (Date.now() - t0 < ms) { const v = fn(); if (v) return v; await sleep(1000); } return null; }
  // egy beszélgetés végigolvasása: fel a legelejéig (amíg újabb fordulók töltődnek be), majd le a végéig – közben ment
  async function readThrough() {
    if (!(await waitFor(sig, 30000))) return { ok: false, error: 'nem jelent meg beszélgetés az oldalon' };
    await sleep(1500);
    const selEl = document.querySelector('[data-message-author-role], [data-testid="user-message"], [data-testid="assistant-message"], user-query, model-response, [data-scope-id="turn"], [class*="group/user-bubble"], .prose');
    const box = scroller(selEl);
    let steps = 0, same = 0, prev = sig();
    await capture(true).catch(() => {});
    for (; steps < 40 && same < 3; steps++) {           // felfelé
      box.scrollTop = 0; box.dispatchEvent(new Event('scroll'));
      await sleep(1800);
      const now = sig();
      if (now === prev) same++; else { same = 0; prev = now; await capture(true).catch(() => {}); }
    }
    for (let i = 0; i < 200; i++) {                       // lefelé, képernyőnként
      const before = box.scrollTop;
      box.scrollTop = before + Math.max(200, box.clientHeight * 0.9); box.dispatchEvent(new Event('scroll'));
      await sleep(700);
      if (i % 4 === 3) await capture(true).catch(() => {});
      if (box.scrollTop <= before + 2) break;
      steps++;
    }
    const r = await capture(true).catch(e => ({ ok: false, error: e.message }));
    return { ok: !!(r && r.ok), turns: r && r.turns, error: r && !r.ok ? (r.error || 'nem sikerült menteni') : undefined, steps };
  }
  // egy listaoldal: az aljáig görget (a régebbi beszélgetések betöltése), és jelenti, amit talált.
  // v0.1.4: képernyőnként lép (nem ugrik az aljára), és GYŰJT – a virtualizált lista (Google AI-mód) mindig csak a látható
  // sorokat tartja az oldalban, ezért a végén nem lenne meg minden.
  async function readList() {
    await waitFor(() => collect().length, 20000);
    const first = collect()[0], a = first && first.url && [...document.querySelectorAll('a[href]')].find(x => (A.walkKind(SITE, x.href) || {}).url === first.url);
    const box = scroller(a || (W.threads && document.querySelector(W.threads)) || (W.click && document.querySelector(W.click)));
    const all = new Map(), add = () => { for (const x of collect()) all.set(x.key || x.url || ('c:' + x.title), x); };
    add();
    let same = 0, steps = 0;
    for (; steps < 150 && same < 3; steps++) {
      const before = box.scrollTop, n = all.size;
      box.scrollTop = before + Math.max(300, box.clientHeight * 0.8); box.dispatchEvent(new Event('scroll'));
      await sleep(1200);
      add();
      if (all.size === n && box.scrollTop <= before + 2) same++; else same = 0;
    }
    lastFound = '';
    const items = [...all.values()];
    let added = 0;
    if (items.length) { const r = await chrome.runtime.sendMessage({ type: 'aik-walk-found', site: SITE, items, start: startHint() }).catch(() => null); added = (r && r.added) || 0; }
    // v0.1.5 (LordAthis: „nincs visszajelzés, hogy mindent beolvasott-e”): hány tétel van a listán az oldal szerint
    // (virtualizált listánál aria-setsize), és a lista végéig jutott-e (az utolsó görgetések már nem hoztak újat)
    let expected = 0;
    for (const el of document.querySelectorAll('[aria-setsize]')) { const n = +el.getAttribute('aria-setsize'); if (n > expected && n < 100000) expected = n; }
    return { ok: true, found: items.length, expected: expected || null, added, atEnd: same >= 3, steps, hidden: document.visibilityState !== 'visible' };
  }
  async function walkJob(item) {
    try {
      if (item.kind === 'list') return await readList();
      if (item.kind === 'click') {
        const el = await waitFor(() => [...document.querySelectorAll(W.click)].find(e => clean((e.querySelector(W.clickTitle) || e).textContent) === item.title), 20000);
        if (!el) return { ok: false, error: 'a beszélgetés nem található a listában (törölték vagy átnevezték?)' };
        const from = location.href; (el.querySelector('a, button, [role="button"]') || el).click();
        if (!(await waitFor(() => location.href !== from, 15000))) return { ok: false, error: 'a kattintásra nem nyílt meg' };
        lastUrl = location.href; lastHash = '';
      }
      const r = await readThrough();
      return { ...r, url: SITE === 'google-ai' ? location.href : location.origin + location.pathname, title: document.title };
    } catch (e) { return { ok: false, error: e && e.message || String(e) }; }
  }
  (async () => {
    if (!W) return;
    let role = null;
    try { role = await chrome.runtime.sendMessage({ type: 'aik-walk-role' }); } catch (_) { role = null; }
    if (role && role.item) { const res = await walkJob(role.item); try { await chrome.runtime.sendMessage({ type: 'aik-walk-done', res }); } catch (_) { /* */ } return; }
    // a felhasználó saját lapja: az oldalsáv beszélgetései a sorba (betöltés után, majd percenként, ha a lap látható)
    await sleep(5000); report().catch(() => {});
    setInterval(() => { if (document.visibilityState === 'visible') report().catch(() => {}); }, 60000);
  })();

  chrome.runtime.onMessage.addListener((msg, _s, respond) => {
    if (!msg || msg.type !== 'aik-save-now') return false;
    capture(true).then(respond, (e) => respond({ ok: false, error: e && e.message || String(e) }));
    return true;
  });
})();
