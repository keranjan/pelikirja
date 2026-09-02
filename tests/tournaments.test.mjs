// Turnauslogiikan yksikkötestit: päivät, vaiheet, ryhmittely ja saldo.
import {
  STAGES, emptyTournament, emptyGroup, tournamentDays, dayCount, gamesByDay,
  stageName, allTeams, record, nextGame, plural, standings,
} from '../js/tournaments.js';

let checks = 0;
const fail = (msg) => { console.error('  ✗ ' + msg); process.exitCode = 1; };
const ok = (name) => { checks++; console.log('  ✓ ' + name); };
const eq = (got, want, name) => {
  if (JSON.stringify(got) !== JSON.stringify(want)) fail(`${name}: sai ${JSON.stringify(got)}, odotettiin ${JSON.stringify(want)}`);
  else ok(name);
};

const cup = () => {
  const t = emptyTournament('t1', 'Ilves Cup', '2026-09-12');
  t.endDate = '2026-09-13';
  t.groups = [
    { ...emptyGroup('g1', 'A'), teams: ['Ilves Beta', 'FC Inter', 'TPV', 'KaaPo', 'Pato', 'JanPa'] },
    { ...emptyGroup('g2', 'B'), teams: ['MuSa', 'FC Jazz', 'TuKV', 'ÅIFK', 'HJS', 'PJK'] },
  ];
  return t;
};

// --- Päivät ---
eq(tournamentDays(cup()), ['2026-09-12', '2026-09-13'], 'kaksipäiväinen turnaus');
eq(dayCount({ startDate: '2026-06-01', endDate: '2026-06-01' }), 1, 'yksipäiväinen turnaus');
eq(dayCount({ startDate: '2026-06-01', endDate: '2026-06-03' }), 3, 'kolmipäiväinen turnaus');
eq(dayCount({ startDate: '2026-06-05', endDate: '2026-06-01' }), 1, 'virheellinen loppupäivä ei kaada laskentaa');
eq(tournamentDays({}), [], 'ilman alkupäivää ei päiviä');
eq(dayCount({ startDate: '2026-06-01', endDate: '2027-06-01' }) <= 14, true, 'päivien määrä on rajattu');

// --- Joukkueet ja lohkot ---
{
  const t = cup();
  eq(allTeams(t).length, 12, 'lohkoista kertyy yli kymmenen joukkuetta');
  eq(stageName(t, { stage: 'lohko', groupId: 'g2' }), 'Lohko B', 'lohkon nimi näkyy vaiheena');
  eq(stageName(t, { stage: 'lohko', groupId: 'tuntematon' }), STAGES.lohko, 'tuntematon lohko putoaa lohkovaiheeseen');
  eq(stageName(t, { stage: 'jatko', label: 'Välierä' }), 'Välierä', 'jatkopelin nimi näkyy sellaisenaan');
  eq(stageName(t, { stage: 'jatko', label: '' }), STAGES.jatko, 'nimetön jatkopeli on jatkopelit');

  const dupes = { ...t, groups: [{ id: 'g3', name: 'C', teams: ['TPV', ' TPV ', ''] }] };
  eq(allTeams(dupes), ['TPV'], 'sama joukkue lasketaan kerran');
}

// --- Ottelut päivittäin ---
{
  const games = [
    { id: 'c', date: '2026-09-13', time: '09:00', opponent: 'Välierä' },
    { id: 'a', date: '2026-09-12', time: '12:00', opponent: 'FC Inter' },
    { id: 'b', date: '2026-09-12', time: '09:30', opponent: 'TPV' },
  ];
  const days = gamesByDay(games);
  eq(days.map((d) => d.date), ['2026-09-12', '2026-09-13'], 'päivät aikajärjestyksessä');
  eq(days[0].games.map((g) => g.id), ['b', 'a'], 'päivän ottelut kellonajan mukaan');
  eq(gamesByDay([]), [], 'tyhjä ohjelma ei kaada ryhmittelyä');
}

