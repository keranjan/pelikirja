// Pilvitallennus Supabaseen. Käytetään suoraan REST-rajapintaa, joten
// sovellus pysyy riippumattomana eikä offline-tuki tai yhden tiedoston
// versio riko mitään.
import { getState, replaceState, subscribe } from './store.js';
import { mergeStates, payload, stable } from './merge.js';

const CONFIG_KEY = 'pelikirja.cloud';
const SESSION_KEY = 'pelikirja.session';
const BASE_KEY = 'pelikirja.syncbase';
const TABLE = 'pelikirja';

const listeners = new Set();
let status = { state: 'off', lastSync: null, message: '' };
let syncing = false;
let pushTimer = null;
let started = false;

const read = (key, fallback = null) => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
};
const write = (key, value) => {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    console.warn('Tallennus epäonnistui:', e);
  }
};

/* ---------- Tila ---------- */

export const getStatus = () => status;
export const onStatus = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };

function setStatus(next) {
  status = { ...status, ...next };
  listeners.forEach((fn) => fn(status));
}

/* ---------- Asetukset ja istunto ---------- */

export const getConfig = () => read(CONFIG_KEY);
export const getSession = () => read(SESSION_KEY);
export const isConnected = () => !!(getConfig() && getSession());

export function setConfig(url, anonKey) {
  const clean = String(url || '').trim().replace(/\/+$/, '');
  if (!clean || !anonKey) throw new Error('Anna projektin osoite ja julkinen avain.');
  if (!/^https?:\/\//.test(clean)) throw new Error('Osoitteen pitää alkaa https://');
  write(CONFIG_KEY, { url: clean, anonKey: String(anonKey).trim() });
}

export function forgetConfig() {
  write(CONFIG_KEY, null);
  write(SESSION_KEY, null);
  write(BASE_KEY, null);
  setStatus({ state: 'off', message: '', lastSync: null });
}

/* ---------- Verkkokutsut ---------- */

async function call(path, { method = 'GET', body, token, headers = {} } = {}) {
  const cfg = getConfig();
  if (!cfg) throw new Error('Pilvitallennusta ei ole otettu käyttöön.');

  const res = await fetch(cfg.url + path, {
    method,
    cache: 'no-store',      // rajapinnan vastauksia ei saa lukea välimuistista
    headers: {
      apikey: cfg.anonKey,
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const msg = data?.error_description || data?.msg || data?.message || data?.error || `Virhe ${res.status}`;
    throw new Error(msg);
  }
  return data;
}

function storeSession(session) {
  if (!session?.access_token) throw new Error('Kirjautuminen ei palauttanut istuntoa.');
  write(SESSION_KEY, {
    access_token: session.access_token,
    refresh_token: session.refresh_token,
    expires_at: Date.now() + (session.expires_in || 3600) * 1000,
    user_id: session.user?.id,
    email: session.user?.email,
  });
  return getSession();
}

async function validToken() {
  const session = getSession();
  if (!session) throw new Error('Et ole kirjautunut.');
  if (session.expires_at - 60000 > Date.now()) return session;

  const fresh = await call('/auth/v1/token?grant_type=refresh_token', {
    method: 'POST',
    body: { refresh_token: session.refresh_token },
  });
  return storeSession(fresh);
}

/* ---------- Kirjautuminen ---------- */

export async function signUp(email, password) {
  const result = await call('/auth/v1/signup', { method: 'POST', body: { email, password } });
  if (!result?.access_token) {
    // Projektissa on sähköpostivarmistus päällä.
    throw new Error('Tili luotiin. Vahvista sähköpostiosoite ja kirjaudu sitten sisään.');
  }
  storeSession(result);
  await syncNow();
  return getSession();
}

export async function signIn(email, password) {
  const result = await call('/auth/v1/token?grant_type=password', {
    method: 'POST',
    body: { email, password },
  });
  storeSession(result);
  await syncNow();
  return getSession();
}

export async function signOut() {
  const session = getSession();
  try {
    if (session) await call('/auth/v1/logout', { method: 'POST', token: session.access_token });
  } catch {
    // Uloskirjautuminen onnistuu paikallisesti vaikka verkko ei vastaisi.
  }
  write(SESSION_KEY, null);
  write(BASE_KEY, null);
  setStatus({ state: 'off', message: '', lastSync: null });
}

/* ---------- Synkronointi ---------- */

const rowPath = (uid, extra = '') =>
  `/rest/v1/${TABLE}?user_id=eq.${encodeURIComponent(uid)}${extra}`;

async function fetchRow(session) {
  const rows = await call(rowPath(session.user_id, '&select=data,rev'), { token: session.access_token });
  return rows?.[0] || null;
}

/**
 * Hakee pilven version, yhdistää sen paikalliseen ja tallentaa tuloksen
 * molempiin suuntiin. Turvallinen kutsua koska tahansa.
 */
export async function syncNow({ silent = false } = {}) {
  if (!isConnected()) return { ok: false, reason: 'off' };
  if (syncing) return { ok: false, reason: 'busy' };
  if (navigator.onLine === false) {
    setStatus({ state: 'offline', message: 'Ei verkkoyhteyttä' });
    return { ok: false, reason: 'offline' };
  }

  syncing = true;
  if (!silent) setStatus({ state: 'syncing', message: '' });

  try {
    const session = await validToken();
    const local = payload(getState());
    const base = read(BASE_KEY);

    let row = await fetchRow(session);
    if (!row) {
      await call(`/rest/v1/${TABLE}`, {
        method: 'POST',
        token: session.access_token,
        headers: { Prefer: 'return=representation' },
        body: { user_id: session.user_id, data: local, rev: 1 },
      });
      write(BASE_KEY, local);
      setStatus({ state: 'idle', lastSync: new Date().toISOString(), message: '' });
      return { ok: true, conflicts: 0, created: true };
    }

    const merged = mergeStates(base, getState(), row.data || { players: [], matches: [], lineups: [], team: {} });

    // Paikallinen tila päivitetään vain jos se todella muuttui.
    if (stable(payload(getState())) !== stable(payload(merged.state))) {
      replaceState({ ...merged.state, version: 1 });
    }

    const next = payload(getState());
    if (stable(next) !== stable(row.data)) {
      let saved = await call(rowPath(session.user_id, `&rev=eq.${row.rev}`), {
        method: 'PATCH',
        token: session.access_token,
        headers: { Prefer: 'return=representation' },
        body: { data: next, rev: row.rev + 1, updated_at: new Date().toISOString() },
      });
      if (!saved?.length) {
        // Toinen laite ehti tallentaa välissä – haetaan uudestaan ja yritetään kerran.
        row = await fetchRow(session);
        const again = mergeStates(read(BASE_KEY), getState(), row.data);
        replaceState({ ...again.state, version: 1 });
        saved = await call(rowPath(session.user_id, `&rev=eq.${row.rev}`), {
          method: 'PATCH',
          token: session.access_token,
          headers: { Prefer: 'return=representation' },
          body: { data: payload(getState()), rev: row.rev + 1, updated_at: new Date().toISOString() },
        });
        if (!saved?.length) throw new Error('Pilven tiedot muuttuivat kesken tallennuksen. Yritä uudelleen.');
      }
    }

    write(BASE_KEY, payload(getState()));
    setStatus({ state: 'idle', lastSync: new Date().toISOString(), message: '' });
    return { ok: true, conflicts: merged.conflicts };
  } catch (e) {
    setStatus({ state: 'error', message: e.message || String(e) });
    return { ok: false, reason: 'error', error: e };
  } finally {
    syncing = false;
  }
}

/* ---------- Automaattinen synkronointi ---------- */

const schedulePush = () => {
  if (syncing) return;          // synkronointi muuttaa tilaa itse
  clearTimeout(pushTimer);
  pushTimer = setTimeout(() => syncNow({ silent: true }), 2500);
};

export function startAutoSync() {
  if (started) return;
  started = true;

  if (isConnected()) {
    setStatus({ state: 'idle' });
    syncNow({ silent: true });
  }

  subscribe(() => { if (isConnected()) schedulePush(); });

  window.addEventListener('online', () => { if (isConnected()) syncNow({ silent: true }); });
  window.addEventListener('offline', () => {
    if (isConnected()) setStatus({ state: 'offline', message: 'Ei verkkoyhteyttä' });
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && isConnected()) syncNow({ silent: true });
  });
}
