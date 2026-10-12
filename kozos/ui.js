// Segítő – közös felületi elemek a saját oldalakhoz (v0.5.28)
// – egységes ikonok: törlés = kuka, mentés = floppy, szerkesztés = ceruza, frissítés = körbeforduló nyíl;
//   a gombra elég a data-ico="trash|save|edit|refresh" jelölés (data-ico-only: csak ikon, a felirat buborékba kerül),
// – visszajelzés: SegitoUI.busy(gomb, 'Folyamatban…') azonnal forgó jelet tesz a gombra, a visszaadott függvény állítja vissza;
//   SegitoUI.toast(szöveg, 'ok' | 'bad' | 'info') – a böngésző felugró ablaka (alert) helyett, sötét témában,
//   SZABÁLY: ahol 1,5 másodpercnél tovább kell várni, ott mindig legyen látható visszajelzés (lásd CLAUDE.md),
// – táblázatok: állítható oszlopszélesség (a fejléc jobb szélét húzva), dupla kattintásra a legszélesebb
//   szöveghez igazodik; a szélességeket táblázatonként megjegyzi (localStorage).
(function (g) {
  const svg = (d) => `<svg class="ico" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
  const ICON = {
    trash: svg('<path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M6 6l1 15h10l1-15"/><path d="M10 11v6"/><path d="M14 11v6"/>'),
    save: svg('<path d="M4 4h12l4 4v12H4z"/><path d="M8 4v5h7V4"/><path d="M7 20v-7h10v7"/>'),
    edit: svg('<path d="M4 20l1-4L16 5l3 3L8 19z"/><path d="M14 7l3 3"/>'),
    refresh: svg('<path d="M20 12a8 8 0 1 1-2.6-5.9"/><path d="M20 4v5h-5"/>'),
    eye: svg('<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>'),
    // v0.5.23: kéretlen (spam) = nyolcszög felkiáltójellel; archiválás képként / PDF-ben = fényképezőgép; életjel = EKG-vonal
    spam: svg('<path d="M8.3 3h7.4L21 8.3v7.4L15.7 21H8.3L3 15.7V8.3z"/><path d="M12 8v5"/><path d="M12 16.5v.1"/>'),
    camera: svg('<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>'),
    pulse: svg('<path d="M2 12h4l2.5-6 4 13 3-9 1.5 2H22"/>'),
    gear: svg('<circle cx="12" cy="12" r="3"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1"/>')
  };
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // Ikon a data-ico jelölésű gombokra (egyszer; újrarajzolt tartalomnál újra hívható)
  function decorate(root) {
    for (const b of (root || document).querySelectorAll('[data-ico]')) {
      if (b.querySelector(':scope > .ico') || !ICON[b.dataset.ico]) continue;
      if (b.hasAttribute('data-ico-only')) {
        const label = b.textContent.trim();
        if (label && !b.title) b.title = label;
        if (label) b.setAttribute('aria-label', label);
        b.innerHTML = ICON[b.dataset.ico];
        b.classList.add('icon-btn');
      } else b.insertAdjacentHTML('afterbegin', ICON[b.dataset.ico] + ' ');
    }
    siteIcons(root);                                  // v0.5.25: oldal-ikonok (data-site)
    foldable(root);                                   // v0.5.28: bezárható dobozok
  }
  // csak ikonos gomb HTML-je (táblázatsorokba)
  const iconBtn = (ico, title, attrs = '', cls = '') => `<button class="icon-btn ${cls}" title="${esc(title)}" aria-label="${esc(title)}" ${attrs}>${ICON[ico]}</button>`;

  // ---------- visszajelzés ----------
  // v0.5.24 – A GOMB MÉRETE MUNKA KÖZBEN SEM VÁLTOZIK (LordAthis, 2026-10-07: a hosszabb felirattól megnőtt gomb miatt az egész
  // gombsor átugrott a másik oldalra). A gomb szélessége a munka idejére rögzül; a felirat az, ami belefér:
  // forgó jel + a megadott szöveg → forgó jel + „Dolgozom…” → csak a forgó jel. A részletek (mi történik, meddig tart) NEM a
  // gombra kerülnek, hanem a gombsor ALATTI sorba: ha a gomb egy .actwrap dobozban van, annak .act-note sora kapja meg
  // (a sor helye előre le van foglalva, így a megjelenő szöveg sem tol el semmit). Ahol nincs ilyen sor, a szöveg a gomb
  // buborékjában olvasható.
  const SPIN = '<span class="spin"></span>';
  function lockWidth(btn) {
    const { width: w, height: h } = btn.getBoundingClientRect();
    if (!w) return () => {};                                   // rejtett gomb: nincs mit rögzíteni
    // a magasság is rögzül: az ikonos gomb (pl. „Mentés most”) a forgó jellel 1–2 képponttal alacsonyabb lenne, és a sor megugrana
    const st = btn.style, prev = { width: st.width, minWidth: st.minWidth, height: st.height, boxSizing: st.boxSizing, overflow: st.overflow, whiteSpace: st.whiteSpace, textOverflow: st.textOverflow };
    Object.assign(st, { boxSizing: 'border-box', width: w + 'px', minWidth: '0', height: h + 'px', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' });
    btn.classList.add('is-busy');
    return () => { Object.assign(st, prev); btn.classList.remove('is-busy'); };
  }
  function fit(btn, variants) {
    for (const h of variants) { btn.innerHTML = h; if (btn.scrollWidth <= btn.clientWidth + 1) return; }
  }
  // a gombsor alatti megjegyzés-sor: gombonként egy bejegyzés (egyszerre több művelet is futhat), „ · ”-tal összefűzve
  const NOTES = new WeakMap();
  // hová kerül a részlet: a fejléc gombsoránál az .actwrap doboz .act-note sora; máshol (eszköztár) a gomb data-note="<azonosító>"
  // jelölése mondja meg, melyik elembe (ez álljon a sor VÉGÉN, hogy a megjelenő szöveg ne toljon el semmit)
  const noteBox = (btn) => { const w = btn.closest && btn.closest('.actwrap'); return w ? w.querySelector('.act-note') : (btn.dataset && btn.dataset.note ? document.getElementById(btn.dataset.note) : null); };
  function actNote(box, key, text) {
    if (!box) return;
    const m = NOTES.get(box) || new Map();
    NOTES.set(box, m);
    if (text) m.set(key, text); else m.delete(key);
    const all = [...m.values()].join(' · ');
    box.textContent = all; box.title = all;
  }
  const noteKey = (btn) => btn.id || btn.dataset.noteKey || (btn.dataset.noteKey = 'b' + Math.random().toString(36).slice(2, 8));
  const plain = (html) => { const d = document.createElement('span'); d.innerHTML = html; return (d.textContent || '').replace(/\s+/g, ' ').trim(); };

  function busy(btn, text) {
    if (!btn) return () => {};
    if (btn.dataset.busy) return () => {};
    const html = btn.innerHTML, was = btn.disabled, title = btn.getAttribute('title');
    const box = noteBox(btn), label = plain(html) || title || '';
    const unlock = lockWidth(btn);
    btn.dataset.busy = '1'; btn.disabled = true;
    const inHead = !!(btn.closest && btn.closest('.actwrap'));
    if (box && inHead) { fit(btn, [SPIN + ' Dolgozom…', SPIN]); actNote(box, noteKey(btn), text ? `${label}: ${text}` : label + '…'); }
    else if (box) { fit(btn, text ? [`${SPIN} ${esc(text)}`, SPIN + ' Dolgozom…', SPIN] : [SPIN]); }
    else fit(btn, text ? [`${SPIN} ${esc(text)}`, SPIN + ' Dolgozom…', SPIN] : [SPIN]);
    if (text) btn.title = text;
    const restore = () => {
      btn.innerHTML = html; unlock();
      if (title == null) btn.removeAttribute('title'); else btn.title = title;
    };
    return (finalText) => {
      delete btn.dataset.busy; btn.disabled = was;
      if (box) actNote(box, noteKey(btn), '');
      if (finalText) { fit(btn, [esc(finalText), '✓']); btn.title = finalText; setTimeout(() => { if (!btn.dataset.busy) restore(); }, 1600); }
      else restore();
    };
  }
  // Tartós „dolgozom” állapot, amit a frissítés kapcsol (pl. amíg a kézi beolvasás vagy a feldolgozás tart):
  // working(gomb, true, 'Beolvasás 16:27-ig') – a gomb mérete nem változik, a szöveg a gombsor alatti sorba kerül;
  // working(gomb, false) visszaállítja. A busy() alatt nem nyúl a gombhoz.
  const WORK = new WeakMap();
  function working(btn, on, note) {
    if (!btn || btn.dataset.busy) return;
    const box = noteBox(btn), w = WORK.get(btn);
    if (on) {
      if (!w) {
        WORK.set(btn, { html: btn.innerHTML, title: btn.getAttribute('title'), unlock: lockWidth(btn) });
        btn.dataset.work = '1'; btn.classList.add('spinning');
        fit(btn, [SPIN + ' Dolgozom…', SPIN]);
      }
      if (box) actNote(box, noteKey(btn), note || '');
      if (note) btn.title = note;
    } else if (w) {
      WORK.delete(btn); delete btn.dataset.work; btn.classList.remove('spinning');
      btn.innerHTML = w.html; w.unlock();
      if (w.title == null) btn.removeAttribute('title'); else btn.title = w.title;
      if (box) actNote(box, noteKey(btn), '');
    }
  }

  // v0.5.24 – AZ OLDAL SAJÁT IKONJA a böngésző ikontárából (a „favicon” engedéllyel: chrome-extension://<azonosító>/_favicon/).
  // Azt az ikont adja, amit a böngésző a meglátogatott oldalról már eltett (mint a könyvjelzőknél) – a bővítmény ezért
  // SEMMIT nem kér le, és más cégek logóját nem tartalmazza / nem rajzolja meg (CLAUDE.md: Márkajelek).
  // favicon(['https://www.pelda.hu/', …]) → az első cím ikonjának címe, amelyikhez a böngészőnek VAN ikonja; ha egyikhez
  // sincs (az oldalt ezen a gépen még nem nyitották meg), null – a hívó ilyenkor a betűjelet hagyja kint.
  // Hogy „van-e”: a böngésző ismeretlen oldalra egy általános (földgömb) ikont ad – ezzel hasonlítjuk össze bájtra.
  let favDefault = null;
  const favUrl = (pageUrl, size) => chrome.runtime.getURL(`_favicon/?pageUrl=${encodeURIComponent(pageUrl)}&size=${size}`);
  async function favBytes(pageUrl, size) {
    const r = await fetch(favUrl(pageUrl, size));
    if (!r.ok) return null;
    const b = new Uint8Array(await r.arrayBuffer());
    return b.length ? b : null;
  }
  const sameBytes = (a, b) => !!a && !!b && a.length === b.length && a.every((v, i) => v === b[i]);
  async function favicon(urls, size = 32) {
    try {
      if (!g.chrome || !chrome.runtime || !chrome.runtime.getURL) return null;
      if (favDefault === null) favDefault = (await favBytes('https://nincs-ilyen-oldal.segito.invalid/', size)) || false;
      if (!favDefault) return null;                            // az ikontár nem érhető el (nincs engedély / a böngésző nem ismeri)
      for (const u of [].concat(urls || [])) {
        const b = await favBytes(u, size);
        if (b && !sameBytes(b, favDefault)) return favUrl(u, size);
      }
    } catch (_) { /* nincs ikontár – marad a betűjel */ }
    return null;
  }
  // v0.5.25 – OLDAL-IKONOK MINDENHOL (LordAthis kérése): ahol egy oldal neve lapfülként / gombként / hivatkozásként áll, ott az
  // oldal saját ikonja; a szövegekben marad a név. Jelölés a HTML-ben:
  //   <button data-site="aukro" data-site-tab><span class="site-label">Aukro</span><span class="n">12</span></button>
  //     → lapfül: a .site-label HELYÉRE az ikon kerül (rámutatva és felolvasva a név); ha nincs ikon, marad a felirat
  //   <span data-site="aukro">Aukro</span>  → lista / egymás alatti sorok: az ikon a név ELÉ kerül, a név marad
  // Az ikon a katalógus „home” címeiből jön (common/catalog.js), a böngésző ikontárából (favicon) – ha a böngésző az oldalt még
  // nem látta, nincs ikon, és minden marad a régiben. Oldalanként egyszer kérdez (gyorsítótár), a hálózathoz nem nyúl.
  const SITE_ICO = new Map();
  function siteIconUrl(id) {
    const C = g.SegitoCatalog, x = C && C.site && C.site(id);
    if (!x || !x.home) return Promise.resolve(null);
    if (!SITE_ICO.has(id)) SITE_ICO.set(id, favicon(x.home, 32));
    return SITE_ICO.get(id);
  }
  function siteIcons(root) {
    if (!g.SegitoCatalog) return;                    // a katalógus még nem töltődött be – a következő hívás pótolja
    const els = (root || document).querySelectorAll('[data-site]:not([data-site-done])');
    for (const el of els) {
      el.dataset.siteDone = '1';
      const id = el.dataset.site, tab = el.hasAttribute('data-site-tab');
      // v0.5.26 → v0.5.28: a rövid nevű oldal (katalógus: iconWithLabel – most: Hardverapró, LordAthis kérése) a név helyén
      // mindenhol a rövid nevet („HWApró”) mutatja, rámutatva a teljes név; v0.5.28-tól az ikon is MELLETTE áll (lapfülön is).
      const cx = g.SegitoCatalog.site(id), withLabel = !!(cx && cx.iconWithLabel);
      if (withLabel) {
        const sh = cx.short || cx.name;
        if (!el.title) el.title = cx.name;
        const lab = tab && el.querySelector('.site-label');
        if (lab) lab.textContent = sh;
        else { const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT); for (let n = w.nextNode(); n; n = w.nextNode()) if (n.nodeValue.includes(cx.name)) n.nodeValue = n.nodeValue.replace(cx.name, sh); }
      }
      siteIconUrl(id).then((src) => {
        if (!src || !el.isConnected) return;
        const C = g.SegitoCatalog, x = C && C.site(id), name = (x && x.name) || id;
        const img = new Image();
        img.className = tab ? 'site-ico' : 'site-ico sm'; img.alt = ''; img.width = tab ? 20 : 16; img.height = tab ? 20 : 16;
        img.onload = () => {
          if (!el.isConnected) return;
          if (tab && withLabel) { el.prepend(img); el.classList.add('has-ico', 'ico-label'); }   // v0.5.28: ikon + felirat
          else if (tab) {
            const lab = el.querySelector('.site-label');
            if (!el.title) el.title = name;
            if (!el.getAttribute('aria-label')) el.setAttribute('aria-label', (lab ? lab.textContent.trim() : '') || name);
            if (lab) lab.replaceWith(img); else el.prepend(img);
            el.classList.add('has-ico');
          } else el.prepend(img);
        };
        img.src = src;
      });
    }
  }

  // az ikontár állapota a Környezet-ellenőrzéshez: { ok, reason }
  async function faviconProbe() {
    try { const b = await favBytes('https://nincs-ilyen-oldal.segito.invalid/', 32); return { ok: !!b }; }
    catch (e) { return { ok: false, reason: e && e.message || String(e) }; }
  }

  function toast(msg, kind = 'info', ms) {
    let box = document.getElementById('segito-toasts');
    if (!box) { box = document.createElement('div'); box.id = 'segito-toasts'; document.body.appendChild(box); }
    const d = document.createElement('div');
    d.className = 'toast ' + kind;
    d.setAttribute('role', kind === 'bad' ? 'alert' : 'status');
    d.innerHTML = `<span>${esc(msg)}</span><button title="Bezárás" aria-label="Bezárás">×</button>`;
    const close = () => d.remove();
    d.querySelector('button').addEventListener('click', close);
    box.appendChild(d);
    // a hiba tovább marad kint; a hosszú szöveg is (olvasási idő)
    const keep = ms || Math.min(20000, (kind === 'bad' ? 9000 : 4500) + String(msg).length * 45);
    setTimeout(close, keep);
    return close;
  }
  // „3 perce”, „2 órája”
  function ago(t, now = Date.now()) {
    if (!t) return '–';
    const s = Math.max(0, Math.round((now - t) / 1000));
    if (s < 50) return 'most';
    if (s < 3600) return Math.round(s / 60) + ' perce';
    if (s < 86400) return Math.round(s / 3600) + ' órája';
    return Math.round(s / 86400) + ' napja';
  }

  // ---------- állítható oszlopok ----------
  const COL_MIN = 44, COL_MAX = 1200;
  const lsGet = (k) => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (_) { return null; } };
  const lsSet = (k, v) => { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)); } catch (_) { /* tele / tiltva */ } };
  function headCells(table) { const tr = table.tHead && table.tHead.rows[0]; return tr ? [...tr.cells] : []; }
  function setWidths(table, w) {
    const ths = headCells(table);
    table.style.tableLayout = 'fixed';
    table.style.width = w.reduce((a, b) => a + b, 0) + 'px';
    table.style.minWidth = '100%';
    ths.forEach((th, i) => { th.style.width = w[i] + 'px'; });
  }
  function currentWidths(table) { return headCells(table).map(th => Math.round(th.getBoundingClientRect().width)); }
  // a legszélesebb tartalom az oszlopban (tördelés nélkül mérve)
  function fitWidth(table, i) {
    const m = document.createElement('div');
    m.style.cssText = 'position:absolute;left:-99999px;top:0;visibility:hidden;white-space:nowrap;width:max-content';
    document.body.appendChild(m);
    let max = COL_MIN;
    const rows = [table.tHead.rows[0], ...[...table.tBodies].flatMap(b => [...b.rows])];
    for (const r of rows) {
      if (r.cells.length !== table.tHead.rows[0].cells.length) continue;      // összevont (colspan) sorok kimaradnak
      const c = r.cells[i]; if (!c) continue;
      const cs = getComputedStyle(c);
      m.style.font = cs.font;
      m.innerHTML = c.innerHTML;
      const grip = m.querySelector('.col-grip'); if (grip) grip.remove();
      max = Math.max(max, Math.ceil(m.getBoundingClientRect().width + parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight)) + 2);
    }
    m.remove();
    return Math.min(COL_MAX, max);
  }
  // box: a táblázatot tartalmazó elem (vízszintesen görgethetővé válik); key: a megjegyzett szélességek kulcsa
  function cols(box, key) {
    const table = box && box.querySelector(':scope > table'); if (!table || !table.tHead) return;
    box.classList.add('tbl-wrap');
    siteIcons(box);                                   // v0.5.28: a táblázat oldal-nevei mellé is ikon (data-site)
    const ths = headCells(table), sk = 'segito_cols:' + key;
    const saved = lsGet(sk);
    if (Array.isArray(saved) && saved.length === ths.length) setWidths(table, saved);
    ths.forEach((th, i) => {
      if (th.querySelector('.col-grip')) return;
      const grip = document.createElement('span');
      grip.className = 'col-grip';
      grip.title = 'Húzd az oszlop szélességéhez · dupla kattintás: a legszélesebb szöveghez igazít';
      th.appendChild(grip);
      grip.addEventListener('click', (e) => e.stopPropagation());
      grip.addEventListener('pointerdown', (e) => {
        e.preventDefault(); e.stopPropagation();
        const w = currentWidths(table), x0 = e.clientX, w0 = w[i];
        setWidths(table, w);
        grip.setPointerCapture(e.pointerId); grip.classList.add('on');
        const move = (ev) => { w[i] = Math.max(COL_MIN, Math.min(COL_MAX, w0 + ev.clientX - x0)); setWidths(table, w); };
        const up = () => { grip.removeEventListener('pointermove', move); grip.removeEventListener('pointerup', up); grip.removeEventListener('pointercancel', up); grip.classList.remove('on'); lsSet(sk, w); };
        grip.addEventListener('pointermove', move); grip.addEventListener('pointerup', up); grip.addEventListener('pointercancel', up);
      });
      grip.addEventListener('dblclick', (e) => {
        e.preventDefault(); e.stopPropagation();
        const w = currentWidths(table); w[i] = fitWidth(table, i); setWidths(table, w); lsSet(sk, w);
      });
    });
  }
  // a megjegyzett szélességek törlése (vissza az automatikus elrendezéshez)
  function colsReset(box, key) {
    lsSet('segito_cols:' + key, null);
    const table = box && box.querySelector(':scope > table'); if (!table) return;
    table.style.tableLayout = ''; table.style.width = ''; table.style.minWidth = '';
    headCells(table).forEach(th => { th.style.width = ''; });
  }

  // ---------- napló napokra bontva (v0.5.23) ----------
  // LordAthis: „Szedjük szét dobozokra a napokat. Csak a felső, jelenlegi nap legyen nyitva, illetve alatta akkor legyen
  // nyitva az előző, ha még csak 3–5 órája kezdődött a következő nap.” – minden naplónál (Nyilvános oldalak, MTT) ez a nézet.
  // entries: [{ t, level, msg }] (a legfrissebb elöl); key: a kézzel nyitott / csukott napok megjegyzéséhez (az oldal élettartamára)
  const LOG_OVERLAP_H = 4;                                   // ennyi óráig marad nyitva az előző nap is
  const logOpen = {};                                        // key → { '2026-10-07': true | false } (amit a felhasználó kézzel állított)
  const dayKey = (t) => { const d = new Date(t), p = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; };
  function dayLog(box, entries, key, now = Date.now()) {
    if (!box) return;
    const list = entries || [];
    if (!list.length) { box.innerHTML = '<div class="empty">A napló üres.</div>'; return; }
    const days = [], by = new Map();
    for (const x of list) { const k = dayKey(x.t); if (!by.has(k)) { by.set(k, []); days.push(k); } by.get(k).push(x); }
    days.sort().reverse();
    const today = dayKey(now), early = new Date(now).getHours() < LOG_OVERLAP_H, yesterday = dayKey(now - 864e5);
    const mem = logOpen[key] = logOpen[key] || {};
    const isOpen = (k, i) => k in mem ? mem[k] : (i === 0 || (early && days[0] === today && k === yesterday));
    const hm = (t) => new Date(t).toLocaleTimeString('hu-HU', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const title = (k) => { const d = new Date(k + 'T12:00:00'); return d.toLocaleDateString('hu-HU', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' }) + (k === today ? ' – ma' : k === yesterday ? ' – tegnap' : ''); };
    box.innerHTML = days.map((k, i) => {
      const l = by.get(k), err = l.filter(x => x.level === 'error').length, warn = l.filter(x => x.level === 'warn').length;
      return `<details class="daylog" data-day="${k}"${isOpen(k, i) ? ' open' : ''}><summary><b>${esc(title(k))}</b> <span class="muted">· ${l.length} bejegyzés</span>${err ? ` <span class="tag bad">${err} hiba</span>` : ''}${warn ? ` <span class="tag">${warn} figyelmeztetés</span>` : ''}</summary>` +
        `<table><tbody>${l.map(x => `<tr><td class="num muted">${hm(x.t)}</td><td class="${x.level === 'error' ? 'bad' : x.level === 'warn' ? 'warn' : ''}">${esc(x.msg)}</td></tr>`).join('')}</tbody></table></details>`;
    }).join('');
    for (const d of box.querySelectorAll('details.daylog')) d.addEventListener('toggle', () => { mem[d.dataset.day] = d.open; });
  }

  // ---------- saját oldal megnyitása: ha már nyitva van, arra vált (v0.5.23) ----------
  // LordAthis: „ha bárhol kiválasztok egy témakört (Felhasználók, X stb.), akkor egy új panel nyílik akkor is, ha már 3-szor
  // meg van nyitva ugyanaz”. path: a bővítményen belüli cím (pl. 'panels/x.html', 'options/options.html#nyo').
  // Ugyanaz az oldal (a # és a ? előtti rész egyezik) → arra a lapra vált; ha a # / ? más, azt is beállítja.
  async function openPage(path) {
    const url = /^chrome-extension:/.test(path) ? path : chrome.runtime.getURL(path.replace(/^(\.\.\/)+/, ''));
    const base = url.split(/[?#]/)[0];
    try {
      const tabs = (await chrome.tabs.query({})).filter(t => (t.url || t.pendingUrl || '').split(/[?#]/)[0] === base);
      if (tabs.length) {
        const cur = await chrome.tabs.getCurrent().catch(() => null);
        const t = tabs.find(x => !cur || x.id !== cur.id) || tabs[0];
        await chrome.tabs.update(t.id, t.url === url ? { active: true } : { active: true, url });
        if (t.windowId != null) await chrome.windows.update(t.windowId, { focused: true }).catch(() => {});
        return t;
      }
    } catch (_) { /* nincs lap-hozzáférés → új lapon nyílik */ }
    return chrome.tabs.create({ url });
  }
  // a data-open="<cím>" jelölésű gombok / hivatkozások (újrarajzolt tartalomban is): kattintásra openPage
  if (typeof document !== 'undefined') document.addEventListener('click', (e) => {
    const el = e.target.closest && e.target.closest('[data-open]');
    if (el) { if (!el.disabled) { e.preventDefault(); openPage(el.dataset.open); } return; }
    // a bővítmény saját oldalaira mutató, új lapon nyíló hivatkozások is (a téma-olvasó kivétel: abból több is lehet nyitva)
    const a = e.target.closest && e.target.closest('a[href][target="_blank"]');
    let own = ''; try { own = chrome.runtime.getURL(''); } catch (_) { return; }
    if (!a || !a.href.startsWith(own) || /\/mtanya\/topic\.html/.test(a.href) || e.ctrlKey || e.metaKey || e.shiftKey || e.button) return;
    e.preventDefault();
    openPage(a.href);
  });

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => decorate());
    else decorate();
  }
  // v0.5.28 – BEZÁRHATÓ DOBOZOK (LordAthis kérése, 029.png): minden címmel (h2 / h3) kezdődő doboz (.card), ami nem 1–2 soros,
  // a címe elején nyitó / záró gombot kap. A becsukott dobozból csak a cím látszik. Az állapotot a böngésző megjegyzi
  // (oldalanként, a doboz címe vagy a data-fold="<kulcs>" alapján – localStorage, csak ezen a gépen).
  //   data-fold="<kulcs>" → mindig bezárható (a magasságtól függetlenül); data-nofold → soha; .sample-card → soha.
  // A rejtett lapfülön lévő dobozt (nincs mérete) a ResizeObserver akkor nézi meg, amikor láthatóvá válik.
  const FOLD_MIN = 110;                               // ennél kisebb tartalom (kb. 2 sor) nem kap gombot
  const foldKey = (card, h) => 'segito_fold:' + location.pathname + ':' + (card.dataset.fold || [...h.childNodes].filter(n => n.nodeType === 3 || (n.nodeType === 1 && !n.matches('button, label, input, .muted, .tag, .fold-btn'))).map(n => n.textContent).join('').trim());
  let foldRO = null;
  function foldOne(card) {
    if (card.dataset.foldDone) return true;
    const h = card.querySelector(':scope > h2:first-child, :scope > h3:first-child'); if (!h) { card.dataset.foldDone = 'x'; return true; }
    if (!card.hasAttribute('data-fold')) {
      if (!card.offsetHeight) return false;           // még rejtett – később
      if (card.scrollHeight - h.offsetHeight < FOLD_MIN) { card.dataset.foldDone = 'x'; return true; }
    }
    card.dataset.foldDone = '1';
    const key = foldKey(card, h);
    const btn = document.createElement('button');
    btn.type = 'button'; btn.className = 'fold-btn';
    const set = (fold, save) => {
      card.classList.toggle('folded', fold);
      btn.setAttribute('aria-expanded', String(!fold));
      btn.title = fold ? 'Kinyitás' : 'Becsukás';
      btn.setAttribute('aria-label', btn.title);
      if (save) lsSet(key, fold ? 1 : null);
    };
    btn.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); set(!card.classList.contains('folded'), true); });
    card._fold = (fold) => set(fold, true);
    h.prepend(btn);
    card.classList.add('foldable');
    set(!!lsGet(key), false);
    return true;
  }
  function foldable(root) {
    if (typeof document === 'undefined') return;
    const scope = root || document;
    const cards = [...(scope.matches && scope.matches('.card') ? [scope] : []), ...scope.querySelectorAll('.card')];
    for (const card of cards) {
      if (card.dataset.foldDone || card.classList.contains('sample-card') || card.hasAttribute('data-nofold')) continue;
      if (!foldOne(card) && typeof ResizeObserver !== 'undefined') {
        foldRO = foldRO || new ResizeObserver((ents) => { for (const en of ents) if (en.target.offsetHeight && foldOne(en.target)) foldRO.unobserve(en.target); });
        foldRO.observe(card);
      }
    }
  }
  // „Mind kinyit / Mind becsuk”: a dobozok és a fák legfelső ágai (details) egyszerre
  function foldAll(root, fold) {
    const scope = root || document;
    foldable(scope);
    for (const card of scope.querySelectorAll('.card.foldable')) if (card._fold) card._fold(fold);
    for (const d of scope.querySelectorAll('.card > ul.tree > li > details, .card > details')) d.open = !fold;
  }

  g.SegitoUI = { ICON, decorate, iconBtn, busy, working, actNote, favicon, faviconProbe, siteIcons, foldable, foldAll, toast, ago, cols, colsReset, esc, dayLog, dayKey, openPage, _fitWidth: fitWidth };
})(typeof self !== 'undefined' ? self : window);
