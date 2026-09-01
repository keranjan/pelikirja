// Tilanhallinta ja tallennus (localStorage).
import { getFormation } from './formations.js';
import { emptyDrill } from './drills.js';
import { DEFAULT_TEAM_NAME } from './merge.js';
import { emptyTiming, clockSeconds, onField } from './timing.js';

const KEY = 'pelikirja.v1';
const listeners = new Set();   // näkymän uudelleenpiirto
const savers = new Set();      // kuuntelijat, jotka tarvitsevat myös hiljaiset muutokset

export const uid = () =>
  Date.now().toString(36).slice(-5) + Math.random().toString(36).slice(2, 7);

/** Valmennuksen ja toimihenkilöiden tehtävät. */
export const STAFF_ROLES = {
  paavalmentaja: 'Päävalmentaja',
  apuvalmentaja: 'Valmentaja',   // avain säilyy, jotta vanha data toimii
  mv_valmentaja: 'Maalivahtivalmentaja',
  joukkueenjohtaja: 'Joukkueenjohtaja',
  huoltaja: 'Huoltaja',
  muu: 'Muu toimihenkilö',
};

const emptyState = () => ({
  version: 1,
  team: { name: DEFAULT_TEAM_NAME, season: String(new Date().getFullYear()), theme: 'system' },
  players: [],
  staff: [],
  lineups: [],   // tallennetut kokoonpanopohjat
  drills: [],    // alkulämmittelyt ja muut harjoitukset
  matches: [],
});

export function emptyLineup(formationId = '4-4-2') {
  const f = getFormation(formationId);
  return {
    formation: f.id,
    slots: f.slots.map(() => null),
    bench: [],       // ryhmässä mutta ei aloituskokoonpanossa
    positions: {},   // paikkaindeksi -> { x, y }, kun pelaajaa on siirretty kentällä
    drawings: [],    // taktiikkapiirrokset
    staff: [],       // otteluun mukaan merkityt valmentajat ja toimihenkilöt
  };
}

function migrate(data) {
  const base = emptyState();
  if (!data || typeof data !== 'object') return base;
  const st = { ...base, ...data };
  st.team = { ...base.team, ...(data.team || {}) };
  st.players = Array.isArray(data.players) ? data.players : [];
  st.staff = Array.isArray(data.staff) ? data.staff : [];
  // Pelipaikkojen nimet muuttuivat: DKK -> AKK, HKK -> YKK.
  const RENAMED = { DKK: 'AKK', HKK: 'YKK' };
  for (const p of st.players) {
    if (Array.isArray(p.roles)) p.roles = p.roles.map((r) => RENAMED[r] || r);
  }
  st.lineups = Array.isArray(data.lineups) ? data.lineups : [];
  st.drills = Array.isArray(data.drills) ? data.drills : [];
  for (const d of st.drills) {
    if (!Array.isArray(d.elements)) d.elements = [];
  }
  st.matches = Array.isArray(data.matches) ? data.matches : [];
  for (const m of st.matches) {
    if (!m.lineup) m.lineup = emptyLineup();
    // Arvosana oli aiemmin 1–5 tähteä, nyt kouluasteikko 4–10.
    const r = m.result;
    if (r && typeof r.rating === 'number' && r.ratingMax !== 10) {
      r.rating = Math.round((4 + (r.rating - 1) * 1.5) * 2) / 2;
      r.ratingMax = 10;
    }
  }
  for (const l of [...st.lineups.map((x) => x.lineup), ...st.matches.map((m) => m.lineup)]) {
    if (!l) continue;
    if (!Array.isArray(l.bench)) l.bench = [];
    // Poissaolot päätellään nykyään ryhmävalinnasta, joten vanha lista poistetaan.
    if (l.unavailable) delete l.unavailable;
    if (!Array.isArray(l.drawings)) l.drawings = [];
    if (!Array.isArray(l.staff)) l.staff = [];
    if (!l.positions || typeof l.positions !== 'object') l.positions = {};
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
/** Kuulee myös hiljaiset muutokset – pilvisynkronointi tarvitsee kaikki. */
export const subscribeAll = (fn) => { savers.add(fn); return () => savers.delete(fn); };

export function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch (e) {
    console.warn('Tallennus epäonnistui:', e);
  }
}

/** Muokkaa tilaa ja ilmoita kuuntelijoille. */
/**
 * Muuttaa tilan ja tallentaa sen. Vaihtoehto { silent: true } jättää näkymän
 * piirtämättä uudelleen: sitä käytetään tekstikentissä, joissa uudelleenpiirto
 * veisi kohdistuksen ja söisi juuri alkaneen napautuksen.
 */
export function update(mutator, { silent = false } = {}) {
  mutator(state);
  save();
  savers.forEach((fn) => fn(state));
  if (!silent) listeners.forEach((fn) => fn(state));
}

export function replaceState(next) {
  state = migrate(next);
  save();
  listeners.forEach((fn) => fn(state));
}

export const resetAll = () => replaceState(emptyState());

/** Ulkoasu: 'system' | 'light' | 'dark'. Tumma sopii iltapeleihin. */
export function applyTheme(theme = state.team.theme) {
  const root = document.documentElement;
  if (theme === 'light' || theme === 'dark') root.dataset.theme = theme;
  else delete root.dataset.theme;
}

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
    };
    st.lineups.forEach((l) => clean(l.lineup));
    st.matches.forEach((m) => {
      clean(m.lineup);
      if (m.result) m.result.events = m.result.events.filter((e) => e.scorerId !== id && e.assistId !== id);
    });
  });
}

