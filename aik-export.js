// Segítő – MI-beszélgetések modul: megjelenítés, export (MD / JSON / HTML / TXT / DOCX), ZIP, változat-összevetés
// (v0.5.28 · modul v0.1.2). Külső könyvtár nélkül (a projektben nincs build-eszköz): a DOCX és a ZIP saját, egyszerű összeállítás.
// SÖTÉT TÉMA mindenhol (LordAthis: nincs fehér „papír”) – a HTML-, a nyomtatási (PDF) és a DOCX-kimenet is sötét.
(function (g) {
  if (g.AIK_EX) return;
  const A = g.AIK;
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const roleName = (r, site) => r === 'user' ? 'Én' : ((A.site(site) || {}).short || (A.site(site) || {}).name || 'MI');

  // ---------- Markdown → biztonságos HTML (csak a saját kimenetünkhöz: kódblokk, címsor, lista, idézet, táblázat, félkövér,
  // dőlt, inline kód, hivatkozás) ----------
  function inl(s) {
    let x = esc(s);
    x = x.replace(/`([^`]+)`/g, '<code>$1</code>');
    x = x.replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>').replace(/(^|[\s(])\*([^*\s][^*]*)\*/g, '$1<i>$2</i>');
    x = x.replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, (m, t, u) => `<a href="${u}" target="_blank" rel="noopener noreferrer">${t}</a>`);
    return x.replace(/\n/g, '<br>');
  }
  // kerítés-felismerés: a javító modul (aik-repair.js) függvényei, ha be van töltve – különben a szokásos ``` / ~~~
  const FX = g.AIK_FIX || {
    openFence: (l) => { const m = l.match(/^([ \t]*)(`{3,}|~{3,})[ \t]*([^\s`]*)[^`]*$/); return m ? { mark: m[2], lang: m[3] || '', indent: m[1].length } : null; },
    closesFence: (l, o) => { const m = l.match(/^([ \t]*)(`{3,}|~{3,})[ \t]*$/); return !!(m && m[2][0] === o.mark[0] && m[2].length >= o.mark.length && m[1].length <= Math.max(o.indent, 3)); }
  };
  function render(md, opt = {}) {
    const out = [], lines = String(md || '').split('\n');
    let i = 0;
    while (i < lines.length) {
      const l = lines[i];
      // v0.1.2: a kerítés hossza számít (```` – a javított, beágyazott kódot tartalmazó Markdown-fájl); a záró sor a nyitóhoz illik
      const fence = FX.openFence(l);
      // a kódblokk sarkában (ha kérik) „Kód másolása” gomb; Markdown-fájlnál „Letöltés .md” és „Előnézet” is
      if (fence) {
        const buf = []; i++;
        while (i < lines.length && !FX.closesFence(lines[i], fence)) buf.push(lines[i++]);
        i++;
        const code = buf.join('\n'), lang = fence.lang, isMd = /^(markdown|md)$/i.test(lang);
        const btns = opt.copy ? `<span class="code-btns">${isMd ? '<button class="copy-code" data-prev type="button" title="A Markdown-fájl formázott előnézete">Előnézet</button><button class="copy-code" data-dl type="button" title="A fájl letöltése .md-ként">Letöltés .md</button>' : ''}<button class="copy-code" data-copy type="button" title="A teljes kód a vágólapra">Kód másolása</button></span>` : '';
        out.push(`<pre class="code"${lang ? ` data-lang="${esc(lang)}"` : ''}>${lang ? `<span class="lang">${esc(lang)}</span>` : ''}${btns}<code>${esc(code)}</code></pre>`);
        continue;
      }
      const h = l.match(/^(#{1,6})\s+(.*)$/);
      if (h) { out.push(`<h${Math.min(6, h[1].length + 1)}>${inl(h[2])}</h${Math.min(6, h[1].length + 1)}>`); i++; continue; }
      if (/^\s*[-*] /.test(l) || /^\s*\d+\. /.test(l)) { const ol = /^\s*\d+\. /.test(l), it = []; while (i < lines.length && (/^\s*[-*] /.test(lines[i]) || /^\s*\d+\. /.test(lines[i]) || (/^ {2,}\S/.test(lines[i]) && it.length))) { if (/^ {2,}\S/.test(lines[i]) && !/^\s*([-*]|\d+\.) /.test(lines[i])) it[it.length - 1] += '\n' + lines[i].trim(); else it.push(lines[i].replace(/^\s*([-*]|\d+\.)\s+/, '')); i++; } out.push(`<${ol ? 'ol' : 'ul'}>${it.map(x => `<li>${inl(x)}</li>`).join('')}</${ol ? 'ol' : 'ul'}>`); continue; }
      if (/^> /.test(l)) { const q = []; while (i < lines.length && /^> /.test(lines[i])) q.push(lines[i++].slice(2)); out.push(`<blockquote>${inl(q.join('\n'))}</blockquote>`); continue; }
      if (/^\|.*\|\s*$/.test(l) && /^\|\s*---/.test(lines[i + 1] || '')) { const rows = []; while (i < lines.length && /^\|.*\|\s*$/.test(lines[i])) { if (!/^\|\s*---/.test(lines[i])) rows.push(lines[i].replace(/^\||\|\s*$/g, '').split('|').map(c => c.trim())); i++; } out.push(`<table>${rows.map((r, ri) => `<tr>${r.map(c => ri ? `<td>${inl(c)}</td>` : `<th>${inl(c)}</th>`).join('')}</tr>`).join('')}</table>`); continue; }
      if (!l.trim()) { i++; continue; }
      const p = []; while (i < lines.length && lines[i].trim() && !FX.openFence(lines[i]) && !/^(#{1,6}\s|> |\s*[-*] |\s*\d+\. )/.test(lines[i])) p.push(lines[i++]);
      if (p.length) out.push(`<p>${inl(p.join('\n'))}</p>`); else i++;
    }
    return out.join('\n');
  }

  // ---------- egy beszélgetés kimenetei ----------
  const dateOf = (c) => String(c.firstAt || new Date(c.firstSaved || Date.now()).toISOString()).slice(0, 10);
  const fileName = (c, ext) => `${dateOf(c)} ${A.fileSafe(c.title, 70)}.${ext}`;
  const folderOf = (c) => (A.site(c.site) || {}).folder || 'Egyeb';
  const head = (c) => [`Oldal: ${(A.site(c.site) || {}).name || c.site}`, `Cím: ${c.url || '–'}`, `Első forduló: ${c.firstAt || '–'} · utolsó mentés: ${new Date(c.lastSaved).toLocaleString('hu-HU')} · fordulók: ${c.turnCount} · változat: ${c.version}`];
  function toMd(c, turns = c.turns) {
    return `# ${c.title}\n\n${head(c).map(x => `- ${x.replace(/^([^:]+):/, '**$1:**')}`).join('\n')}\n\n` + turns.map(t => `## ${roleName(t.role, c.site)}${t.at ? ` · ${String(t.at).replace('T', ' ').slice(0, 16)}` : ''}\n\n${t.text}`).join('\n\n') + '\n';
  }
  const toJson = (c, turns = c.turns) => JSON.stringify({ app: 'Segito-MI-beszelgetesek', modul: A.VERSION, site: c.site, siteName: (A.site(c.site) || {}).name, id: c.cid, title: c.title, url: c.url, firstAt: c.firstAt, firstSaved: new Date(c.firstSaved).toISOString(), lastSaved: new Date(c.lastSaved).toISOString(), version: c.version, langs: c.langs, words: c.words, turns: turns.map(t => ({ role: t.role, at: t.at || null, text: t.text })) }, null, 1);
  const toTxt = (c, turns = c.turns) => `${c.title}\n${head(c).join('\n')}\n\n` + turns.map(t => `[${roleName(t.role, c.site)}${t.at ? ' · ' + String(t.at).replace('T', ' ').slice(0, 16) : ''}]\n${t.text}`).join('\n\n----------\n\n') + '\n';
  const CSS = `:root{color-scheme:dark}body{margin:0;padding:24px;background:#1c1d20;color:#e8eaed;font:15px/1.55 system-ui,"Segoe UI",sans-serif;-webkit-print-color-adjust:exact;print-color-adjust:exact}main{max-width:900px;margin:0 auto}h1{font-size:22px}.meta{color:#9aa0a6;font-size:13px}.turn{border:1px solid #44474d;border-radius:8px;padding:10px 14px;margin:12px 0;background:#26282c}.turn.user{border-left:4px solid #8ab4f8}.turn.assistant{border-left:4px solid #34a853}.who{font-weight:700;color:#9aa0a6;font-size:13px;margin-bottom:4px}pre.code{position:relative;background:#111215;border:1px solid #44474d;border-radius:6px;padding:10px;overflow:auto;white-space:pre-wrap}pre.code .lang{position:absolute;top:2px;right:8px;font-size:11px;color:#9aa0a6}code{font-family:ui-monospace,Consolas,monospace;font-size:13px}p code,li code{background:#111215;padding:1px 4px;border-radius:3px}a{color:#8ab4f8}table{border-collapse:collapse}td,th{border:1px solid #44474d;padding:3px 6px}blockquote{border-left:3px solid #44474d;margin:0;padding-left:10px;color:#c0c4c8}@page{margin:12mm;background:#1c1d20}`;
  function toHtml(c, turns = c.turns) {
    return `<!DOCTYPE html>\n<html lang="hu"><head><meta charset="utf-8"><title>${esc(c.title)}</title><style>${CSS}</style></head><body><main><h1>${esc(c.title)}</h1><div class="meta">${head(c).map(esc).join('<br>')}</div>` +
      turns.map(t => `<section class="turn ${t.role}"><div class="who">${esc(roleName(t.role, c.site))}${t.at ? ' · ' + esc(String(t.at).replace('T', ' ').slice(0, 16)) : ''}</div>${render(t.text)}</section>`).join('') + '</main></body></html>\n';
  }

  // ---------- ZIP („store” módszer, tömörítés nélkül; UTF-8 fájlnevek) ----------
  const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  const crc32 = (u8) => { let c = 0xFFFFFFFF; for (let i = 0; i < u8.length; i++) c = CRC[(c ^ u8[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
  const enc = (s) => typeof s === 'string' ? new TextEncoder().encode(s) : s;
  function zip(files) {   // files: [{ name, data: string | Uint8Array }] → Uint8Array
    const parts = [], central = []; let off = 0;
    const d = new Date(), time = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1), date = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
    for (const f of files) {
      const name = enc(f.name), data = enc(f.data), crc = crc32(data);
      const lh = new DataView(new ArrayBuffer(30));
      lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true); lh.setUint16(10, time, true); lh.setUint16(12, date, true);
      lh.setUint32(14, crc, true); lh.setUint32(18, data.length, true); lh.setUint32(22, data.length, true); lh.setUint16(26, name.length, true);
      parts.push(new Uint8Array(lh.buffer), name, data);
      const ch = new DataView(new ArrayBuffer(46));
      ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true); ch.setUint16(12, time, true); ch.setUint16(14, date, true);
      ch.setUint32(16, crc, true); ch.setUint32(20, data.length, true); ch.setUint32(24, data.length, true); ch.setUint16(28, name.length, true); ch.setUint32(42, off, true);
      central.push(new Uint8Array(ch.buffer), name);
      off += 30 + name.length + data.length;
    }
    const cl = central.reduce((n, x) => n + x.length, 0);
    const end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true); end.setUint32(12, cl, true); end.setUint32(16, off, true);
    const all = [...parts, ...central, new Uint8Array(end.buffer)], out = new Uint8Array(all.reduce((n, x) => n + x.length, 0));
    let p = 0; for (const x of all) { out.set(x, p); p += x.length; }
    return out;
  }

  // ---------- DOCX (sötét oldal, világos betű; címsorok, kódblokk egyszerű betűvel) ----------
  const xesc = (s) => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '');
  function toDocx(c, turns = c.turns) {
    const P = [];
    const run = (t, o = {}) => `<w:r><w:rPr>${o.b ? '<w:b/>' : ''}${o.mono ? '<w:rFonts w:ascii="Consolas" w:hAnsi="Consolas" w:cs="Consolas"/><w:sz w:val="19"/>' : ''}<w:color w:val="${o.color || 'E8EAED'}"/></w:rPr><w:t xml:space="preserve">${xesc(t)}</w:t></w:r>`;
    const para = (runs, o = {}) => P.push(`<w:p><w:pPr>${o.style ? `<w:pStyle w:val="${o.style}"/>` : ''}${o.shade ? `<w:shd w:val="clear" w:color="auto" w:fill="${o.shade}"/>` : ''}<w:spacing w:after="${o.after ?? 120}"/></w:pPr>${runs}</w:p>`);
    para(run(c.title, { b: true }), { style: 'Heading1' });
    for (const x of head(c)) para(run(x, { color: '9AA0A6' }), { after: 40 });
    for (const t of turns) {
      para(run(roleName(t.role, c.site) + (t.at ? ' · ' + String(t.at).replace('T', ' ').slice(0, 16) : ''), { b: true, color: t.role === 'user' ? '8AB4F8' : '34A853' }), { style: 'Heading2' });
      let code = null;   // v0.1.2: a nyitó kerítés (a záró ehhez illik – a ```` fájlban lévő ``` sor kód marad)
      for (const line of String(t.text).split('\n')) {
        if (code ? FX.closesFence(line, code) : FX.openFence(line)) { code = code ? null : FX.openFence(line); continue; }
        if (code) para(run(line || ' ', { mono: true }), { shade: '111215', after: 0 });
        else if (line.trim()) { const h = line.match(/^#{1,6}\s+(.*)$/); para(run((h ? h[1] : line).replace(/\*\*/g, ''), { b: !!h })); }
      }
    }
    const doc = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:background w:color="1C1D20"/><w:body>${P.join('')}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1000" w:right="1000" w:bottom="1000" w:left="1000" w:header="500" w:footer="500" w:gutter="0"/></w:sectPr></w:body></w:document>`;
    const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri"/><w:sz w:val="22"/><w:color w:val="E8EAED"/></w:rPr></w:rPrDefault></w:docDefaults><w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:pPr><w:spacing w:before="120" w:after="200"/></w:pPr><w:rPr><w:sz w:val="36"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:pPr><w:spacing w:before="240" w:after="80"/></w:pPr><w:rPr><w:sz w:val="26"/></w:rPr></w:style></w:styles>`;
    const settings = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:settings xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:displayBackgroundShape/></w:settings>`;
    return zip([
      { name: '[Content_Types].xml', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/></Types>' },
      { name: '_rels/.rels', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>' },
      { name: 'word/_rels/document.xml.rels', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings" Target="settings.xml"/></Relationships>' },
      { name: 'word/document.xml', data: doc }, { name: 'word/styles.xml', data: styles }, { name: 'word/settings.xml', data: settings }
    ]);
  }

  // ---------- két változat összevetése (soronként, a leghosszabb közös részsorozattal) ----------
  function diff(aText, bText) {
    const a = String(aText).split('\n'), b = String(bText).split('\n');
    // a közös eleje és vége levágva (a változások többnyire a végén vannak) – így nagy szövegnél is gyors
    let s = 0; while (s < a.length && s < b.length && a[s] === b[s]) s++;
    let e = 0; while (e < a.length - s && e < b.length - s && a[a.length - 1 - e] === b[b.length - 1 - e]) e++;
    const A1 = a.slice(s, a.length - e), B1 = b.slice(s, b.length - e), out = [];
    if (A1.length * B1.length > 4e6) { for (const x of A1) out.push({ t: '-', x }); for (const x of B1) out.push({ t: '+', x }); }
    else {
      const n = A1.length, m = B1.length, L = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
      for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) L[i][j] = A1[i] === B1[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
      let i = 0, j = 0;
      while (i < n && j < m) { if (A1[i] === B1[j]) { out.push({ t: ' ', x: A1[i] }); i++; j++; } else if (L[i + 1][j] >= L[i][j + 1]) out.push({ t: '-', x: A1[i++] }); else out.push({ t: '+', x: B1[j++] }); }
      while (i < n) out.push({ t: '-', x: A1[i++] }); while (j < m) out.push({ t: '+', x: B1[j++] });
    }
    return { same: s, sameEnd: e, lines: out, added: out.filter(x => x.t === '+').length, removed: out.filter(x => x.t === '-').length };
  }

  g.AIK_EX = { esc, render, toMd, toJson, toTxt, toHtml, toDocx, zip, crc32, diff, fileName, folderOf, roleName, CSS };
})(typeof self !== 'undefined' ? self : window);
