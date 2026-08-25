// Tilanhallinta ja tallennus (localStorage).
import { getFormation } from './formations.js';

const KEY = 'pelikirja.v1';
const listeners = new Set();

export const uid = () =>
  Date.now().toString(36).slice(-5) + Math.random().toString(36).slice(2, 7);

const emptyState = () => ({
  version: 1,
  team: { name: 'Oma joukkue', season: String(new Date().getFullYear()) },
  players: [],
  lineups: [],   // tallennetut kokoonpanopohjat
  matches: [],
});

export function emptyLineup(formationId = '4-4-2') {
  const f = getFormation(formationId);
  return { formation: f.id, slots: f.slots.map(() => null), bench: [], unavailable: [] };
}

function migrate(data) {
  const base = emptyState();
  if (!data || typeof data !== 'object') return base;
  const st = { ...base, ...data };
  st.team = { ...base.team, ...(data.team || {}) };
  st.players = Array.isArray(data.players) ? data.players : [];
  st.lineups = Array.isArray(data.lineups) ? data.lineups : [];
  st.matches = Array.isArray(data.matches) ? data.matches : [];
  for (const m of st.matches) {
    if (!m.lineup) m.lineup = emptyLineup();
    if (!Array.isArray(m.lineup.unavailable)) m.lineup.unavailable = [];
    if (!Array.isArray(m.lineup.bench)) m.lineup.bench = [];
  }
  return st;
}

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    return migrate(raw ? JSON.parse(raw) : null);
  } catch (e) {
    console.warn('Tallennetun datan luku epäonnistui:', e);
    return emptyState();
  }
}

let state = load();

export const getState = () => state;
export const subscribe = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };

export function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch (e) {
    console.warn('Tallennus epäonnistui:', e);
  }
}

/** Muokkaa tilaa ja ilmoita kuuntelijoille. */
export function update(mutator) {
  mutator(state);
  save();
  listeners.forEach((fn) => fn(state));
}

export function replaceState(next) {
  state = migrate(next);
  save();
  listeners.forEach((fn) => fn(state));
}

export const resetAll = () => replaceState(emptyState());

/* ---------- Pelaajat ---------- */

export const playerById = (id) => state.players.find((p) => p.id === id) || null;

export const playerName = (id) => {
  const p = playerById(id);
  return p ? p.name : 'Tuntematon';
};

export const sortedPlayers = (players = state.players) =>
  [...players].sort((a, b) => {
    const an = a.number ?? 999, bn = b.number ?? 999;
    if (an !== bn) return an - bn;
    return a.name.localeCompare(b.name, 'fi');
  });

export function addPlayer(data) {
  const p = { id: uid(), name: '', number: null, roles: [], foot: '', notes: '', active: true, ...data };
  update((st) => { st.players.push(p); });
  return p;
}

export function updatePlayer(id, data) {
  update((st) => {
    const p = st.players.find((x) => x.id === id);
    if (p) Object.assign(p, data);
  });
}

export function removePlayer(id) {
  update((st) => {
    st.players = st.players.filter((p) => p.id !== id);
    const clean = (lu) => {
      if (!lu) return;
      lu.slots = lu.slots.map((v) => (v === id ? null : v));
      lu.bench = lu.bench.filter((v) => v !== id);
      lu.unavailable = (lu.unavailable || []).filter((v) => v !== id);
    };
    st.lineups.forEach((l) => clean(l.lineup));
    st.matches.forEach((m) => {
      clean(m.lineup);
      if (m.result) m.result.events = m.result.events.filter((e) => e.scorerId !== id && e.assistId !== id);
    });
  });
}

/* ---------- Kokoonpanopohjat ---------- */

export const lineupById = (id) => state.lineups.find((l) => l.id === id) || null;

export function addLineup(name, formationId) {
  const l = { id: uid(), name, lineup: emptyLineup(formationId), createdAt: new Date().toISOString() };
  update((st) => { st.lineups.push(l); });
  return l;
}

export function removeLineup(id) {
  update((st) => { st.lineups = st.lineups.filter((l) => l.id !== id); });
}

/* ---------- Ottelut ---------- */

export const matchById = (id) => state.matches.find((m) => m.id === id) || null;

