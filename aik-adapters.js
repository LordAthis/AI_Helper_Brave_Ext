// Segítő – MI-beszélgetések modul: oldalankénti feldolgozók (v0.5.26 · modul v0.1.0)
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
    return { site: 'chatgpt', cid: urlId(url, /\/c\/([\w-]+)/), title: norm(doc.title).replace(/\s*[|–-]\s*ChatGPT$/i, ''), url, turns };
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

  const BY_SITE = { chatgpt, grok, 'google-ai': googleAi };
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
    const sel = id === 'chatgpt' ? '[data-chatgpt-search-unit-key], [data-message-author-role]' : id === 'grok' ? '[data-testid="user-message"], [data-testid="assistant-message"]' : id === 'google-ai' ? '[data-scope-id="turn"]' : null;
    if (!sel) return '';
    const els = doc.querySelectorAll(sel);
    if (!els.length) return '';
    const last = els[els.length - 1];
    return `${els.length}:${(last.textContent || '').length}`;
  }
  g.AIK_AD = { extract, signature, chatgpt, grok, googleAi };
})(typeof self !== 'undefined' ? self : window);
