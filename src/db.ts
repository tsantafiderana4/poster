/** Petit stockage IndexedDB : le projet en cours et les images (gardées en Blob). */

let dbp: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
  if (!dbp) {
    dbp = new Promise((res, rej) => {
      const r = indexedDB.open('poster-pro', 1);
      r.onupgradeneeded = () => {
        const d = r.result;
        if (!d.objectStoreNames.contains('kv')) d.createObjectStore('kv');
        if (!d.objectStoreNames.contains('images')) d.createObjectStore('images', { keyPath: 'id' });
      };
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
  }
  return dbp;
}

function req<T>(r: IDBRequest<T>) {
  return new Promise<T>((res, rej) => {
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}

async function store(name: string, mode: IDBTransactionMode) {
  return (await open()).transaction(name, mode).objectStore(name);
}

export interface StoredImage {
  id: string;
  name: string;
  w: number;
  h: number;
  blob: Blob;
}

export const idb = {
  async get<T>(s: string, k: string) {
    return req<T | undefined>((await store(s, 'readonly')).get(k));
  },
  async put(s: string, v: unknown, k?: string) {
    const st = await store(s, 'readwrite');
    await req(k === undefined ? st.put(v) : st.put(v, k));
  },
  async del(s: string, k: string) {
    await req((await store(s, 'readwrite')).delete(k));
  },
  async all<T>(s: string) {
    return req<T[]>((await store(s, 'readonly')).getAll());
  },
  async clear(s: string) {
    await req((await store(s, 'readwrite')).clear());
  },
};
