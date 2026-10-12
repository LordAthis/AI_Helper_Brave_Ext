// Segítő – MI-beszélgetések modul: saját adatbázis „segito-aik” (v0.5.26 · modul v0.1.0)
// TELJESEN KÜLÖN a Segítő többi adatától: nem megy a gépek közötti szinkronba, a Segítő exportjába / mentéseibe, és a
// Segítő többi része nem olvassa (önálló bővítményként úgyis saját eredete van).
//   convs    – egy beszélgetés legutóbbi állapota: { key: '<oldal>:<azonosító>', site, cid, title, url, turns, hash, text?,
//              words, langs, turnCount, firstSaved, lastSaved, lastSeen, firstAt, version, versions }
//   versions – változatok: { key: '<beszélgetés>#<n>', conv, n, at, type: 'új' | 'bővült' | 'változott', turns, hash, turnCount }
//   kv       – apró állapot (pl. a legutóbbi mentések naplója)
(function (g) {
  if (g.AIKDB) return;
  const NAME = 'segito-aik', VER = 1;
  let dbp = null;
  function open() {
    if (dbp) return dbp;
    dbp = new Promise((res, rej) => {
      const r = indexedDB.open(NAME, VER);
      r.onupgradeneeded = () => {
        const db = r.result;
        if (!db.objectStoreNames.contains('convs')) { const s = db.createObjectStore('convs', { keyPath: 'key' }); s.createIndex('site', 'site'); s.createIndex('lastSaved', 'lastSaved'); }
        if (!db.objectStoreNames.contains('versions')) { const s = db.createObjectStore('versions', { keyPath: 'key' }); s.createIndex('conv', 'conv'); }
        if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv', { keyPath: 'k' });
      };
      r.onsuccess = () => { const db = r.result; db.onversionchange = () => { db.close(); dbp = null; }; res(db); };
      r.onerror = () => { dbp = null; rej(r.error); };
    });
    return dbp;
  }
  const req = (r) => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  async function tx(stores, mode, fn) {
    const db = await open();
    return new Promise((res, rej) => {
      const t = db.transaction(stores, mode);
      let out;
      Promise.resolve(fn(t)).then(v => { out = v; }, e => { try { t.abort(); } catch (_) {} rej(e); });
      t.oncomplete = () => res(out); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error || new Error('megszakítva'));
    });
  }
  const get = (store, key) => tx([store], 'readonly', t => req(t.objectStore(store).get(key)));
  const put = (store, v) => tx([store], 'readwrite', t => { t.objectStore(store).put(v); });
  const del = (store, key) => tx([store], 'readwrite', t => { t.objectStore(store).delete(key); });
  const all = (store, index, query) => tx([store], 'readonly', t => req(index ? t.objectStore(store).index(index).getAll(query) : t.objectStore(store).getAll()));
  const count = (store) => tx([store], 'readonly', t => req(t.objectStore(store).count()));
  async function clearAll() { await tx(['convs', 'versions', 'kv'], 'readwrite', t => { for (const s of ['convs', 'versions', 'kv']) t.objectStore(s).clear(); }); }
  async function delConv(key) {
    const vs = await all('versions', 'conv', IDBKeyRange.only(key));
    await tx(['convs', 'versions'], 'readwrite', t => { t.objectStore('convs').delete(key); for (const v of vs) t.objectStore('versions').delete(v.key); });
  }
  const kv = { get: async (k, def) => { const r = await get('kv', k); return r ? r.v : def; }, set: (k, v) => put('kv', { k, v }) };
  g.AIKDB = { NAME, open, get, put, del, all, count, clearAll, delConv, kv, tx };
})(typeof self !== 'undefined' ? self : window);