/* ---------- Valmentajat ja toimihenkilöt ---------- */

export const staffById = (id) => state.staff.find((x) => x.id === id) || null;

export const staffName = (id) => staffById(id)?.name || 'Tuntematon';

/** Järjestys tehtävän mukaan, jotta päävalmentaja on aina ensin. */
export const sortedStaff = (staff = state.staff) => {
  const order = Object.keys(STAFF_ROLES);
  return [...staff].sort((a, b) => {
    const ai = order.indexOf(a.role), bi = order.indexOf(b.role);
    if (ai !== bi) return (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi);
    return a.name.localeCompare(b.name, 'fi');
  });
};

export function addStaff(data) {
  const person = { id: uid(), name: '', role: 'apuvalmentaja', phone: '', notes: '', active: true, ...data };
  update((st) => { st.staff.push(person); });
  return person;
}

export function updateStaff(id, data) {
  update((st) => {
    const person = st.staff.find((x) => x.id === id);
    if (person) Object.assign(person, data);
  });
}

export function removeStaff(id) {
  update((st) => {
    st.staff = st.staff.filter((x) => x.id !== id);
    const clean = (lu) => { if (lu) lu.staff = (lu.staff || []).filter((v) => v !== id); };
    st.lineups.forEach((l) => clean(l.lineup));
    st.matches.forEach((m) => clean(m.lineup));
  });
}

export function toggleLineupStaff(lineup, staffId) {
  if (!Array.isArray(lineup.staff)) lineup.staff = [];
  lineup.staff = lineup.staff.includes(staffId)
    ? lineup.staff.filter((v) => v !== staffId)
    : [...lineup.staff, staffId];
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

/* ---------- Harjoitukset (alkulämmittely) ---------- */

export const drillById = (id) => state.drills.find((d) => d.id === id) || null;

export const sortedDrills = () =>
  [...state.drills].sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));

export function addDrill(name) {
  const d = emptyDrill(uid(), name);
  update((st) => { st.drills.push(d); });
  return d;
}

export function updateDrill(id, data, opts) {
  update((st) => {
    const d = st.drills.find((x) => x.id === id);
    if (d) Object.assign(d, data);
  }, opts);
}

export function removeDrill(id) {
  update((st) => { st.drills = st.drills.filter((d) => d.id !== id); });
}

/* ---------- Ottelut ---------- */

export const matchById = (id) => state.matches.find((m) => m.id === id) || null;

