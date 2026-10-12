// Segítő – MI-beszélgetések modul: az ÖNÁLLÓ bővítmény háttere (v0.5.26 · modul v0.1.0)
// A Segítőn belül ezt nem használjuk – ott a Segítő háttere tölti be ugyanezeket a fájlokat (background/service-worker.js).
importScripts('aik-common.js', 'aik-db.js', 'aik-bg.js');
// az ikonra kattintva a panel nyílik (ha már nyitva van, arra a lapra vált)
chrome.action.onClicked.addListener(async () => {
  const url = chrome.runtime.getURL('aik.html');
  const [t] = await chrome.tabs.query({ url: url + '*' });
  if (t) { await chrome.tabs.update(t.id, { active: true }); await chrome.windows.update(t.windowId, { focused: true }).catch(() => {}); }
  else await chrome.tabs.create({ url });
});
