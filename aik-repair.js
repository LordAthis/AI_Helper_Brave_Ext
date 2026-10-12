// Segítő – MI-beszélgetések modul: a tördelés javítása (v0.5.28 · modul v0.1.2)
// A hiba (LordAthis mintája, Gemini-alkalmazás, 2026-10-12): a modell egy Markdown-FÁJLT ad egy ```markdown kódblokkban,
// és a fájlon belül is vannak kódblokkok (```powershell … ```). A Gemini megjelenítője nem kezeli az egymásba ágyazást:
//  (1) a fájl belső kódjának első záró ``` sora lezárja a KÜLSŐ blokkot → a fájl további része szövegként formázódik,
//  (2) a fájl saját záró ``` sora ezután ÚJ kódblokkot nyit → a modell utána írt, szöveges válasza kódblokkba kerül,
//  (3) a darabokra tört kód egy része kódblokkon kívül, sima szövegként jelenik meg, majd újra kódként folytatódik.
// Emiatt az összetartozó fájl nem másolható egyben, és a válasz áttekinthetetlen. (Ritkán más modellnél is előfordul.)
//
// A javítás a MÁR Markdownná alakított szövegen dolgozik (a mentett, régi beszélgetéseken is fut), tiszta függvényekkel:
//  – a ```markdown / ```md blokkot „tárolóként” olvassuk: a benne nyíló, nyelvvel jelölt (```powershell) vagy beljebb
//    húzott kódblokkokat a záró ``` a BELSŐ blokkhoz köti, így a fájl ott ér véget, ahol a modell szánta;
//  – a helyreállított fájl hosszabb (````) kerítést kap, így a benne lévő ``` sorok nem törik meg többé – egyben
//    másolható / letölthető, a fájl tartalma betűre az, amit a modell írt;
//  – két azonos kódblokk közé kiszakadt, csupa kódsorból álló szöveg visszakerül a kódba (óvatosan: egyetlen
//    mondatszerű sor is megakasztja).
// Az EREDETI szöveg mindig megmarad – a javított csak külön nézet / export (`fixed` mező), bármikor visszaváltható.
(function (g) {
  if (g.AIK_FIX) return;

  const FENCE = /^([ \t]*)(`{3,}|~{3,})[ \t]*([^\s`]*)[^`]*$/;   // kerítés-sor: behúzás, jel, (nyelv)
  const isContainer = (lang) => /^(markdown|md)$/i.test(lang || '');
  const fenceOf = (line) => { const m = line.match(FENCE); return m ? { indent: m[1].replace(/\t/g, '    ').length, mark: m[2], lang: m[3] || '' } : null; };

  // kódszerű sor? (a kiszakadt kód felismeréséhez) – óvatosan: a sima mondatot ne fogja meg
  const CODE_HINTS = [
    /[{}();]\s*$/, /^\s*[$#@]/, /^\s*(function|param|return|def|class|import|from|const|let|var|public|private|void|for|while|if|else|elseif|foreach|try|catch|finally|switch|using|echo)\b/i,
    /=\s*New-Object|Write-Host|\b(Get|Set|New|Test|Start|Stop|Invoke)-\w+|System\.\w+|\]::/, /;\s*$/, /=>/, /\$\w+\s*=/, /^\s*[}\])]+[;,]?\s*$/
  ];
  const PROSE = (l) => /[a-záéíóöőúüű]{3,}[ ,]+[a-záéíóöőúüű]{3,}[ ,]+[a-záéíóöőúüű]{3,}[ ,]+[a-záéíóöőúüű]{3,}/i.test(l.replace(/(["'`]).*?\1/g, ''))
    && !/[{};]\s*$/.test(l) && !/^\s*[$#]/.test(l);
  const codeScore = (line) => { if (!line.trim()) return 0; if (/^\s*(#{1,6}\s|[-*]\s|\d+\.\s|>\s|\|)/.test(line) && !/^\s*#\s*[\w$]/.test(line.replace(/^\s*#{2,}/, '##'))) return -1; if (PROSE(line)) return -1; return CODE_HINTS.some(r => r.test(line)) ? 1 : 0; };
  const guessLang = (lines) => {
    const t = lines.join('\n');
    if (/Write-Host|New-Object|param\s*\(|\$\w+\s*=|\[System\./.test(t)) return 'powershell';
    if (/^\s*(def|import|from)\b|print\(/m.test(t)) return 'python';
    if (/\b(const|let|var|function)\b|=>|console\.log/.test(t)) return 'javascript';
    if (/^\s*</.test(t) && /<\/\w+>/.test(t)) return 'html';
    return '';
  };

  // ---------- 1. tördelés-tudatos szétszedés ----------
  // Kimenet: [{ type:'text', lines:[] } | { type:'fence', mark, lang, indent, lines:[], closed, nested }]
  // A tárolóblokkon (```markdown) belül veremmel követjük a beágyazott kódot; minden más blokk a szokásos módon zárul
  // (azonos jel, legalább ilyen hosszú, nem beljebb húzott, nyelv nélküli kerítés).
  function parse(md) {
    const lines = String(md == null ? '' : md).split('\n'), out = [];
    let text = [];
    const flush = () => { if (text.length) { out.push({ type: 'text', lines: text }); text = []; } };
    for (let i = 0; i < lines.length; i++) {
      const f = fenceOf(lines[i]);
      if (!f) { text.push(lines[i]); continue; }
      flush();
      const b = { type: 'fence', mark: f.mark, lang: f.lang, indent: f.indent, lines: [], closed: false, nested: 0 };
      const cont = isContainer(f.lang), stack = [];
      for (i++; i < lines.length; i++) {
        const c = fenceOf(lines[i]);
        const closes = (o) => c && !c.lang && c.mark[0] === o.mark[0] && c.mark.length >= o.mark.length && c.indent <= o.indent;
        if (cont && c) {
          if (stack.length) {                                   // beágyazott kód belsejében: csak a záró számít
            if (!c.lang && c.mark[0] === stack[stack.length - 1].mark[0]) stack.pop();
          } else if (c.lang) { stack.push(c); b.nested++; }      // nyelvvel jelölt kerítés = beágyazott kód nyílik
          else if (c.indent > f.indent) { stack.push(c); b.nested++; }   // beljebb húzott (listán belüli) kód nyílik
          else if (closes(f)) { b.closed = true; break; }        // a fájl vége
          b.lines.push(lines[i]);
          continue;
        }
        if (closes(f)) { b.closed = true; break; }
        b.lines.push(lines[i]);
      }
      out.push(b);
    }
    flush();
    return out;
  }

  // ---------- 2. a kiszakadt kód visszafűzése ----------
  const allCode = (ls) => { const nz = ls.filter(l => l.trim()); return nz.length > 0 && nz.every(l => codeScore(l) > 0); };
  const sameLang = (a, b) => !a.lang || !b.lang || a.lang.toLowerCase() === b.lang.toLowerCase();
  function mergeLeaks(blocks, notes) {
    const out = [];
    for (let i = 0; i < blocks.length; i++) {
      const b = blocks[i];
      // kód – csak kódsorokból álló szöveg (legfeljebb 40 sor) – kód: egy blokk lesz belőle
      if (b.type === 'fence' && !isContainer(b.lang) && b.closed) {
        let cur = { ...b, lines: [...b.lines] };
        while (i + 2 < blocks.length && blocks[i + 1].type === 'text' && blocks[i + 2].type === 'fence' && !isContainer(blocks[i + 2].lang)
          && sameLang(cur, blocks[i + 2]) && blocks[i + 1].lines.length <= 40 && allCode(blocks[i + 1].lines)) {
          const mid = blocks[i + 1].lines.filter((l, k, a) => l.trim() || (k > 0 && k < a.length - 1));
          cur.lines = cur.lines.concat(mid, blocks[i + 2].lines);
          cur.lang = cur.lang || blocks[i + 2].lang;
          cur.closed = blocks[i + 2].closed;
          notes.merged++; i += 2;
        }
        out.push(cur);
      } else out.push(b);
    }
    return out;
  }

  // ---------- 3. összerakás ----------
  function fenceFor(lines, mark) {   // a tárolónak a benne lévő leghosszabb kerítésnél hosszabb jel kell
    let n = 0;
    for (const l of lines) { const f = fenceOf(l); if (f && f.mark[0] === '`') n = Math.max(n, f.mark.length); }
    return mark[0] === '~' ? mark : '`'.repeat(Math.max(mark.length, n ? n + 1 : 3));
  }
  function serialize(blocks) {
    return blocks.map(b => {
      if (b.type === 'text') return b.lines.join('\n');
      const fm = isContainer(b.lang) ? fenceFor(b.lines, b.mark) : b.mark;
      const pad = ' '.repeat(Math.min(b.indent, 3));
      return pad + fm + b.lang + '\n' + b.lines.join('\n') + (b.lines.length ? '\n' : '') + pad + fm;
    }).join('\n');
  }

  // egy válasz szövegének javítása → { text, changed, notes }
  function repairText(md) {
    const src = String(md == null ? '' : md);
    const notes = { files: 0, merged: 0 };
    let blocks = parse(src);
    for (const b of blocks) if (b.type === 'fence' && isContainer(b.lang) && b.nested) notes.files++;
    blocks = mergeLeaks(blocks, notes);
    if (!notes.files && !notes.merged) return { text: src, changed: false, notes };   // nincs mit javítani – nem nyúlunk hozzá
    const text = serialize(blocks);
    return { text, changed: text !== src, notes };
  }

  // elrontott-e a beszélgetés? (csak a válaszokat nézzük) → { garbled, turns:[index] }
  function scan(conv) {
    const turns = [];
    (conv.turns || []).forEach((t, i) => { if (t.role === 'assistant' && t.text && repairText(t.text).changed) turns.push(i); });
    return { garbled: turns.length > 0, turns };
  }

  // a beszélgetés javított változata: a hibás válaszokhoz `fixed` (+ `fixNotes`); az eredeti `text` marad.
  function repairConv(conv) {
    let garbled = 0;
    const turns = (conv.turns || []).map(t => {
      const nt = Object.assign({}, t); delete nt.fixed; delete nt.fixNotes;
      if (t.role !== 'assistant' || !t.text) return nt;
      const r = repairText(t.text);
      if (r.changed) { garbled++; nt.fixed = r.text; nt.fixNotes = r.notes; }
      return nt;
    });
    return Object.assign({}, conv, { turns, garbled: garbled > 0, garbledCount: garbled });
  }

  // a megjelenítéshez / exporthoz: a javított szöveg, ha van és azt kérik
  const turnText = (t, useFixed) => (useFixed && t.fixed) ? t.fixed : t.text;

  // a megjelenítő (aik-export.js) is ezt használja: kerítés-sor felismerése és a hozzá illő záró sor
  const openFence = (line) => { const f = fenceOf(line); return f ? { mark: f.mark, lang: f.lang, indent: f.indent } : null; };
  const closesFence = (line, o) => { const c = fenceOf(line); return !!(c && !c.lang && c.mark[0] === o.mark[0] && c.mark.length >= o.mark.length && c.indent <= Math.max(o.indent, 3)); };

  g.AIK_FIX = { parse, repairText, scan, repairConv, turnText, openFence, closesFence, isContainer, _codeScore: codeScore, _guessLang: guessLang };
})(typeof self !== 'undefined' ? self : window);