export function addMatch(data) {
  const m = {
    id: uid(),
    date: new Date().toISOString().slice(0, 10),
    time: '18:00',
    opponent: '',
    team: '',                 // oma joukkue, kun seurassa on useampi (esim. Ilves Beta)
    home: true,
    venue: '',
    type: 'ottelu',           // ottelu | turnaus | harjoitus
    videoUrl: '',             // esim. Veo-tallenne ottelusta
    notes: '',
    lineup: emptyLineup(),
    timing: null,             // peliaikaseuranta, ks. js/timing.js
    result: null,             // { gf, ga, events:[...], rating, notes } – ks. RATINGS
    ...data,
  };
  update((st) => { st.matches.push(m); });
  return m;
}

/** Valmentajan arvosana ottelulle kouluasteikolla 4–10, puolikkaan tarkkuudella. */
export const RATING_MIN = 4;
export const RATING_MAX = 10;
export const RATING_STEP = 0.5;
export const RATINGS = {
  4: 'Heikko',
  5: 'Välttävä',
  6: 'Kohtalainen',
  7: 'Tyydyttävä',
  8: 'Hyvä',
  9: 'Kiitettävä',
  10: 'Erinomainen',
};

/** Arvosanan sanallinen kuvaus: puolikas näkyy plussana, esim. "Hyvä +". */
export function ratingLabel(value) {
  if (typeof value !== 'number') return '';
  const whole = Math.floor(value);
  return RATINGS[whole] ? RATINGS[whole] + (value > whole ? ' +' : '') : '';
}

/** Arvosana suomalaisittain: 8 -> "8", 8.5 -> "8,5". */
export const fmtRating = (value) =>
  (typeof value === 'number' ? String(Math.round(value * 10) / 10).replace('.', ',') : '');

/** Pitää arvosanan asteikolla ja puolikkaan tarkkuudella. */
export const clampRating = (value) =>
  Math.min(RATING_MAX, Math.max(RATING_MIN, Math.round(value / RATING_STEP) * RATING_STEP));

/** Arvosanan keskiarvo niistä otteluista, joille se on annettu. */
export function averageRating(matches) {
  const given = matches.map((m) => m.result?.rating).filter((v) => typeof v === 'number' && v > 0);
  if (!given.length) return null;
  return { avg: given.reduce((a, b) => a + b, 0) / given.length, count: given.length };
}

/**
 * Ottelun tulos koti–vieras-järjestyksessä, kuten sarjaohjelmassa: vierasottelun
 * 3–4 tarkoittaa oman joukkueen 4:ää maalia. gf ja ga ovat aina oman joukkueen
 * tekemät ja päästämät.
 */
export function scoreText(match, result = match?.result) {
  if (!result) return '';
  return match?.home === false ? `${result.ga}–${result.gf}` : `${result.gf}–${result.ga}`;
}

/** Otteluissa esiintyvät omat joukkueet aakkosjärjestyksessä. */
export function matchTeams(matches = getState().matches) {
  return [...new Set(matches.map((m) => (m.team || '').trim()).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, 'fi'));
}

export function updateMatch(id, data, opts) {
  update((st) => {
    const m = st.matches.find((x) => x.id === id);
    if (m) Object.assign(m, data);
  }, opts);
}

export function removeMatch(id) {
  update((st) => { st.matches = st.matches.filter((m) => m.id !== id); });
}

/* ---------- Peliaikaseuranta ---------- */

/** Varmistaa että ottelulla on seurantaolio, ja palauttaa sen. */
export function ensureTiming(match) {
  if (!match.timing) match.timing = emptyTiming();
  return match.timing;
}

/** Käynnistää kellon. Ensimmäisellä kerralla avauskokoonpano merkitään kentälle. */
export function startTiming(match) {
  const t = ensureTiming(match);
  if (t.status === 'idle' && !t.events.length) {
    t.events = match.lineup.slots
      .filter(Boolean)
      .map((playerId) => ({ id: uid(), at: 0, type: 'in', playerId }));
  }
  if (t.status !== 'running') {
    t.startedAt = Date.now();
    t.status = 'running';
  }
}

