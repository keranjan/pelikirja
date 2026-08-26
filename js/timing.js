// Peliajan laskenta. Kaikki tässä on puhdasta laskentaa, jotta sen voi testata
// ilman selainta: kello, pelaajakohtaiset peliajat ja kentällä olevat.
//
// Tapahtumaloki on lista { id, at, type: 'in' | 'out', playerId }, jossa `at`
// on ottelukellon sekuntiluku. Avauskokoonpano saa 'in'-tapahtuman hetkellä 0.

export const DEFAULT_PERIODS = 2;
export const DEFAULT_PERIOD_MINUTES = 30;

export const emptyTiming = (periods = DEFAULT_PERIODS, periodMinutes = DEFAULT_PERIOD_MINUTES) => ({
  status: 'idle',        // idle | running | paused | ended
  startedAt: null,       // seinäkellon hetki, jolloin kello käynnistettiin
  elapsed: 0,            // kertynyt aika sekunteina ennen nykyistä käyntijaksoa
  periods,
  periodMinutes,
  events: [],
});

/** Ottelukellon lukema sekunteina. */
export function clockSeconds(timing, now = Date.now()) {
  if (!timing) return 0;
  const base = timing.elapsed || 0;
  if (timing.status === 'running' && timing.startedAt) {
    return base + Math.max(0, Math.floor((now - timing.startedAt) / 1000));
  }
  return base;
}

/** Tapahtumat aikajärjestyksessä; samalla sekunnilla ulos ennen sisään. */
const ordered = (events = []) =>
  [...events].sort((a, b) => a.at - b.at || (a.type === b.type ? 0 : a.type === 'out' ? -1 : 1));

/**
 * Pelaajakohtaiset peliajat sekunteina hetkellä `at`.
 * @returns {Map<string, number>}
 */
export function playingTimes(timing, at = clockSeconds(timing)) {
  const open = new Map();
  const total = new Map();

  for (const e of ordered(timing?.events)) {
    if (e.at > at) break;
    if (e.type === 'in') {
      if (!open.has(e.playerId)) open.set(e.playerId, e.at);
    } else {
      const from = open.get(e.playerId);
      if (from === undefined) continue;
      total.set(e.playerId, (total.get(e.playerId) || 0) + Math.max(0, e.at - from));
      open.delete(e.playerId);
    }
  }
  for (const [playerId, from] of open) {
    total.set(playerId, (total.get(playerId) || 0) + Math.max(0, at - from));
  }
  return total;
}

/** Kentällä juuri nyt olevat pelaajat. */
export function onField(timing, at = clockSeconds(timing)) {
  const open = new Set();
  for (const e of ordered(timing?.events)) {
    if (e.at > at) break;
    if (e.type === 'in') open.add(e.playerId);
    else open.delete(e.playerId);
  }
  return open;
}

/** Vaihdot pareittain esitettäväksi: samalla sekunnilla tehdyt yhdistetään. */
export function substitutions(timing) {
  const out = [];
  const events = ordered(timing?.events).filter((e) => e.at > 0);
  const used = new Set();

  for (const e of events) {
    if (used.has(e.id)) continue;
    if (e.type !== 'out') continue;
    const pair = events.find((x) => x.type === 'in' && x.at === e.at && !used.has(x.id));
    used.add(e.id);
    if (pair) used.add(pair.id);
    out.push({ at: e.at, outId: e.playerId, inId: pair?.playerId || null, ids: [e.id, pair?.id].filter(Boolean) });
  }
  for (const e of events) {
    if (used.has(e.id) || e.type !== 'in') continue;
    used.add(e.id);
    out.push({ at: e.at, outId: null, inId: e.playerId, ids: [e.id] });
  }
  return out.sort((a, b) => a.at - b.at);
}

/** Monesko jakso on menossa. */
export function periodOf(seconds, timing) {
  const len = Math.max(1, (timing?.periodMinutes || DEFAULT_PERIOD_MINUTES) * 60);
  return Math.min(timing?.periods || DEFAULT_PERIODS, Math.floor(seconds / len) + 1);
}

export const totalSeconds = (timing) =>
  (timing?.periods || DEFAULT_PERIODS) * (timing?.periodMinutes || DEFAULT_PERIOD_MINUTES) * 60;

/* ---------- Muotoilu ---------- */

export function fmtClock(seconds) {
  const s = Math.max(0, Math.round(seconds));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

export const fmtMinutes = (seconds) => `${Math.round((seconds || 0) / 60)} min`;
