// Poly Haven integration: dynamically fetch free 3D models (GLB) into the AR scene.
//
// Three parts, per the product requirement:
//  1. API integration  — list models and resolve a direct GLB URL from the files JSON
//  2. Auto-scaling     — done at build time via normalizeToFit() (elements.js), which
//                        measures the model's bounding box and scales it to fit the
//                        physical trigger (1 unit = printed image width)
//  3. Caching          — Cache API: each GLB is downloaded once; later scans load it
//                        from local cache with no network request
//
// NOTE: runs on the visitor/artist device (needs internet on first use per model).
// Everything degrades gracefully — API failures surface as friendly errors, and
// already-cached models keep working offline.

const API = 'https://api.polyhaven.com';
const CACHE_NAME = 'pt-remote-glb-v1';

async function apiJson(path) {
  const res = await fetch(`${API}${path}`, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`Poly Haven API ${res.status}`);
  return res.json();
}

// 1. list available models: [{ id, name }]
export async function listPolyModels() {
  const assets = await apiJson('/assets?types=models');
  return Object.entries(assets)
    .map(([id, info]) => ({ id, name: info.name || id }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

// walk the files JSON and collect candidate GLB URLs with their resolution tag
function findGlbUrls(node, out = [], resTag = '') {
  if (!node || typeof node !== 'object') return out;
  for (const [key, val] of Object.entries(node)) {
    if (val && typeof val === 'object') {
      if (typeof val.url === 'string' && val.url.toLowerCase().endsWith('.glb')) {
        out.push({ url: val.url, res: resTag || key, size: val.size || 0 });
      } else {
        findGlbUrls(val, out, /^\d+k$/i.test(key) ? key : resTag);
      }
    }
  }
  return out;
}

// resolve a direct GLB URL for a model id — prefers the smallest resolution
// (AR on phones wants light models; auto-scaling makes physical size identical anyway)
export async function resolveModelUrl(id) {
  const files = await apiJson(`/files/${id}`);
  const candidates = findGlbUrls(files);
  if (!candidates.length) throw new Error('לא נמצא קובץ GLB למודל הזה');
  const order = { '1k': 0, '2k': 1, '4k': 2, '8k': 3 };
  candidates.sort((a, b) => (order[a.res] ?? 9) - (order[b.res] ?? 9) || a.size - b.size);
  return candidates[0].url;
}

// 3. cached download: first call hits the network, every later call is local
export async function fetchGlbCached(url) {
  if ('caches' in window) {
    try {
      const cache = await caches.open(CACHE_NAME);
      let res = await cache.match(url);
      if (!res) {
        res = await fetch(url);
        if (!res.ok) throw new Error(`GLB download failed (${res.status})`);
        await cache.put(url, res.clone());
      }
      return URL.createObjectURL(await res.blob());
    } catch (e) {
      if (String(e).includes('download failed')) throw e;
      // Cache API unavailable (e.g. private mode) — fall through to plain fetch
    }
  }
  const res = await fetch(url);
  if (!res.ok) throw new Error(`GLB download failed (${res.status})`);
  return URL.createObjectURL(await res.blob());
}
