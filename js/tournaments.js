// Turnauksen logiikka: päivät, lohkot, otteluiden ryhmittely ja oma saldo.
// Puhdasta laskentaa, jotta sen voi testata ilman selainta.
//
// Turnaus on oma kokonaisuutensa (state.tournaments) ja sen ottelut ovat
// tavallisia otteluita, joissa on tournamentId. Näin kokoonpano, seuranta,
// tulos ja tilastot toimivat turnausotteluissa täsmälleen kuten muissakin.

/** Turnauksen vaiheet. */
export const STAGES = {
  lohko: 'Lohkovaihe',
  jatko: 'Jatkopelit',
};

/** Yleisimmät jatkopelien nimet ehdotuksiksi. */
export const PLAYOFF_LABELS = [
  'Neljännesvälierä', 'Puolivälierä', 'Välierä', 'Pronssiottelu', 'Finaali', 'Sijoitusottelu',
];

export const emptyTournament = (id, name, date) => ({
  id,
  name,
  startDate: date,
  endDate: date,
  venue: '',
  notes: '',
  groups: [],                 // { id, name, teams: [] }
  createdAt: new Date().toISOString(),
});

export const emptyGroup = (id, name) => ({ id, name, teams: [], results: [] });

/* ---------- Päivät ---------- */

const dayMs = 86400000;

/** Turnauksen päivät alusta loppuun, enintään 14 päivää. */
export function tournamentDays(t) {
  const start = t?.startDate;
  const end = t?.endDate && t.endDate >= start ? t.endDate : start;
  if (!start) return [];
  const days = [];
  for (let d = new Date(`${start}T12:00:00`); days.length < 14; d = new Date(d.getTime() + dayMs)) {
    const iso = d.toISOString().slice(0, 10);
    days.push(iso);
    if (iso >= end) break;
  }
  return days;
}

export const dayCount = (t) => tournamentDays(t).length;

/** Yksikkö vai monikko: 1 ottelu, 2 ottelua. */
export const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

/** Ottelut päivittäin aikajärjestyksessä: [{ date, games }]. */
export function gamesByDay(games = []) {
  const byDate = new Map();
  for (const g of [...games].sort(byKickoff)) {
    if (!byDate.has(g.date)) byDate.set(g.date, []);
    byDate.get(g.date).push(g);
  }
  return [...byDate.entries()].map(([date, list]) => ({ date, games: list }));
}

const byKickoff = (a, b) =>
  `${a.date}T${a.time || '00:00'}`.localeCompare(`${b.date}T${b.time || '00:00'}`);

/* ---------- Lohkot ja vaiheet ---------- */

/** Ottelun vaiheen nimi: lohkon nimi tai jatkopelin nimi. */
export function stageName(tournament, game) {
  if (game?.stage === 'jatko') return game.label || STAGES.jatko;
  const group = (tournament?.groups || []).find((g) => g.id === game?.groupId);
  return group ? `Lohko ${group.name}` : STAGES.lohko;
}

/** Kaikki turnauksessa mainitut joukkueet lohkoista. */
export function allTeams(tournament) {
  const teams = (tournament?.groups || []).flatMap((g) => g.teams || []);
  return [...new Set(teams.map((t) => t.trim()).filter(Boolean))];
}

/* ---------- Lohkotaulukko ---------- */

const teamKey = (name) => String(name || '').trim().toLowerCase();

/**
 * Lohkosarjataulukko. Mukaan lasketaan omat ottelut sekä lohkoon käsin
 * kirjatut muiden joukkueiden tulokset. Kaikki lohkon joukkueet näkyvät,
 * vaikka niiden otteluita ei olisi vielä kirjattu.
 *
 * @param {object} group    lohko { name, teams, results }
 * @param {Array}  games    oman joukkueen ottelut tässä lohkossa
 * @param {string} ownName  oman joukkueen nimi taulukossa
 * @returns {Array} rivit järjestyksessä: pisteet, maaliero, tehdyt, nimi
 */
export function standings(group, games = [], ownName = 'Oma joukkue') {
  const rows = new Map();
  const ensure = (name) => {
    const key = teamKey(name);
    if (!key) return null;
    if (!rows.has(key)) {
      rows.set(key, {
        name: String(name).trim(), played: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, points: 0,
        own: key === teamKey(ownName),
      });
    }
    return rows.get(key);
  };

  // Lohkon joukkueet näkyvät aina; oma rivi syntyy otteluista, jottei sama
  // joukkue näy kahdesti eri kirjoitusasulla.
  for (const team of group?.teams || []) ensure(team);

  const add = (name, scored, conceded) => {
    const row = ensure(name);
    if (!row) return;
    row.played++;
    row.gf += scored;
    row.ga += conceded;
    if (scored > conceded) { row.w++; row.points += 3; } else if (scored === conceded) { row.d++; row.points += 1; } else row.l++;
  };

  for (const g of games) {
    if (!g?.result) continue;
    add(ownName, g.result.gf || 0, g.result.ga || 0);
    add(g.opponent, g.result.ga || 0, g.result.gf || 0);
  }
  for (const r of group?.results || []) {
    if (!teamKey(r.home) || !teamKey(r.away)) continue;
    add(r.home, Number(r.hg) || 0, Number(r.ag) || 0);
    add(r.away, Number(r.ag) || 0, Number(r.hg) || 0);
  }

  return [...rows.values()].sort((a, b) =>
    b.points - a.points
    || (b.gf - b.ga) - (a.gf - a.ga)
    || b.gf - a.gf
    || a.name.localeCompare(b.name, 'fi'));
}

/* ---------- Oma saldo ---------- */

/**
 * Oman joukkueen saldo turnauksen otteluista.
 * @returns {{ played:number, w:number, d:number, l:number, gf:number, ga:number, points:number }}
 */
export function record(games = []) {
  const out = { played: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, points: 0 };
  for (const g of games) {
    const r = g.result;
    if (!r) continue;
    out.played++;
    out.gf += r.gf || 0;
    out.ga += r.ga || 0;
    if (r.gf > r.ga) out.w++;
    else if (r.gf === r.ga) out.d++;
    else out.l++;
  }
  out.points = out.w * 3 + out.d;
  return out;
}

/** Seuraava pelaamaton ottelu, tai viimeisin pelattu jos kaikki on pelattu. */
export function nextGame(games = []) {
  const sorted = [...games].sort(byKickoff);
  return sorted.find((g) => !g.result) || sorted[sorted.length - 1] || null;
}
