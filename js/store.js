// Tiny IndexedDB key-value store (photos are too big for localStorage).
const DB = 'wedding-maker';
const STORE = 'kv';
let dbp;

function db() {
  dbp ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbp;
}

function tx(mode, fn) {
  return db().then(d => new Promise((resolve, reject) => {
    const t = d.transaction(STORE, mode);
    const req = fn(t.objectStore(STORE));
    t.oncomplete = () => resolve(req?.result);
    t.onerror = () => reject(t.error);
  }));
}

export const get = key => tx('readonly', s => s.get(key));
export const set = (key, val) => tx('readwrite', s => s.put(val, key));
export const del = key => tx('readwrite', s => s.delete(key));