export function addMatch(data) {
  const m = {
    id: uid(),
    date: new Date().toISOString().slice(0, 10),
    time: '18:00',
    opponent: '',
    home: true,
    venue: '',
    type: 'ottelu',           // ottelu | turnaus | harjoitus
    notes: '',
    lineup: emptyLineup(),
    result: null,             // { gf, ga, events:[{id, scorerId, assistId, minute}], notes }
    ...data,
  };
  update((st) => { st.matches.push(m); });
  return m;
}

export function updateMatch(id, data) {
  update((st) => {
    const m = st.matches.find((x) => x.id === id);
    if (m) Object.assign(m, data);
  });
}

export function removeMatch(id) {
  update((st) => { st.matches = st.matches.filter((m) => m.id !== id); });
}

export const matchKickoff = (m) => new Date(`${m.date}T${m.time || '00:00'}`);
export const isPlayed = (m) => !!m.result;

export const sortedMatches = (matches = state.matches) =>
  [...matches].sort((a, b) => matchKickoff(a) - matchKickoff(b));

export function upcomingMatches() {
  const now = Date.now() - 3 * 3600 * 1000; // ottelu näkyy tulevissa vielä 3 h alun jälkeen
  return sortedMatches().filter((m) => !isPlayed(m) && matchKickoff(m).getTime() >= now);
}

export function pastMatches() {
  const up = new Set(upcomingMatches().map((m) => m.id));
  return sortedMatches().filter((m) => !up.has(m.id)).reverse();
}

/* ---------- Kokoonpanon apurit ---------- */

/** Vaihtaa systeemin ja säilyttää pelaajat paikkaindeksin mukaan. */
export function setFormation(lineup, formationId) {
  const f = getFormation(formationId);
  const old = lineup.slots || [];
  const next = f.slots.map((_, i) => old[i] ?? null);
  const dropped = old.slice(f.slots.length).filter(Boolean);
  lineup.formation = f.id;
  lineup.slots = next;
  for (const id of dropped) if (!lineup.bench.includes(id)) lineup.bench.push(id);
}

/** Asettaa pelaajan paikkaan ja poistaa hänet muualta kokoonpanosta. */
export function assignToSlot(lineup, slotIndex, playerId) {
  if (playerId) {
    lineup.slots = lineup.slots.map((v, i) => (v === playerId && i !== slotIndex ? null : v));
    lineup.bench = lineup.bench.filter((v) => v !== playerId);
    lineup.unavailable = (lineup.unavailable || []).filter((v) => v !== playerId);
  }
  lineup.slots[slotIndex] = playerId;
}

export function toggleBench(lineup, playerId) {
  if (lineup.bench.includes(playerId)) {
    lineup.bench = lineup.bench.filter((v) => v !== playerId);
  } else {
    lineup.slots = lineup.slots.map((v) => (v === playerId ? null : v));
    lineup.unavailable = (lineup.unavailable || []).filter((v) => v !== playerId);
    lineup.bench.push(playerId);
  }
}

export function toggleUnavailable(lineup, playerId) {
  lineup.unavailable = lineup.unavailable || [];
  if (lineup.unavailable.includes(playerId)) {
    lineup.unavailable = lineup.unavailable.filter((v) => v !== playerId);
  } else {
    lineup.slots = lineup.slots.map((v) => (v === playerId ? null : v));
    lineup.bench = lineup.bench.filter((v) => v !== playerId);
    lineup.unavailable.push(playerId);
  }
}

export const lineupRole = (lineup, playerId) => {
  const i = lineup.slots.indexOf(playerId);
  if (i >= 0) return 'aloittava';
  if (lineup.bench.includes(playerId)) return 'vaihto';
  if ((lineup.unavailable || []).includes(playerId)) return 'poissa';
  return null;
};

export const cloneLineup = (lu) => JSON.parse(JSON.stringify(lu));

/* ---------- Vienti ja tuonti ---------- */

export const exportJSON = () => JSON.stringify(state, null, 2);

export function importJSON(text) {
  const data = JSON.parse(text);
  if (!data || typeof data !== 'object' || !Array.isArray(data.players)) {
    throw new Error('Tiedosto ei ole Pelikirjan varmuuskopio.');
  }
  replaceState(data);
}
