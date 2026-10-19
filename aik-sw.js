// Segítő – MI-beszélgetések modul: az ÖNÁLLÓ bővítmény háttere (v0.5.37 · modul v0.1.6)
// A Segítőn belül ezt nem használjuk – ott a Segítő háttere tölti be ugyanezeket a fájlokat (background/service-worker.js).
importScripts('aik-common.js', 'aik-repair.js', 'aik-db.js', 'aik-bg.js');
// v0.1.6: telepítés / frissítés után a már nyitott MI-lapokba újra betölti a tartalomszkriptet (különben ott a frissítés után
// a régi, árva példány marad, és sem az automatikus, sem a kézi mentés nem működik az oldal újratöltéséig)
chrome.runtime.onInstalled.addListener(async () => {
  for (const cs of chrome.runtime.getManifest().content_scripts || []) {
    let tabs = [];
    try { tabs = await chrome.tabs.query({ url: cs.matches }); } catch (_) { continue; }
    for (const t of tabs) if (t.id && !t.discarded) await chrome.scripting.executeScript({ target: { tabId: t.id }, files: cs.js }).catch(() => {});
  }
});
// az ikonra kattintva a panel nyílik (ha már nyitva van, arra a lapra vált)
chrome.action.onClicked.addListener(async () => {
  const url = chrome.runtime.getURL('aik.html');
  const [t] = await chrome.tabs.query({ url: url + '*' });
  if (t) { await chrome.tabs.update(t.id, { active: true }); await chrome.windows.update(t.windowId, { focused: true }).catch(() => {}); }
  else await chrome.tabs.create({ url });
});
