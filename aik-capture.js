// Segítő – MI-beszélgetések modul: tartalomszkript – a megnyitott beszélgetés mentése (v0.5.26 · modul v0.1.0)
// Csak a támogatott oldalakon fut (ChatGPT, Grok, Google AI-mód; a Gemini és a Claude a minta után). TELJESÍTMÉNY (CLAUDE.md):
// nem figyeli folyamatosan az egész oldalt – 6 másodpercenként (csak ha a lap látható) egy olcsó „aláírást” néz (a fordulók
// száma + az utolsó hossza); a teljes feldolgozás csak akkor fut, ha ez megváltozott ÉS két egymás utáni nézéskor ugyanaz
// (a válasz írása – „streaming” – befejeződött). Mentés magától csak akkor, ha az oldalnál be van kapcsolva (a modul saját
// Beállítások lapján; a Claude-nál alapból KI). Kézi mentés: a panel „Mentés most” üzenete (aik-save-now).
// Ha a modul ÖNÁLLÓ bővítményként is telepítve van, a Segítőben futó példány visszalép (ne mentsen kétszer).
(async function () {
  if (window.__aikCapture) return;
  window.__aikCapture = true;
  const A = window.AIK, AD = window.AIK_AD;
  if (!A || !AD) return;
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const root = document.documentElement;
  const integrated = chrome.runtime.getManifest().name === 'Segítő';
  if (!integrated) root.dataset.aikOwner = 'modul';
  else { await sleep(1500); if (root.dataset.aikOwner === 'modul') return; root.dataset.aikOwner = 'segito'; }

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
  chrome.runtime.onMessage.addListener((msg, _s, respond) => {
    if (!msg || msg.type !== 'aik-save-now') return false;
    capture(true).then(respond, (e) => respond({ ok: false, error: e && e.message || String(e) }));
    return true;
  });
})();
