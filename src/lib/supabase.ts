import { createClient } from '@supabase/supabase-js';

const cleanVal = (val: string | null | undefined): string => {
  if (!val) return '';
  return val.trim().replace(/^['"]|['"]$/g, '');
};

const isValidAnonKey = (k: string | null): boolean => {
  if (!k) return false;
  const cleaned = cleanVal(k);
  return cleaned.startsWith('eyJ');
};

const getRefFromJwt = (token: string | null | undefined): string => {
  if (!token) return '';
  try {
    const parts = token.trim().replace(/^['"]|['"]$/g, '').split('.');
    if (parts.length >= 2) {
      let base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
      while (base64.length % 4) {
        base64 += '=';
      }
      let decoded = '';
      if (typeof window !== 'undefined' && typeof window.atob === 'function') {
        decoded = window.atob(base64);
      } else if (typeof Buffer !== 'undefined') {
        decoded = Buffer.from(base64, 'base64').toString('utf8');
      } else if (typeof atob === 'function') {
        decoded = atob(base64);
      }
      const payload = JSON.parse(decoded);
      return payload.ref || '';
    }
  } catch (e) {}
  return '';
};

// Safe purge of all localStorage keys containing the stale project 'ksflmdvqvseiprebgrcp'
if (typeof window !== 'undefined') {
  try {
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key) {
        const val = localStorage.getItem(key);
        if (
          key.includes('ksflmdvqvseiprebgrcp') || 
          (val && (val.includes('ksflmdvqvseiprebgrcp') || getRefFromJwt(val) === 'ksflmdvqvseiprebgrcp'))
        ) {
          keysToRemove.push(key);
        }
      }
    }
    for (const key of keysToRemove) {
      localStorage.removeItem(key);
      console.log(`Force removed stale Supabase credentials key: ${key}`);
    }
  } catch (e) {
    console.error('Error auto-clearing stale localStorage keys:', e);
  }
}

const getConfig = () => {
  let envUrl = cleanVal(import.meta.env.VITE_SUPABASE_URL || '');
  let envKey = cleanVal(import.meta.env.VITE_SUPABASE_ANON_KEY || '');

  // Support fallback to process.env if defined via Vite Define
  try {
    const procUrl = (process.env.SUPABASE_URL) as string;
    if (procUrl && !envUrl) {
      envUrl = cleanVal(procUrl);
    }
  } catch (e) {}

  try {
    const procKey = (process.env.SUPABASE_ANON_KEY) as string;
    if (procKey && !envKey) {
      envKey = cleanVal(procKey);
    }
  } catch (e) {}

  // Filter out the old stale project url/key if stuck in env memory
  if (envUrl.includes('ksflmdvqvseiprebgrcp')) {
    envUrl = '';
  }
  if (envKey.includes('ksflmdvqvseiprebgrcp') || getRefFromJwt(envKey) === 'ksflmdvqvseiprebgrcp') {
    envKey = '';
  }

  const rawLocalStorageUrl = typeof window !== 'undefined' ? (localStorage.getItem('ENV_VITE_SUPABASE_URL') || localStorage.getItem('ENV_SUPABASE_URL') || '') : '';
  const rawLocalStorageKey = typeof window !== 'undefined' ? (localStorage.getItem('ENV_VITE_SUPABASE_ANON_KEY') || localStorage.getItem('ENV_SUPABASE_PUBLISHABLE_KEY') || '') : '';

  // Erase and ignore non-JWT keys from localStorage (such as sb_publishable_) since standard browser clients require the JWT eyJ...
  if (typeof window !== 'undefined' && rawLocalStorageKey && !isValidAnonKey(rawLocalStorageKey)) {
    console.warn(`[Supabase] Erasing invalid/non-JWT key from localStorage: ${rawLocalStorageKey}`);
    localStorage.removeItem('ENV_VITE_SUPABASE_ANON_KEY');
    localStorage.removeItem('ENV_SUPABASE_PUBLISHABLE_KEY');
  }

  if (getRefFromJwt(rawLocalStorageKey) === 'ksflmdvqvseiprebgrcp') {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('ENV_VITE_SUPABASE_ANON_KEY');
      localStorage.removeItem('ENV_SUPABASE_PUBLISHABLE_KEY');
    }
  }

  const localStorageUrl = rawLocalStorageUrl;
  const localStorageKey = isValidAnonKey(rawLocalStorageKey) && getRefFromJwt(rawLocalStorageKey) !== 'ksflmdvqvseiprebgrcp' ? rawLocalStorageKey : '';

  const secretKey = typeof window !== 'undefined' ? (localStorage.getItem('ENV_SUPABASE_SECRET_KEY') || '') : '';
  const jwksUrl = typeof window !== 'undefined' ? (localStorage.getItem('ENV_SUPABASE_JWKS_URL') || '') : '';

  // Set default fallback values to the active project so it works out-of-the-box
  const fallbackUrl = 'https://hvvhdfucejsuileacvjo.supabase.co';
  const fallbackKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh2dmhkZnVjZWpzdWlsZWFjdmpvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE4ODQwNDEsImV4cCI6MjA5NzQ2MDA0MX0.X2CBQFZBFet-AD9mX5L_ipcmV491dg62-Et2DO6Hc2I';

  let url = envUrl || localStorageUrl || fallbackUrl;
  let key = envKey || localStorageKey || fallbackKey;

  // Final check to completely block the old project url/key from ever leaking through
  if (url.includes('ksflmdvqvseiprebgrcp') || !url) {
    url = fallbackUrl;
  }
  if (key.includes('ksflmdvqvseiprebgrcp') || getRefFromJwt(key) === 'ksflmdvqvseiprebgrcp' || !isValidAnonKey(key)) {
    key = fallbackKey;
  }

  // Safe sync back to ensure local cached versions are kept updated with the active project
  if (typeof window !== 'undefined' && url && isValidAnonKey(key)) {
    localStorage.setItem('ENV_VITE_SUPABASE_URL', url);
    localStorage.setItem('ENV_SUPABASE_URL', url);
    localStorage.setItem('ENV_VITE_SUPABASE_ANON_KEY', key);
    localStorage.setItem('ENV_SUPABASE_PUBLISHABLE_KEY', key);
  }

  return { url, key, secretKey, jwksUrl };
};

export const hasSupabaseConfig = () => {
  const c = getConfig();
  return Boolean(c.url && c.key);
};

const c = getConfig();
console.log('[Supabase Client Initialization] Loaded URL:', c.url);

if (!c.url || !c.key) {
  console.warn('Supabase credentials missing. Please set SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY (or use UI setup prompt).');
}

export const supabase = createClient(
  c.url || 'https://placeholder.supabase.co',
  c.key || 'placeholder'
);

export const supabaseAdmin = supabase;

