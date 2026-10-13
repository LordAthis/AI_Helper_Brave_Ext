// Segítő – MI-beszélgetések modul: háttér (mentés, változatok) (v0.5.30 · modul v0.1.3)
// A Segítő háttere (background/service-worker.js) és az önálló modul háttere (aik-sw.js) is ezt tölti be. Csak a saját,
// „aik-” kezdetű üzeneteire válaszol – a Segítő többi üzenetéhez nem nyúl.
(function (g) {
  if (g.AIK_BG) return;
  const A = g.AIK, D = g.AIKDB;
  const SKEY = 'aik_settings';
  // beállítások (chrome.storage.local „aik_settings” – a modul saját kulcsa; a Segítő beállítás-mentése nem viszi)
  async function settings() {
    let s = {};
    try { s = (await chrome.storage.local.get(SKEY))[SKEY] || {}; } catch (_) { /* nincs tároló */ }
    const auto = {};
    for (const x of A.SITES) auto[x.id] = s.auto && typeof s.auto[x.id] === 'boolean' ? s.auto[x.id] : x.auto;
    // v0.1.3: a korábbi beszélgetések bejárása – alapból BE, 5 percenként egy; oldalanként az automatikus mentéssel együtt
    const w = s.walk || {}, wsites = {};
    for (const x of A.SITES) wsites[x.id] = !!A.WALK[x.id] && (w.sites && typeof w.sites[x.id] === 'boolean' ? w.sites[x.id] : !!auto[x.id]);
    const walk = { on: w.on !== false, minutes: Math.min(240, Math.max(2, +w.minutes || 5)), revisitDays: Math.min(365, Math.max(1, +w.revisitDays || 30)), sites: wsites };
    return { enabled: s.enabled !== false, auto, versionHours: Math.min(720, Math.max(0, +s.versionHours >= 0 ? +s.versionHours : 6)), walk };
  }

  // Két mentés összefésülése. A ChatGPT és a Grok hosszú beszélgetésnél csak egy „ablakot” tart az oldalban (a régebbi
  // fordulók kiesnek) – ezért ahol az üzenetnek van azonosítója (mid), ott az új mentés NEM írja felül a régit, hanem
  // beleilleszti a fordulóit: ami eddig is megvolt, frissül; ami új, a helyére kerül; ami most nem látszik, megmarad.
  const isPrefix = (a, b) => a.length <= b.length && a.every((x, i) => x.role === b[i].role && (x.text === b[i].text || (i === a.length - 1 && b[i].text.startsWith(x.text))));
  function merge(prev, next) {
    if (!prev || !prev.length) return { turns: next, edited: false, added: next.length };
    if (!next.every(x => x.mid) || !prev.every(x => x.mid)) return { turns: next, edited: !isPrefix(prev, next), added: Math.max(0, next.length - prev.length) };
    const out = prev.map(x => ({ ...x })), pos = new Map(out.map((x, i) => [x.mid, i]));
    let edited = false, added = 0, anchor = -1;
    // ha az új „ablak” eleje még ismeretlen: ha később van benne ismert forduló, az ismeretlenek AZ ELÉ kerülnek; ha egyáltalán
    // nincs átfedés, az újak a végére (a beszélgetés előre nő)
    const firstKnown = next.find(x => pos.has(x.mid));
    if (!firstKnown) anchor = out.length - 1;
    else anchor = pos.get(firstKnown.mid) - 1;
    for (const x of next) {
      if (pos.has(x.mid)) {
        const i = pos.get(x.mid);
        if (out[i].text !== x.text) { if (!(i === out.length - 1 && x.text.startsWith(out[i].text))) edited = true; out[i] = { ...out[i], ...x }; }
        anchor = i;
      } else {
        out.splice(anchor + 1, 0, { ...x });
        for (const [k, v] of pos) if (v > anchor) pos.set(k, v + 1);
        pos.set(x.mid, anchor + 1); anchor++; added++;
      }
    }
    return { turns: out, edited, added };
  }

  async function save(c) {
    const set = await settings();
    if (!set.enabled) return { ok: false, off: true };
    if (!c || !c.site || !c.cid || !Array.isArray(c.turns) || !c.turns.length) return { ok: false, error: 'üres beszélgetés' };
    const key = `${c.site}:${c.cid}`, t = Date.now();
    const turns = c.turns.map(x => ({ role: x.role === 'user' ? 'user' : 'assistant', text: String(x.text || ''), at: x.at || null, mid: x.mid || null })).filter(x => x.text);
    const prev = await D.get('convs', key);
    const m = merge(prev && prev.turns, turns);
    const text = A.convText(m.turns), h = A.hash(text);
    if (prev && prev.hash === h) {
      prev.lastSeen = t; if (c.title && !prev.title) prev.title = c.title;
      await D.put('convs', prev);
      return { ok: true, same: true, key, n: prev.version };
    }
    const type = !prev ? 'új' : m.edited ? 'változott' : 'bővült';
    let n = prev ? prev.version || 1 : 1;
    const last = prev ? await D.get('versions', `${key}#${n}`) : null;
    // csak bővült (új forduló, vagy a válasz befejeződött) és a legutóbbi változat friss → a legutóbbi változat frissül;
    // különben (szerkesztett / újragenerált válasz, vagy régi változat) új változat keletkezik
    if (prev && !(type === 'bővült' && last && t - last.at < set.versionHours * 3600e3)) n++;
    const firstAt = (m.turns.find(x => x.at) || {}).at || (prev && prev.firstAt) || new Date(t).toISOString();
    // v0.1.2: elrontott-e a modell a tördelést (```markdown-ba zárt szöveges válasz)? – a listában jelző, a nézetben javítható
    const gb = (g.AIK_FIX && g.AIK_FIX.scan({ turns: m.turns })) || { garbled: false, turns: [] };
    const conv = {
      key, site: c.site, cid: c.cid, title: c.title || (prev && prev.title) || (m.turns[0].text.slice(0, 80)), url: c.url || (prev && prev.url) || '',
      turns: m.turns, hash: h, words: A.words(text), langs: A.langsOf(text), turnCount: m.turns.length, garbled: gb.garbled, garbledTurns: gb.turns.length,
      firstSaved: prev ? prev.firstSaved : t, lastSaved: t, lastSeen: t, firstAt, version: n, versions: Math.max(n, (prev && prev.versions) || 0)
    };
    await D.tx(['convs', 'versions'], 'readwrite', (tx) => {
      tx.objectStore('convs').put(conv);
      tx.objectStore('versions').put({ key: `${key}#${n}`, conv: key, n, at: last && last.n === n ? last.at : t, updatedAt: t, type: last && last.n === n ? last.type : type, turns: m.turns, hash: h, turnCount: m.turns.length });
    });
    const recent = (await D.kv.get('recent', [])).filter(x => x.key !== key);
    recent.unshift({ key, t, type, title: conv.title, site: c.site });
    await D.kv.set('recent', recent.slice(0, 50));
    return { ok: true, key, type, n, turns: m.turns.length };
  }

  async function status() {
    const set = await settings();
    return { ok: true, enabled: set.enabled, auto: set.auto, convs: await D.count('convs'), versions: await D.count('versions'), recent: (await D.kv.get('recent', [])).slice(0, 5), version: A.VERSION };
  }

  // ---------- v0.1.3: a korábbi beszélgetések bejárása (LordAthis kérése) ----------
  // Az MI-oldalak oldalsávjában / listaoldalán (projekt, könyvtár) lévő beszélgetéseket a modul magától is megnyitja és végigolvassa:
  // percenként NEM, hanem lassan – alapból 5 percenként EGYET –, egy háttérlapon (nem veszi el a fókuszt), ami a végén bezárul.
  //   – a sor (kv „walkq”): a felhasználó megnyitott oldalairól és a bejárt listaoldalakról gyűlik (aik-capture.js → aik-walk-found);
  //   – kimarad, amit revisitDays napon belül már bejárt vagy elmentett;
  //   – egyszerre egy lap; 4 perc után (beragadt) bezárja, és még egyszer megpróbálja;
  //   – a napló (kv „walklog”) a modul Beállítások lapján látszik.
  const ALARM = 'aik-walk', CUR = 'walkcur', Q = 'walkq', SEEN = 'walkseen', LOG = 'walklog', STARTS = 'walkstart';
  const now = () => Date.now();
  let walkChain = Promise.resolve();
  const serial = (fn) => { const p = walkChain.then(fn, fn); walkChain = p.catch(() => {}); return p; };
  async function walkLog(rec) { const l = await D.kv.get(LOG, []); l.unshift({ t: now(), ...rec }); await D.kv.set(LOG, l.slice(0, 200)); }
  async function armWalk() {
    const set = await settings();
    try {
      if (!set.enabled || !set.walk.on) { await chrome.alarms.clear(ALARM); return; }
      const a = await chrome.alarms.get(ALARM);
      if (!a || a.periodInMinutes !== set.walk.minutes) chrome.alarms.create(ALARM, { delayInMinutes: 1, periodInMinutes: set.walk.minutes });
    } catch (_) { /* nincs alarms jogosultság */ }
  }
  // a már elmentett beszélgetések címe → utolsó mentés (2 percig gyorsítótárban – a lista a felhasználó lapjairól percenként jön)
  let savedCache = { t: 0, map: null };
  async function savedUrls(site) {
    if (!savedCache.map || now() - savedCache.t > 120e3) {
      const map = new Map();
      for (const c of await D.all('convs')) if (c.url) map.set(c.site + '|' + String(c.url).split(/[?#]/)[0].replace(/\/+$/, ''), c.lastSaved || 0);
      savedCache = { t: now(), map };
    }
    return { has: (u) => savedCache.map.has(site + '|' + u), get: (u) => savedCache.map.get(site + '|' + u) };
  }
  // a talált beszélgetések / listák a sorba (ami még nincs bent, és nem járt nemrég)
  function addFound(site, items) {
    return serial(async () => {
      const set = await settings();
      if (!set.enabled || !set.walk.on || !set.walk.sites[site] || !Array.isArray(items) || !items.length) return { ok: true, added: 0 };
      const q = await D.kv.get(Q, []), seen = await D.kv.get(SEEN, {}), t = now(), keep = set.walk.revisitDays * 864e5;
      const inQ = new Set(q.map(x => x.key));
      const saved = await savedUrls(site);
      let added = 0;
      for (const it of items.slice(0, 500)) {
        const kind = it.kind === 'list' ? 'list' : it.kind === 'click' ? 'click' : 'conv';
        const key = kind === 'click' ? `${site}:click:${String(it.title || '').slice(0, 120)}` : String(it.url || '');
        if (!key || inQ.has(key)) continue;
        if (kind === 'conv' && ((seen[key] && t - seen[key] < keep) || (saved.has(key) && t - saved.get(key) < keep))) continue;
        if (kind === 'list' && seen[key] && t - seen[key] < 12 * 3600e3) continue;
        if (kind === 'click' && seen[key] && t - seen[key] < keep) continue;
        q.push({ key, site, kind, url: kind === 'click' ? A.WALK[site].start : key, title: String(it.title || '').slice(0, 160), added: t, tries: 0 });
        inQ.add(key); added++;
      }
      if (added) await D.kv.set(Q, q.slice(-5000));
      return { ok: true, added, queue: q.length };
    });
  }
  // a következő teendő: előbb a beszélgetések (a régebben felvett elöl), utána a listák; ha üres, az oldal kezdőlapja (12 óránként)
  async function pick(set) {
    const q = await D.kv.get(Q, []), on = (x) => set.walk.sites[x.site];
    let i = q.findIndex(x => on(x) && x.kind !== 'list');
    if (i < 0) i = q.findIndex(x => on(x));
    if (i >= 0) { const it = q.splice(i, 1)[0]; await D.kv.set(Q, q); return it; }
    const starts = await D.kv.get(STARTS, {}), t = now();
    for (const id of Object.keys(A.WALK)) if (set.walk.sites[id] && t - (starts[id] || 0) > 12 * 3600e3) { starts[id] = t; await D.kv.set(STARTS, starts); return { key: A.WALK[id].start, site: id, kind: 'list', url: A.WALK[id].start, start: true, tries: 0 }; }
    return null;
  }
  async function closeTab(id) { try { await chrome.tabs.remove(id); } catch (_) { /* már bezárult */ } }
  function walkStep(manual) {
    return serial(async () => {
      const set = await settings();
      if (!set.enabled || (!set.walk.on && !manual)) return { ok: false, off: true };
      const cur = await D.kv.get(CUR, null), t = now();
      if (cur) {
        let alive = false; try { alive = !!(await chrome.tabs.get(cur.tabId)); } catch (_) { alive = false; }
        if (alive && t - cur.at < 4 * 60e3) return { ok: true, busy: true, cur };
        if (alive) await closeTab(cur.tabId);
        await walkLog({ site: cur.item.site, url: cur.item.url, title: cur.item.title, ok: false, error: alive ? 'nem végzett 4 percen belül – bezártam' : 'a lap bezárult' });
        if ((cur.item.tries || 0) < 1) { const q = await D.kv.get(Q, []); q.push({ ...cur.item, tries: (cur.item.tries || 0) + 1 }); await D.kv.set(Q, q); }
        await D.kv.set(CUR, null);
      }
      const item = await pick(set);
      if (!item) return { ok: true, empty: true };
      let tab = null;
      try { tab = await chrome.tabs.create({ url: item.url, active: false }); }
      catch (e) { await walkLog({ site: item.site, url: item.url, ok: false, error: 'a lap nem nyitható meg: ' + (e.message || e) }); return { ok: false }; }
      await D.kv.set(CUR, { tabId: tab.id, item, at: t });
      return { ok: true, started: item };
    });
  }
  async function walkDone(tabId, res) {
    return serial(async () => {
      const cur = await D.kv.get(CUR, null);
      if (!cur || cur.tabId !== tabId) return { ok: false };
      const seen = await D.kv.get(SEEN, {}), t = now();
      seen[cur.item.key] = t; if (res && res.url) seen[String(res.url).split(/[?#]/)[0].replace(/\/+$/, '')] = t;
      const ks = Object.keys(seen); if (ks.length > 20000) for (const k of ks.sort((a, b) => seen[a] - seen[b]).slice(0, ks.length - 20000)) delete seen[k];
      await D.kv.set(SEEN, seen);
      await D.kv.set(CUR, null);
      await closeTab(tabId);
      await walkLog({ site: cur.item.site, url: (res && res.url) || cur.item.url, title: (res && res.title) || cur.item.title, kind: cur.item.kind, ok: !!(res && res.ok), turns: res && res.turns, found: res && res.found, steps: res && res.steps, error: res && res.error, ms: t - cur.at });
      return { ok: true };
    });
  }
  async function walkStatus() {
    const set = await settings(), q = await D.kv.get(Q, []), by = {};
    for (const x of q) by[x.site] = (by[x.site] || 0) + 1;
    let next = null; try { const a = await chrome.alarms.get(ALARM); next = a ? a.scheduledTime : null; } catch (_) { /* */ }
    return { ok: true, walk: set.walk, queue: q.length, bySite: by, cur: await D.kv.get(CUR, null), log: (await D.kv.get(LOG, [])).slice(0, 60), next };
  }
  try {
    chrome.alarms.onAlarm.addListener((a) => { if (a.name === ALARM) walkStep(false).catch(() => {}); });
    chrome.tabs.onRemoved.addListener((id) => { D.kv.get(CUR, null).then(c => { if (c && c.tabId === id) walkDone(id, { ok: false, error: 'a lapot bezárták' }); }).catch(() => {}); });
    chrome.storage.onChanged.addListener((ch, area) => { if (area === 'local' && ch[SKEY]) armWalk().catch(() => {}); });
    armWalk().catch(() => {});
  } catch (_) { /* nem háttérben futunk */ }

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (sender.id !== chrome.runtime.id || !msg || typeof msg.type !== 'string' || !msg.type.startsWith('aik-')) return false;   // csak a saját részeitől
    const run = (p) => { p.then(sendResponse, (e) => sendResponse({ ok: false, error: e && e.message || String(e) })); return true; };
    if (msg.type === 'aik-save') return run(save(msg.conv));
    if (msg.type === 'aik-status') return run(status());
    if (msg.type === 'aik-settings') return run(settings());
    // v0.1.3: bejárás
    if (msg.type === 'aik-walk-found') return run(addFound(String(msg.site || ''), msg.items));
    if (msg.type === 'aik-walk-role') return run(D.kv.get(CUR, null).then(c => (c && sender.tab && c.tabId === sender.tab.id) ? { ok: true, item: c.item } : { ok: true, item: null }));
    if (msg.type === 'aik-walk-done') return run(sender.tab ? walkDone(sender.tab.id, msg.res || {}) : Promise.resolve({ ok: false }));
    if (msg.type === 'aik-walk-status') return run(walkStatus());
    if (msg.type === 'aik-walk-now') return run(walkStep(true));
    if (msg.type === 'aik-walk-clear') return run(serial(async () => { await D.kv.set(Q, []); await D.kv.set(STARTS, {}); return { ok: true }; }));
    return false;
  });
  g.AIK_BG = { save, merge, settings, status, SKEY, addFound, walkStep, walkDone, walkStatus, armWalk };
})(typeof self !== 'undefined' ? self : window);