export function pauseTiming(match) {
  const t = ensureTiming(match);
  if (t.status !== 'running') return;
  t.elapsed = clockSeconds(t);
  t.startedAt = null;
  t.status = 'paused';
}

export function endTiming(match) {
  pauseTiming(match);
  ensureTiming(match).status = 'ended';
}

export function resetTiming(match) {
  const t = ensureTiming(match);
  match.timing = emptyTiming(t.periods, t.periodMinutes);
}

/** Vaihto: toinen ulos, toinen sisään. Kumpikin voi olla null. */
export function substitute(match, outId, inId, at) {
  const t = ensureTiming(match);
  const moment = at ?? clockSeconds(t);
  if (outId) t.events.push({ id: uid(), at: moment, type: 'out', playerId: outId });
  if (inId) t.events.push({ id: uid(), at: moment, type: 'in', playerId: inId });
}

/** Ottelun tulos luodaan tarvittaessa, kun ensimmäinen tapahtuma kirjataan. */
function ensureResult(match) {
  if (!match.result) match.result = { gf: 0, ga: 0, events: [], notes: '' };
  return match.result;
}

/** Maali seurannasta: tapahtuma lokiin ja tulos ajan tasalle. */
export function recordGoal(match, { team = 'us', playerId = null, assistId = null, at } = {}) {
  const t = ensureTiming(match);
  const moment = at ?? clockSeconds(t);
  t.events.push({ id: uid(), at: moment, type: 'goal', team, playerId, assistId });
  const result = ensureResult(match);
  if (team === 'them') result.ga = (result.ga || 0) + 1;
  else result.gf = (result.gf || 0) + 1;
}

/** Kortti seurannasta. Punainen kortti vie oman pelaajan myös pois kentältä. */
export function recordCard(match, { team = 'us', card = 'yellow', playerId = null, at } = {}) {
  const t = ensureTiming(match);
  const moment = at ?? clockSeconds(t);
  t.events.push({ id: uid(), at: moment, type: 'card', team, card, playerId });
  if (card === 'red' && team === 'us' && playerId && onField(t, moment).has(playerId)) {
    t.events.push({ id: uid(), at: moment, type: 'out', playerId });
  }
}

/** Poistaa tapahtumat ja pitää tuloksen ajan tasalla. */
/** Muuttaa yksittäisen tapahtuman tietoja, esimerkiksi maalintekijän. */
export function updateTimingEvent(match, id, patch) {
  const t = ensureTiming(match);
  const e = t.events.find((x) => x.id === id);
  if (e) Object.assign(e, patch);
}

export function removeTimingEvents(match, ids) {
  const t = ensureTiming(match);
  const removed = t.events.filter((e) => ids.includes(e.id));
  t.events = t.events.filter((e) => !ids.includes(e.id));

  const result = match.result;
  if (!result) return;
  for (const e of removed) {
    if (e.type !== 'goal') continue;
    if (e.team === 'them') result.ga = Math.max(0, (result.ga || 0) - 1);
    else result.gf = Math.max(0, (result.gf || 0) - 1);
  }
}

/** Vanha tulokseen kirjattu maali poistetaan omalta listaltaan. */
export function removeResultEvent(match, id) {
  if (!match.result) return;
  const before = match.result.events.length;
  match.result.events = match.result.events.filter((e) => e.id !== id);
  if (match.result.events.length < before) {
    match.result.gf = Math.max(0, (match.result.gf || 0) - 1);
  }
}

/** Siirtää vaihdon toiseen hetkeen, kun kirjaus tehtiin myöhässä. */
export function moveTimingEvents(match, ids, at) {
  const t = ensureTiming(match);
  const moment = Math.max(0, Math.round(at));
  t.events = t.events.map((e) => (ids.includes(e.id) ? { ...e, at: moment } : e));
}

export const playersOnField = (match) => onField(match.timing);

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
  lineup.positions = {};   // paikat vaihtuvat, joten siirrot nollataan
  for (const id of dropped) if (!lineup.bench.includes(id)) lineup.bench.push(id);
}

