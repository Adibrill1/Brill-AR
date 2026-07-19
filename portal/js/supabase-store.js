// Supabase-backed store: same interface as the local demo store, but rows live in
// Postgres and files in the public 'trigger-assets' bucket, so artists and admin
// share one dataset. Uses plain REST — no SDK, no build step.
import { config } from './config.js';

const U = config.supabaseUrl;
const K = config.supabaseAnonKey;
const AUTH = { apikey: K, Authorization: `Bearer ${K}` };
const ARTIST_KEY = 'pt_artist_id';

async function rest(method, path, body, extraHeaders = {}) {
  const res = await fetch(`${U}/rest/v1/${path}`, {
    method,
    headers: { ...AUTH, 'Content-Type': 'application/json', ...extraHeaders },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Supabase ${method} ${path} failed (${res.status}): ${await res.text()}`);
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

async function uploadFile(path, blob) {
  const res = await fetch(`${U}/storage/v1/object/trigger-assets/${path}`, {
    method: 'POST',
    headers: { ...AUTH, 'Content-Type': blob.type || 'application/octet-stream', 'x-upsert': 'true' },
    body: blob,
  });
  if (!res.ok) throw new Error(`upload ${path} failed (${res.status}): ${await res.text()}`);
  return path;
}

async function deleteFile(path) {
  if (!path) return;
  await fetch(`${U}/storage/v1/object/trigger-assets/${path}`, { method: 'DELETE', headers: AUTH })
    .catch(() => {});
}

function ext(name, fallback) {
  const m = /\.([a-z0-9]+)$/i.exec(name || '');
  return m ? m[1].toLowerCase() : fallback;
}

function rowToItem(r) {
  let elements = Array.isArray(r.elements) ? r.elements : [];
  if (!elements.length && r.content_path) {
    // legacy rows from before multi-element support
    elements = [{ kind: r.content_kind, name: r.content_name, path: r.content_path, fit: 'free', transform: {} }];
  }
  return {
    id: r.id, title: r.title, description: r.description,
    status: r.status, reason: r.reason, quality: r.quality,
    elements,
    imageW: r.image_w, imageH: r.image_h,
    createdAt: new Date(r.created_at).getTime(),
    scanCount: r.scan_count,
    artistName: r.artists?.name || '',
    artistCountry: r.artists?.country || '',
    _paths: { image: r.image_path, mind: r.mind_path, audio: r.audio_path },
  };
}

export const store = {
  mode: 'supabase',

  fileUrl(item, kind) {
    const p = item._paths?.[kind];
    return p ? `${U}/storage/v1/object/public/trigger-assets/${p}` : null;
  },

  elementUrl(_item, el) {
    return el.path ? `${U}/storage/v1/object/public/trigger-assets/${el.path}` : null;
  },

  async saveProfile(profile) {
    const id = localStorage.getItem(ARTIST_KEY);
    if (id) {
      await rest('PATCH', `artists?id=eq.${id}`, profile);
      return id;
    }
    const rows = await rest('POST', 'artists', profile, { Prefer: 'return=representation' });
    localStorage.setItem(ARTIST_KEY, rows[0].id);
    return rows[0].id;
  },

  async getProfile() {
    const id = localStorage.getItem(ARTIST_KEY);
    if (!id) return null;
    const rows = await rest('GET', `artists?id=eq.${id}&select=*`);
    return rows[0] || null;
  },

  async saveItem(item) {
    const dir = item.id;
    const imagePath = await uploadFile(`${dir}/image.${ext(item.imageBlob.name, 'png')}`, item.imageBlob);
    const mindPath = await uploadFile(`${dir}/target.mind`, item.mindBlob);
    const elements = [];
    for (let i = 0; i < item.elements.length; i++) {
      const el = item.elements[i];
      const fallback = { video: 'mp4', image: 'png', model: 'glb' }[el.kind];
      const path = await uploadFile(`${dir}/el${i}.${ext(el.name, fallback)}`, el.blob);
      elements.push({ kind: el.kind, name: el.name, path, fit: el.fit, transform: el.transform });
    }
    const audioPath = item.audioBlob
      ? await uploadFile(`${dir}/audio.${ext(item.audioBlob.name, 'mp3')}`, item.audioBlob)
      : null;
    await rest('POST', 'trigger_images', {
      id: item.id,
      artist_id: localStorage.getItem(ARTIST_KEY),
      title: item.title,
      description: item.description,
      status: item.status,
      reason: item.reason || '',
      quality: item.quality,
      elements,
      image_hash: item.imageHash || null,
      image_w: item.imageW || null,
      image_h: item.imageH || null,
      image_path: imagePath,
      mind_path: mindPath,
      audio_path: audioPath,
    });
  },

  async getItem(id) {
    const rows = await rest('GET', `trigger_images?id=eq.${id}&select=*`);
    return rows[0] ? rowToItem(rows[0]) : null;
  },

  async listItems() {
    const rows = await rest('GET', 'trigger_images?select=*,artists(name,country)&order=created_at.desc');
    return rows.map(rowToItem);
  },

  async recordScan(id) {
    await rest('POST', 'rpc/increment_scan', { trigger_id: id }).catch(() => {});
  },

  async listHashes() {
    const rows = await rest('GET', 'trigger_images?select=id,title,image_hash');
    return rows.filter((r) => r.image_hash);
  },

  async deleteItem(id) {
    const item = await this.getItem(id);
    if (item) {
      const paths = [...Object.values(item._paths), ...item.elements.map((e) => e.path)];
      await Promise.all(paths.map(deleteFile));
    }
    await rest('DELETE', `trigger_images?id=eq.${id}`);
  },

  async setStatus(id, status, reason = '') {
    await rest('PATCH', `trigger_images?id=eq.${id}`, { status, reason });
  },
};