// --- Oma saldo ---
{
  const games = [
    { result: { gf: 3, ga: 1 } },
    { result: { gf: 1, ga: 1 } },
    { result: { gf: 0, ga: 2 } },
    { result: null },
  ];
  eq(record(games), { played: 3, w: 1, d: 1, l: 1, gf: 4, ga: 4, points: 4 }, 'saldo lasketaan pelatuista');
  eq(record([]), { played: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, points: 0 }, 'tyhjä turnaus antaa nollasaldon');
}

// --- Seuraava ottelu ---
{
  const games = [
    { id: 'a', date: '2026-09-12', time: '09:30', result: { gf: 1, ga: 0 } },
    { id: 'b', date: '2026-09-12', time: '12:00', result: null },
    { id: 'c', date: '2026-09-13', time: '09:00', result: null },
  ];
  eq(nextGame(games)?.id, 'b', 'seuraava on ensimmäinen pelaamaton');
  eq(nextGame(games.map((g) => ({ ...g, result: { gf: 0, ga: 0 } })))?.id, 'c', 'kaikki pelattu -> viimeisin');
  eq(nextGame([]), null, 'tyhjästä ohjelmasta ei löydy ottelua');
}

// --- Lohkotaulukko ---
{
  const group = {
    name: 'A',
    teams: ['Ilves Beta', 'FC Inter', 'TPV', 'KaaPo'],
    results: [{ id: 'r1', home: 'FC Inter', away: 'TPV', hg: 2, ag: 0 }],
  };
  const games = [
    { groupId: 'g1', opponent: 'FC Inter', result: { gf: 3, ga: 1 } },
    { groupId: 'g1', opponent: 'TPV', result: { gf: 1, ga: 1 } },
    { groupId: 'g1', opponent: 'KaaPo', result: null },
  ];
  const table = standings(group, games, 'Ilves Beta');
  eq(table.map((r) => r.name), ['Ilves Beta', 'FC Inter', 'TPV', 'KaaPo'],
    'taulukko järjestyy pisteiden ja maalieron mukaan');
  eq(table[0], { name: 'Ilves Beta', played: 2, w: 1, d: 1, l: 0, gf: 4, ga: 2, points: 4, own: true },
    'oma rivi: voitto ja tasapeli, tehdyt ja päästetyt');
  eq(table[1], { name: 'FC Inter', played: 2, w: 1, d: 0, l: 1, gf: 3, ga: 3, points: 3, own: false },
    'vastustajan rivi kertyy omasta ottelusta ja muusta tuloksesta');
  eq(table[3], { name: 'KaaPo', played: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, points: 0, own: false },
    'pelaamaton joukkue näkyy nollarivillä');

  // Sama joukkue eri kirjoitusasulla on sama rivi
  const messy = standings(
    { name: 'B', teams: ['tpv'], results: [] },
    [{ opponent: 'TPV ', result: { gf: 2, ga: 0 } }], 'Ilves');
  eq(messy.find((r) => r.name.toLowerCase() === 'tpv')?.played, 1, 'nimen kirjoitusasu ei kahdenna riviä');

  // Kirjaamaton lohkolista: pelkät omat ottelut riittävät taulukkoon
  const bare = standings({ name: 'C', teams: [], results: [] },
    [{ opponent: 'Pato', result: { gf: 0, ga: 2 } }], 'Ilves Beta');
  eq(bare.map((r) => `${r.name}:${r.points}`), ['Pato:3', 'Ilves Beta:0'],
    'ilman joukkuelistaa taulukko syntyy omista otteluista');
}

// --- Suomen yksikkö ja monikko ---
eq([plural(1, 'ottelu', 'ottelua'), plural(2, 'ottelu', 'ottelua')], ['1 ottelu', '2 ottelua'],
  'yksikkö ja monikko taipuvat');
eq(plural(0, 'lohko', 'lohkoa'), '0 lohkoa', 'nolla on monikossa');

if (!process.exitCode) console.log(`OK – turnaukset (${checks} tarkistusta)`);