/**
 * Asettaa pelaajan paikkaan ja poistaa hänet muualta kentältä. Paikalta pois
 * jäänyt pelaaja pysyy ryhmässä ja siirtyy vaihtopenkille – hän on poissa vain,
 * jos hänet otetaan pois ryhmästä Hallitse ryhmää -näkymässä.
 */
export function assignToSlot(lineup, slotIndex, playerId) {
  const previous = lineup.slots[slotIndex];
  if (playerId) {
    lineup.slots = lineup.slots.map((v, i) => (v === playerId && i !== slotIndex ? null : v));
    lineup.bench = lineup.bench.filter((v) => v !== playerId);
  }
  lineup.slots[slotIndex] = playerId;
  if (previous && previous !== playerId && !inSquad(lineup, previous)) lineup.bench.push(previous);
}

/** Tyhjentää kentän: pelaajat siirtyvät vaihtopenkille, eivät pois ryhmästä. */
export function clearSlots(lineup) {
  for (const id of lineup.slots) {
    if (id && !lineup.bench.includes(id)) lineup.bench.push(id);
  }
  lineup.slots = lineup.slots.map(() => null);
}

/** Onko pelaaja merkitty mukaan otteluun (kentälle tai penkille)? */
export const inSquad = (lineup, playerId) =>
  lineup.slots.includes(playerId) || lineup.bench.includes(playerId);

/**
 * Napautus vihreäksi: pelaaja mukaan otteluryhmään tai pois siitä.
 * Mukaan otettu pelaaja menee vaihtopenkille, kunnes hänet asetetaan kentälle.
 */
export function toggleSquad(lineup, playerId) {
  if (inSquad(lineup, playerId)) {
    lineup.slots = lineup.slots.map((v) => (v === playerId ? null : v));
    lineup.bench = lineup.bench.filter((v) => v !== playerId);
  } else {
    lineup.bench.push(playerId);
  }
}

/** Poissaolijat päätellään: käytettävissä olevat pelaajat, joita ei ole valittu ryhmään. */
export function absentIds(lineup, players = getState().players) {
  return players.filter((p) => p.active !== false && !inSquad(lineup, p.id)).map((p) => p.id);
}

/** Pelaajan tila tässä ottelussa: kentällä, penkillä vai poissa. */
export const lineupRole = (lineup, playerId) => {
  if (lineup.slots.includes(playerId)) return 'aloittava';
  if (lineup.bench.includes(playerId)) return 'vaihto';
  return 'poissa';
};

export const cloneLineup = (lu) => JSON.parse(JSON.stringify(lu));

/* ---------- Taktiikkapiirrokset ---------- */

export function addStroke(lineup, stroke) {
  if (!Array.isArray(lineup.drawings)) lineup.drawings = [];
  lineup.drawings.push({ id: uid(), ...stroke });
}

export const undoStroke = (lineup) => { (lineup.drawings || []).pop(); };

export const clearDrawings = (lineup) => { lineup.drawings = []; };

/** Pelaajan siirto kentällä. Koordinaatit ovat prosentteja kentän mitoista. */
export function movePlayer(lineup, slotIndex, x, y) {
  if (!lineup.positions || typeof lineup.positions !== 'object') lineup.positions = {};
  lineup.positions[slotIndex] = {
    x: Math.round(Math.min(97, Math.max(3, x)) * 10) / 10,
    y: Math.round(Math.min(97, Math.max(3, y)) * 10) / 10,
  };
}

export const resetPositions = (lineup) => { lineup.positions = {}; };

/** Onko kokoonpanossa jotain taktiikkatauluun kuuluvaa? */
export const hasTactics = (lineup) =>
  (lineup.drawings || []).length > 0 || Object.keys(lineup.positions || {}).length > 0;

/* ---------- Vienti ja tuonti ---------- */

export const exportJSON = () => JSON.stringify(state, null, 2);

export function importJSON(text) {
  const data = JSON.parse(text);
  if (!data || typeof data !== 'object' || !Array.isArray(data.players)) {
    throw new Error('Tiedosto ei ole Pelikirjan varmuuskopio.');
  }
  replaceState(data);
}
