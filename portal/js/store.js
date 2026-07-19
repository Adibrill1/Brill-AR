// Picks the storage backend: Supabase when a key is configured, local demo otherwise.
// Pages import { store } from here and never care which backend is active.
import { config } from './config.js';

// ?backend=local forces demo mode (used by automated tests and offline development)
const forceLocal = new URLSearchParams(location.search).get('backend') === 'local';

let impl;
if (!forceLocal && config.supabaseUrl && config.supabaseAnonKey) {
  ({ store: impl } = await import('./supabase-store.js'));
} else {
  ({ store: impl } = await import('./local-store.js'));
}

export const store = impl;
export const backendMode = impl.mode;

// update the banner on pages that have one
const banner = document.getElementById('modeBanner');
if (banner && backendMode === 'supabase') {
  banner.textContent = 'מחובר לשרת — הנתונים משותפים לכל היוצרים';
  banner.style.background = '#27ae60';
  banner.style.color = '#fff';
}
