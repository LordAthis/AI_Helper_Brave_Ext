// Segítő – MI-beszélgetések modul: háttér (mentés, változatok) (v0.5.26 · modul v0.1.0)
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
    return { enabled: s.enabled !== false, auto, versionHours: Math.min(720, Math.max(0, +s.versionHours >= 0 ? +s.versionHours : 6)) };
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
    const conv = {
      key, site: c.site, cid: c.cid, title: c.title || (prev && prev.title) || (m.turns[0].text.slice(0, 80)), url: c.url || (prev && prev.url) || '',
      turns: m.turns, hash: h, words: A.words(text), langs: A.langsOf(text), turnCount: m.turns.length,
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

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (sender.id !== chrome.runtime.id || !msg || typeof msg.type !== 'string' || !msg.type.startsWith('aik-')) return false;   // csak a saját részeitől
    const run = (p) => { p.then(sendResponse, (e) => sendResponse({ ok: false, error: e && e.message || String(e) })); return true; };
    if (msg.type === 'aik-save') return run(save(msg.conv));
    if (msg.type === 'aik-status') return run(status());
    if (msg.type === 'aik-settings') return run(settings());
    return false;
  });
  g.AIK_BG = { save, merge, settings, status, SKEY };
})(typeof self !== 'undefined' ? self : window);
