// Segítő – MI-beszélgetések modul: oldalankénti feldolgozók (v0.5.39 · modul v0.1.7)
// extract(doc, url) → { site, cid, title, url, turns: [{ role: 'user' | 'assistant', text (Markdown), at? }], dayHint? } vagy null.
// Tiszta függvények (csak a kapott dokumentumot olvassák) – a tartalomszkript az élő oldalon, a teszt a mentett mintán hívja.
// A szerkezetek LordAthis mentett oldalaiból (2026-10-12) – részletesen: docs/MI-beszelgetesek-referencia.md.
(function (g) {
  if (g.AIK_AD) return;
  const A = g.AIK;
  const norm = (s) => String(s || '').replace(/\s+/g, ' ').trim();
  const urlId = (url, re) => { const m = String(url).match(re); return m ? m[1] : null; };
  const skipBase = (el) => el.classList && (el.classList.contains('sr-only') || el.getAttribute('aria-hidden') === 'true' || el.hasAttribute('data-ignore-copy'));

  // ---------- ChatGPT (chatgpt.com/c/<azonosító>) ----------
  // 2026-os felépítés: minden üzenet egy [data-chatgpt-search-unit-key="…:<n>:user|assistant"] elem (az üzenet azonosítója:
  // data-chatgpt-search-message-ids); a képernyőolvasónak szóló „Ezt mondtad:” / „A ChatGPT válasza:” fejléc .sr-only (kihagyjuk);
  // a napok elválasztója <time datetime="…"> (role=separator). Tartalék: a régebbi [data-message-author-role] jelölés.
  function chatgpt(doc, url) {
    let units = [...doc.querySelectorAll('[data-chatgpt-search-unit-key]')].filter(el => /:(user|assistant)$/.test(el.getAttribute('data-chatgpt-search-unit-key')));
    units = units.filter(el => !units.some(o => o !== el && o.contains(el)));          // a beágyazott párok közül a külső
    let roleOf = (el) => el.getAttribute('data-chatgpt-search-unit-key').match(/:(user|assistant)$/)[1];
    if (!units.length) { units = [...doc.querySelectorAll('[data-message-author-role]')]; roleOf = (el) => el.getAttribute('data-message-author-role') === 'user' ? 'user' : 'assistant'; }
    if (!units.length) return null;
    const times = [...doc.querySelectorAll('time[datetime]')];
    const turns = [];
    for (const el of units) {
      const text = A.md(el, { skip: (n) => skipBase(n) || n.getAttribute('data-markdown-copy') === 'exclude' });
      if (!text) continue;
      // a legutolsó, az üzenet ELŐTT álló dátum-elválasztó
      let at = null;
      for (const t of times) if (t.compareDocumentPosition(el) & 4 /* FOLLOWING */) at = t.getAttribute('datetime');
      turns.push({ role: roleOf(el), text, at, mid: (el.getAttribute('data-chatgpt-search-message-ids') || el.getAttribute('data-message-id') || '').split(' ')[0] || null });
    }
    // v0.1.7 (LordAthis 10-19, mentett minta): a megosztott beszélgetés / válasz címe /share/<azonosító> vagy /s/<azonosító>
    // („Ez egy megosztott ChatGPT-csevegés másolata”) – eddig nem volt azonosítója, ezért nem mentődött; a cím eleje „ChatGPT – …”
    const cid = urlId(url, /\/c\/([\w-]+)/) || (urlId(url, /\/share\/([\w-]+)/) ? 'share-' + urlId(url, /\/share\/([\w-]+)/) : null) || (urlId(url, /\/s\/([\w-]+)/) ? 's-' + urlId(url, /\/s\/([\w-]+)/) : null);
    return { site: 'chatgpt', cid, title: norm(doc.title).replace(/\s*[|–-]\s*ChatGPT$/i, '').replace(/^ChatGPT\s*[|–-]\s*/i, ''), url, turns, shared: /\/(share|s)\//.test(new URL(url, 'https://chatgpt.com').pathname) || undefined };
  }

  // ---------- Grok (grok.com/c/<azonosító>) ----------
  // Fordulónként egy div#response-<azonosító>, benne a buborék: [data-testid="user-message"] / [data-testid="assistant-message"]
  // (aria-label: „Te” / „Grok” – nyelvfüggő, ezért a data-testid a mérvadó). A válasz szövege a .response-content-markdown
  // elemben; előtte a „Dolgozott 2s ideig” gondolkodás-jelző (kihagyjuk).
  function grok(doc, url) {
    const bubbles = [...doc.querySelectorAll('[data-testid="user-message"], [data-testid="assistant-message"]')];
    if (!bubbles.length) return null;
    const turns = [];
    for (const b of bubbles) {
      const role = b.getAttribute('data-testid') === 'user-message' ? 'user' : 'assistant';
      const body = role === 'assistant' ? (b.querySelector('.response-content-markdown') || b) : b;
      const text = A.md(body, { skip: skipBase });
      if (!text) continue;
      const box = b.closest('[id^="response-"]');
      turns.push({ role, text, at: null, mid: box ? box.id.replace(/^response-/, '') : null });
    }
    return { site: 'grok', cid: urlId(url, /\/c\/([\w-]+)/), title: norm(doc.title).replace(/\s*-\s*Grok$/i, ''), url, turns };
  }

  // ---------- Google AI-mód (google.com/search?…&udm=50) – LordAthis „Gemini”-ként használja ----------
  // Fordulónként egy [data-scope-id="turn"]. A kérdés: a h2 („A következőt mondta: …” / „Ön ezt küldte: <fájl>, és ezt mondta:
  // …” – képernyőolvasónak), a látható, sortöréses szöveg a h2 melletti dobozban; a forduló dátuma („2026. szeptember 16.”)
  // külön sorban. A válasz: [data-subtree="aimc"] → [data-container-id="main-col"]; a [data-ignore-copy] elemek (megosztás,
  // források oldalsávja) és a „Az AI-válaszokban előfordulhatnak hibák” lábléc kimarad. Az osztálynevek gépiek (változnak),
  // ezért csak data-* jelölőkre és szövegmintákra építünk.
  const SAID = /(?:mondta|said)\s*:\s*/i, SENT = /(?:küldte|sent)\s*:\s*(.+?),\s*(?:és ezt mondta|and said)\s*:/i;
  const DISCLAIMER = /^(Az AI-válaszokban előfordulhatnak hibák|AI responses may include mistakes)/i;
  function googleAi(doc, url) {
    const turnsEl = [...doc.querySelectorAll('[data-scope-id="turn"]')];
    if (!turnsEl.length) return null;
    const turns = [];
    let firstQ = '';
    for (const t of turnsEl) {
      const h2 = t.querySelector('h2');
      const ans = t.querySelector('[data-subtree="aimc"]');
      // dátum: a fordulóban álló „ÉÉÉÉ. hónap N.” sor
      let day = null;
      const walker = doc.createTreeWalker(t, 4);
      for (let n; (n = walker.nextNode());) { const d = A.huDate(n.nodeValue); if (d && /^\s*\d{4}\.\s*\S+\s+\d{1,2}\.\s*$/.test(n.nodeValue)) { day = d; break; } }
      if (h2) {
        const raw = norm(h2.textContent);
        const sent = raw.match(SENT);
        const parts = raw.split(SAID);
        const tail = parts.length > 1 ? parts[parts.length - 1] : raw;
        // a látható szöveg: a h2 melletti dobozban az az elem, amelynek a szövege (szóközök nélkül) ugyanaz, mint a kérdés
        const key = tail.replace(/\s+/g, '');
        let best = null;
        for (const el of h2.parentElement.querySelectorAll('*')) {
          if (el === h2 || h2.contains(el) || el.contains(h2)) continue;
          if (el.textContent.replace(/\s+/g, '') === key) best = el;               // a legmélyebb egyező (a sorrend miatt az utolsó)
        }
        let text = best ? A.md(best, { skip: skipBase }) : tail;
        if (sent) text = `[Csatolt fájl: ${norm(sent[1])}]\n\n` + text;
        if (!firstQ) firstQ = tail;
        if (text) turns.push({ role: 'user', text, at: day });
      }
      if (ans) {
        const body = ans.querySelector('[data-container-id="main-col"]') || ans;
        const text = A.md(body, { skip: (n) => skipBase(n) || (n.tagName === 'H3' && /^Az AI-mód válasza|^AI Mode response/i.test(norm(n.textContent))) || DISCLAIMER.test(norm(n.textContent).slice(0, 60)) });
        if (text) turns.push({ role: 'assistant', text, at: day });
      }
    }
    if (!turns.length) return null;
    let cid = null;
    try { cid = new URL(url).searchParams.get('mtid'); } catch (_) { /* nincs */ }
    if (!cid) cid = 'q-' + A.hash(firstQ + '|' + (turns[0].at || ''));
    return { site: 'google-ai', cid, title: norm(doc.title).replace(/\s*-\s*(Google Search|Google-keresés|Google Keresés|Keresés a Google-on)$/i, ''), url, turns };
  }

  // ---------- Gemini-alkalmazás (gemini.google.com/app/<azonosító>, /u/<n>/app/<azonosító>) – v0.5.27 ----------
  // Fordulónként egy .conversation-container (id = a forduló azonosítója), benne <user-query> és <model-response> (Angular
  // elemek – a nevük stabil, az osztálynevek nem mind). A kérdés: .query-text → p.query-text-line sorok (a képernyőolvasónak
  // szóló „Ön a következőt mondta:” fejléc .cdk-visually-hidden – kihagyjuk). A válasz: <message-content> → .markdown (a „A Gemini
  // ezt mondta:” h6 rejtett, a gondolatmenet <thinking-overlay> kívül esik). Kódblokk: div.code-block → fejléc a nyelvvel
  // („JSON”) + pre. Időpont nincs az oldalon.
  const hidden = (el) => skipBase(el) || (el.classList && [...el.classList].some(c => /visually-hidden/.test(c)));
  function gemini(doc, url) {
    const boxes = [...doc.querySelectorAll('.conversation-container')];
    const pairs = boxes.length ? boxes.map(b => ({ id: b.id || null, q: b.querySelector('user-query'), r: b.querySelector('model-response') }))
      : [...doc.querySelectorAll('user-query, model-response')].map(e => ({ id: null, q: e.tagName === 'USER-QUERY' ? e : null, r: e.tagName === 'MODEL-RESPONSE' ? e : null }));
    const turns = [];
    for (const p of pairs) {
      if (p.q) {
        const qt = p.q.querySelector('.query-text') || p.q;
        const text = A.md(qt, { skip: (n) => hidden(n) || n.tagName === 'GEM-ICON-BUTTON' });
        if (text) turns.push({ role: 'user', text, at: null, mid: p.id ? p.id + ':q' : null });
      }
      if (p.r) {
        const mc = p.r.querySelector('message-content .markdown') || p.r.querySelector('message-content') || p.r;
        const text = A.md(mc, { skip: (n) => hidden(n) || /^(THINKING-OVERLAY|MESSAGE-ACTIONS|SOURCES-LIST|GEM-ICON-BUTTON)$/.test(n.tagName) });
        if (text) turns.push({ role: 'assistant', text, at: null, mid: p.id ? p.id + ':r' : null });
      }
    }
    if (!turns.length) return null;
    return { site: 'gemini', cid: urlId(url, /\/app\/([\w-]+)/) || urlId(url, /\/gem\/[\w-]+\/([\w-]+)/), title: norm(doc.title).replace(/\s*-\s*(Google )?Gemini$/i, ''), url, turns };
  }

  // ---------- Claude (claude.ai/chat/<azonosító>) – v0.5.27 ----------
  // A beszélgetés sorai: [data-testid="transcript-row"] (data-perf-row: human / assistant; data-index: a sor sorszáma a
  // beszélgetésben – hosszú beszélgetésnél az oldal csak a végét tartja meg, ezért ez az összefésülés kulcsa). A kérdés:
  // [data-testid="user-message"]; a válasz: [data-testid="assistant-message"] → .standard-markdown blokk(ok). A „Claude responded:”
  // fejléc .sr-only, az eszközhasználat összefoglalója („Ran 3 commands”) [data-state] + role=status – kimarad; a csak
  // eszközhasználatot tartalmazó sor nem forduló. A megosztott fájlok (artifact-kártyák) címe a válasz végére kerül.
  // Időpont: a sor <time datetime> eleme (csak az utolsón van).
  function claude(doc, url) {
    let rows = [...doc.querySelectorAll('[data-testid="transcript-row"]')];
    if (!rows.length) rows = [...doc.querySelectorAll('[data-testid="user-message"], [data-testid="assistant-message"]')];
    const turns = [];
    for (const r of rows) {
      const um = r.matches('[data-testid="user-message"]') ? r : r.querySelector('[data-testid="user-message"]');
      const am = r.matches('[data-testid="assistant-message"]') ? r : r.querySelector('[data-testid="assistant-message"]');
      const time = r.querySelector('time[datetime]');
      const mid = r.hasAttribute('data-index') ? 'row-' + r.getAttribute('data-index') : null;
      const skip = (n) => skipBase(n) || n.getAttribute('role') === 'status' || n.getAttribute('data-testid') === 'message-actions' || (n.hasAttribute('data-state') && !!n.querySelector('bdi'));
      if (um) {
        const text = A.md(um, { skip });
        if (text) turns.push({ role: 'user', text, at: time && time.getAttribute('datetime'), mid });
      } else if (am) {
        const blocks = [...am.querySelectorAll('.standard-markdown')].filter(b => !b.parentElement.closest('.standard-markdown'));
        let text = (blocks.length ? blocks : []).map(b => A.md(b, { skip })).filter(Boolean).join('\n\n');
        const files = [...am.querySelectorAll('[class*="artifact-block"] .text-heading')].map(e => norm(e.textContent)).filter(Boolean);
        if (text && files.length) text += '\n\n*Csatolva:* ' + files.join(', ');
        if (text) turns.push({ role: 'assistant', text, at: time && time.getAttribute('datetime'), mid });
      }
    }
    if (!turns.length) return null;
    return { site: 'claude', cid: urlId(url, /\/chat\/([\w-]+)/), title: norm(doc.title).replace(/\s*-\s*Claude$/i, ''), url, turns };
  }

  // ---------- Perplexity (www.perplexity.ai/computer/tasks/<azonosító>, /search/<azonosító>) – v0.5.27 ----------
  // A mentett minta (2026-10-12) egy „Computer” feladat: a kérdés buborékja [class*="group/user-bubble"] (benne az időpont és a
  // „Lekérdezés másolása” gomb – kimarad), a válasz egy-egy [data-workflow-items-first] csoport. A csoportban a .prose dobozok az
  // MI munka közbeni megjegyzései; a kész válasznál a csoporton „data-workflow-final-text” jel van, ekkor a VÉGSŐ .prose a válasz
  // (a közbülsők kimaradnak). A megosztott fájlok: [data-asset-chip]. Hosszú beszélgetésnél az oldal csak a végét tartja meg
  // (az első kérdés doboza üres) – ezért a fordulók kulcsa a kérdés szövegéből képzett ujjlenyomat.
  function perplexity(doc, url) {
    const els = [...doc.querySelectorAll('[class*="group/user-bubble"], [data-workflow-items-first]')]
      .filter((e, i, all) => !all.some(o => o !== e && o.contains(e)));
    const turns = [];
    let lastQ = 'eleje';
    for (const e of els) {
      if (e.matches('[data-workflow-items-first]')) {
        const pros = [...e.querySelectorAll('.prose')];
        if (!pros.length) continue;
        const fin = e.hasAttribute('data-workflow-final-text');
        let text = (fin ? [pros[pros.length - 1]] : pros).map(p => A.md(p, { skip: skipBase })).filter(Boolean).join('\n\n');
        // a fájl-csempe szövegei (név, típus) szóközzel elválasztva
        const chipText = (c) => { const w = doc.createTreeWalker(c, 4), out = []; for (let n; (n = w.nextNode());) if (n.nodeValue.trim()) out.push(n.nodeValue.trim()); return out.join(' · '); };
        const files = [...e.querySelectorAll('[data-asset-chip]')].map(chipText).filter(Boolean);
        if (text && files.length) text += '\n\n*Csatolva:* ' + files.join(', ');
        if (text) turns.push({ role: 'assistant', text: fin ? text : '*(folyamatban)*\n\n' + text, at: null, mid: lastQ + ':r' });
      } else {
        const box = e.querySelector('[class*="whitespace-pre-wrap"]') || e;
        const text = A.md(box, { skip: (n) => skipBase(n) || /^(SPAN)$/.test(n.tagName) && /^\d{1,2}:\d{2}$/.test(norm(n.textContent)) });
        if (!text) continue;
        lastQ = 'q-' + A.hash(text).slice(0, 12);
        turns.push({ role: 'user', text, at: null, mid: lastQ });
      }
    }
    if (!turns.length) return null;
    return { site: 'perplexity', cid: urlId(url, /\/(?:tasks|search|page)\/([\w-]+)/), title: norm(doc.title).replace(/\s*[-|]\s*Perplexity$/i, ''), url, turns };
  }

  const BY_SITE = { chatgpt, grok, 'google-ai': googleAi, gemini, claude, perplexity };
  function extract(doc, url) {
    const id = A.siteOfUrl(url);
    const s = id && A.site(id);
    if (!s || !s.ready || !BY_SITE[id]) return null;
    const c = BY_SITE[id](doc, url);
    if (!c || !c.turns.length || !c.cid) return null;
    return c;
  }
  // olcsó „aláírás”: változott-e valami a beszélgetésben (a teljes feldolgozás csak ekkor fut)
  function signature(doc, url) {
    const id = A.siteOfUrl(url);
    const sel = id === 'chatgpt' ? '[data-chatgpt-search-unit-key], [data-message-author-role]' : id === 'grok' ? '[data-testid="user-message"], [data-testid="assistant-message"]' : id === 'google-ai' ? '[data-scope-id="turn"]'
      : id === 'gemini' ? 'user-query, model-response' : id === 'claude' ? '[data-testid="user-message"], [data-testid="assistant-message"]'
      : id === 'perplexity' ? '[class*="group/user-bubble"], [data-workflow-items-first] .prose' : null;
    if (!sel) return '';
    const els = doc.querySelectorAll(sel);
    if (!els.length) return '';
    const last = els[els.length - 1];
    return `${els.length}:${(last.textContent || '').length}`;
  }
  g.AIK_AD = { extract, signature, chatgpt, grok, googleAi, gemini, claude, perplexity };
})(typeof self !== 'undefined' ? self : window);
