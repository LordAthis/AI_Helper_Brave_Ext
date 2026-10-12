// Segítő – MI-beszélgetések modul: közös rész (oldalak, HTML → Markdown, segédek) (v0.5.26 · modul v0.1.0)
// A MODUL (CLAUDE.md → „Modulok”): ugyanez a mappa a Segítő része (panel a gyorspanelen), és ÖNÁLLÓ bővítményként is
// betölthető (saját manifest.json). Az adatai teljesen külön vannak: saját adatbázis („segito-aik”), saját beállítások
// (chrome.storage.local „aik_settings”), saját export-mappa („segito-aik/<Oldal>/…”). A Segítő többi részéhez nem nyúl.
// Ez a fájl a tartalomszkriptben, a háttérben és a panelen is fut – csak tiszta segédek vannak benne.
(function (g) {
  if (g.AIK) return;
  const VERSION = '0.1.0';

  // Az oldalak. folder: az export almappája; auto: alapból menti-e magától (LordAthis kérése: a Claude NEM – „sokkal
  // ügyesebben dolgozol”); ready: van-e az oldalhoz ellenőrzött feldolgozó (mentett minta alapján) – amelyiknél nincs,
  // ott a mentés még nem működik (a panelen jelölve, a minta kell hozzá).
  const SITES = [
    { id: 'chatgpt', name: 'ChatGPT', folder: 'ChatGPT', home: ['https://chatgpt.com/'], auto: true, ready: true, sample: '2026-10-12' },
    { id: 'grok', name: 'Grok', folder: 'Grok', home: ['https://grok.com/'], auto: true, ready: true, sample: '2026-10-12' },
    { id: 'google-ai', name: 'Google AI-mód (Gemini)', short: 'AI-mód', folder: 'Gemini', home: ['https://www.google.com/'], auto: true, ready: true, sample: '2026-10-12' },
    { id: 'gemini', name: 'Gemini', folder: 'Gemini', home: ['https://gemini.google.com/app', 'https://gemini.google.com/'], auto: true, ready: false },
    { id: 'claude', name: 'Claude', folder: 'Claude', home: ['https://claude.ai/'], auto: false, ready: false }
  ];
  const site = (id) => SITES.find(s => s.id === id) || null;
  // melyik oldal ez a cím? (a Google keresőből csak az AI-mód: udm=50, vagy az AI-mód beszélgetés-gyökere van az oldalon)
  function siteOfUrl(url) {
    let u; try { u = new URL(url); } catch (_) { return null; }
    const h = u.hostname.replace(/^www\./, '');
    if (h === 'chatgpt.com' || h === 'chat.openai.com') return 'chatgpt';
    if (h === 'grok.com') return 'grok';
    if (h === 'gemini.google.com') return 'gemini';
    if (h === 'claude.ai') return 'claude';
    if (/^google\.[a-z.]+$/.test(h) && u.pathname === '/search') return 'google-ai';
    return null;
  }

  // ---------- HTML → Markdown (MI-nek és embernek is olvasható; a kódblokk nyelvével) ----------
  const SKIP = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'SVG', 'BUTTON', 'TEXTAREA', 'INPUT', 'SELECT', 'TEMPLATE', 'IFRAME', 'CANVAS', 'VIDEO', 'AUDIO']);
  const UI_LABEL = /^(másolás|másolva|copy|copied|vágólapra másolva|szerkesztés|edit|megosztás|share|kód másolása|code|futtatás|run)$/i;
  const LANG_RE = /^[A-Za-z][A-Za-z0-9#+.\- ]{0,18}$/;
  // a kódblokk nyelve: a code elem language-xxx osztálya, vagy a blokk fejlécében álló rövid felirat (pl. „powershell”)
  function codeLang(pre) {
    const c = pre.querySelector('code');
    const cls = ((c && c.className) || '') + ' ' + (pre.className || '');
    const m = cls.match(/(?:language|lang)-([A-Za-z0-9#+\-]+)/);
    if (m) return m[1].toLowerCase();
    let el = pre;
    for (let i = 0; i < 4 && el && el.parentElement; i++) {
      el = el.parentElement;
      const walker = el.ownerDocument.createTreeWalker(el, 4 /* SHOW_TEXT */);
      let n;
      while ((n = walker.nextNode())) {
        if (pre.contains(n)) break;
        const t = n.nodeValue.trim();
        if (t && LANG_RE.test(t) && !UI_LABEL.test(t)) return t.toLowerCase();
      }
    }
    return '';
  }
  function md(root, opt = {}) {
    const out = [];
    const inline = (node) => {
      let s = '';
      for (const ch of node.childNodes) {
        if (ch.nodeType === 3) { s += ch.nodeValue.replace(/\s+/g, ' '); continue; }
        if (ch.nodeType !== 1 || SKIP.has(ch.tagName) || (opt.skip && opt.skip(ch))) continue;
        const t = ch.tagName;
        if (t === 'BR') s += '\n';
        else if (t === 'CODE') s += '`' + ch.textContent + '`';
        else if (t === 'STRONG' || t === 'B') { const x = inline(ch).trim(); s += x ? `**${x}**` : ''; }
        else if (t === 'EM' || t === 'I') { const x = inline(ch).trim(); s += x ? `*${x}*` : ''; }
        else if (t === 'A') { const x = inline(ch).trim(), h = ch.getAttribute('href') || ''; s += /^https?:/.test(h) && x ? `[${x}](${h})` : x; }
        else if (t === 'IMG') { const a = ch.getAttribute('alt') || 'kép'; s += `[${a}]`; }
        else if (t === 'PRE' || /^(P|DIV|UL|OL|TABLE|H[1-6]|BLOCKQUOTE|SECTION|ARTICLE)$/.test(t)) { const x = md(ch, opt); if (x) s += '\n' + x + '\n'; }   // pl. lista a listaelemben
        else s += inline(ch);
      }
      return s;
    };
    const flush = (s) => { s = s.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim(); if (s) out.push(s); };
    function block(node) {
      if (node.nodeType !== 1 || SKIP.has(node.tagName) || (opt.skip && opt.skip(node))) return;
      const t = node.tagName;
      // kódblokk-doboz (fejléc a nyelvvel és a „Másolás” gombbal + egyetlen <pre>): csak a kód kell, a fejléc nem
      if (t !== 'PRE') { const pres = node.querySelectorAll('pre'); if (pres.length === 1 && node.textContent.length - pres[0].textContent.length <= 60) { block(pres[0]); return; } }
      if (t === 'PRE') { const lang = codeLang(node); out.push('```' + lang + '\n' + node.textContent.replace(/\n+$/, '') + '\n```'); return; }
      if (/^H[1-6]$/.test(t) || node.getAttribute('role') === 'heading') { const lv = /^H[1-6]$/.test(t) ? +t[1] : +(node.getAttribute('aria-level') || 3); flush('#'.repeat(Math.min(6, Math.max(1, lv))) + ' ' + inline(node).trim()); return; }
      if (t === 'UL' || t === 'OL') { let i = 0; const items = []; for (const li of node.children) if (li.tagName === 'LI') { i++; items.push((t === 'OL' ? i + '. ' : '- ') + inline(li).trim().replace(/\n/g, '\n  ')); } if (items.length) out.push(items.join('\n')); return; }
      if (t === 'TABLE') { const rows = [...node.querySelectorAll('tr')].map(tr => [...tr.children].map(td => inline(td).trim().replace(/\|/g, '/'))); if (rows.length) { out.push(['| ' + rows[0].join(' | ') + ' |', '| ' + rows[0].map(() => '---').join(' | ') + ' |', ...rows.slice(1).map(r => '| ' + r.join(' | ') + ' |')].join('\n')); } return; }
      if (t === 'BLOCKQUOTE') { flush(inline(node).trim().split('\n').map(l => '> ' + l).join('\n')); return; }
      // ha a blokkban csak szöveg / inline elem van → egy bekezdés; különben a gyermekek egyenként
      const hasBlock = [...node.children].some(c => /^(P|DIV|UL|OL|PRE|TABLE|H[1-6]|BLOCKQUOTE|SECTION|ARTICLE)$/.test(c.tagName) || c.getAttribute('role') === 'heading');
      if (!hasBlock) { flush(inline(node)); return; }
      let buf = '';
      for (const ch of node.childNodes) {
        if (ch.nodeType === 3) { buf += ch.nodeValue.replace(/\s+/g, ' '); continue; }
        if (ch.nodeType !== 1 || SKIP.has(ch.tagName) || (opt.skip && opt.skip(ch))) continue;
        const isBlock = /^(P|DIV|UL|OL|PRE|TABLE|H[1-6]|BLOCKQUOTE|SECTION|ARTICLE)$/.test(ch.tagName) || ch.getAttribute('role') === 'heading';
        if (isBlock) { flush(buf); buf = ''; block(ch); } else buf += inline(ch);
      }
      flush(buf);
    }
    block(root);
    return out.join('\n\n').replace(/\n{3,}/g, '\n\n').trim();
  }
  // a Markdown-ból a kódblokkok nyelvei
  const langsOf = (text) => [...new Set([...String(text || '').matchAll(/^```([A-Za-z0-9#+\-]+)/gm)].map(m => m[1].toLowerCase()))];
  // gyors, stabil ujjlenyomat (a változás észleléséhez – nem titkosítás)
  function hash(s) { let h1 = 0x811c9dc5, h2 = 0x1b873593; for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); h1 = Math.imul(h1 ^ c, 16777619); h2 = Math.imul(h2 ^ c, 2246822507); } return ((h1 >>> 0).toString(16).padStart(8, '0') + (h2 >>> 0).toString(16).padStart(8, '0')); }
  // magyar dátum („2026. szeptember 16.”) → „2026-09-16”
  const HU_MONTH = ['január', 'február', 'március', 'április', 'május', 'június', 'július', 'augusztus', 'szeptember', 'október', 'november', 'december'];
  function huDate(s) {
    const m = String(s || '').match(/(\d{4})\.\s*([a-zá-űA-ZÁ-Ű]+)\s+(\d{1,2})\./);
    if (!m) return null;
    const mi = HU_MONTH.indexOf(m[2].toLowerCase());
    return mi < 0 ? null : `${m[1]}-${String(mi + 1).padStart(2, '0')}-${String(+m[3]).padStart(2, '0')}`;
  }
  // a beszélgetés teljes szövege (keresés, ujjlenyomat)
  const convText = (turns) => turns.map(t => `${t.role === 'user' ? 'Én' : 'MI'}: ${t.text}`).join('\n\n');
  const words = (s) => (String(s || '').match(/[\p{L}\p{N}]+/gu) || []).length;
  // fájlnév: ékezet marad (a Windows kezeli), tiltott jelek nélkül, rövidítve
  const fileSafe = (s, max = 80) => String(s || 'beszelgetes').replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max).replace(/[. ]+$/, '') || 'beszelgetes';

  g.AIK = { VERSION, SITES, site, siteOfUrl, md, codeLang, langsOf, hash, huDate, convText, words, fileSafe };
})(typeof self !== 'undefined' ? self : window);
