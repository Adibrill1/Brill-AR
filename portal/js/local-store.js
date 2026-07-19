// Storage adapter for the artist portal.
// Demo mode: everything lives in this browser's IndexedDB (blobs included), so the
// full flow is testable with no backend. The exported API is deliberately the shape
// a SupabaseStore will implement later — swap the implementation, keep the pages.

const DB_NAME = 'peace-tech-portal';
const DB_VERSION = 2;

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const d = req.result;
      if (!d.objectStoreNames.contains('items')) {
        d.createObjectStore('items', { keyPath: 'id' });
      }
      if (!d.objectStoreNames.contains('profile')) {
        d.createObjectStore('profile', { keyPath: 'key' });
      }
      if (!d.objectStoreNames.contains('library')) {
        d.createObjectStore('library', { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

const dbPromise = openDB();

async function tx(store, mode, fn) {
  const d = await dbPromise;
  return new Promise((resolve, reject) => {
    const t = d.transaction(store, mode);
    const req = fn(t.objectStore(store));
    t.oncomplete = () => resolve(req.result);
    t.onerror = () => reject(t.error);
  });
}

const BLOB_KEY = { image: 'imageBlob', mind: 'mindBlob', content: 'contentBlob', audio: 'audioBlob' };

export const store = {
  mode: 'local',

  fileUrl(item, kind) {
    const blob = item[BLOB_KEY[kind]];
    return blob ? URL.createObjectURL(blob) : null;
  },

  elementUrl(_item, el) {
    return el.blob ? URL.createObjectURL(el.blob) : null;
  },

  async saveProfile(profile) {
    return tx('profile', 'readwrite', (s) => s.put({ key: 'me', ...profile }));
  },
  async getProfile() {
    return tx('profile', 'readonly', (s) => s.get('me'));
  },
  // item: { id, title, description, status: 'pending'|'approved'|'rejected', reason,
  //         quality: {score, grade, stats}, imageBlob, mindBlob,
  //         contentKind: 'model'|'video', contentBlob, contentName, audioBlob, createdAt }
  async saveItem(item) {
    return tx('items', 'readwrite', (s) => s.put(item));
  },
  async getItem(id) {
    return tx('items', 'readonly', (s) => s.get(id));
  },
  async listItems() {
    const items = await tx('items', 'readonly', (s) => s.getAll());
    return items.sort((a, b) => b.createdAt - a.createdAt);
  },

  async listHashes() {
    const items = await tx('items', 'readonly', (s) => s.getAll());
    return items.filter((i) => i.imageHash)
      .map((i) => ({ id: i.id, title: i.title, image_hash: i.imageHash }));
  },
  async deleteItem(id) {
    return tx('items', 'readwrite', (s) => s.delete(id));
  },
  // ---- community shared library (3D elements + stickers) ----
  libraryAssetUrl(asset) {
    return asset.blob ? URL.createObjectURL(asset.blob) : null;
  },

  async saveLibraryAsset(asset) {
    return tx('library', 'readwrite', (s) => s.put({ ...asset, status: asset.status || 'pending', createdAt: Date.now() }));
  },

  async listLibraryAssets() {
    const rows = await tx('library', 'readonly', (s) => s.getAll());
    return rows.sort((a, b) => b.createdAt - a.createdAt);
  },

  async setLibraryStatus(id, status) {
    const asset = await tx('library', 'readonly', (s) => s.get(id));
    if (!asset) return;
    asset.status = status;
    return tx('library', 'readwrite', (s) => s.put(asset));
  },

  async recordScan(id) {
    const item = await this.getItem(id);
    if (!item) return;
    item.scanCount = (item.scanCount || 0) + 1;
    return this.saveItem(item);
  },

  async setStatus(id, status, reason = '') {
    const item = await this.getItem(id);
    if (!item) throw new Error('item not found: ' + id);
    item.status = status;
    item.reason = reason;
    return this.saveItem(item);
  },
};
