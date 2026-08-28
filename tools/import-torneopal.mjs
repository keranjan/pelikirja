// Muuntaa Torneopalin (esim. spl.torneopal.fi) otteluohjelman Pelikirjan muotoon.
// Lukee joko getMatches-rajapinnan JSON:in tai sarjaohjelman HTML-taulukon.
//
// Käyttö:
//   node tools/import-torneopal.mjs otteluohjelma.html --team "Ilves Beta"
//   curl -s "<torneopal getMatches -osoite>" | node tools/import-torneopal.mjs --team "Ilves Beta"
//
// Valinnat:
//   --team <nimi>       oma joukkue: ratkaisee koti/vieras, rajaa ottelut ja
//                       tallentuu otteluiden team-kenttään (pakollinen)
//   --name <nimi>       otteluihin merkittävä joukkueen nimi, jos se poikkeaa
//                       otteluohjelman kirjoitusasusta
//   --formation <id>    kokoonpanon pelisysteemi, oletus 8-2-3-2 (8 vs 8)
//   --all               ota mukaan myös jo pelatut ottelut (oletus: vain tulevat)
//   --sql               tulosta SQL, joka lisää ottelut Supabase-riville
//   --user <uuid>       käyttäjätunnus SQL-lauseeseen (oletus: auth.uid())

import fs from 'node:fs';

const args = process.argv.slice(2);
const flag = (name, fallback = null) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? (args[i + 1] ?? true) : fallback;
};
const has = (name) => args.includes(`--${name}`);

const team = flag('team');
const teamName = flag('name');
const formation = flag('formation', '8-2-3-2');
const file = args.find((a) => !a.startsWith('--') && !args[args.indexOf(a) - 1]?.startsWith('--'));

if (!team) {
  console.error('Anna oma joukkue: --team "Ilves Beta"');
  process.exit(1);
}

const raw = file ? fs.readFileSync(file, 'utf8') : fs.readFileSync(0, 'utf8');

/* ---------- Lähdemuodon tulkinta ---------- */

const decode = (s) => s
  .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<')
  .replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#0?39;/g, "'")
  .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));

const text = (html) => decode(html.replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();

/** Sarjaohjelman HTML-taulukko: yksi <tr> per ottelu, tiedot solujen luokissa. */
function parseHtml(html) {
  const out = [];
  const rowRe = /<tr\b([^>]*)>([\s\S]*?)<\/tr>/gi;
  const cellRe = /<td\b[^>]*class=["']([^"']*)["'][^>]*>([\s\S]*?)<\/td>/gi;

  for (const [, attrs, body] of html.matchAll(rowRe)) {
    const cells = {};
    for (const [, cls, content] of body.matchAll(cellRe)) {
      cells[cls.trim().split(/\s+/)[0]] = text(content);
    }
    if (!cells.home || !cells.away) continue;           // otsikkorivi
    out.push({
      match_number: cells.match || '',
      match_id: (attrs.match(/matchid_(\d+)/) || [])[1] || '',
      date: cells.date || '',
      time: cells.time || '',
      team_A_name: cells.home,
      team_B_name: cells.away,
      venue_name: cells.pitch || '',
      score: cells.score || '',
    });
  }
  return out;
}

const looksLikeHtml = /^\s*</.test(raw) || /<t(able|r)\b/i.test(raw);

let rows;
if (looksLikeHtml) {
  rows = parseHtml(raw);
} else {
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    console.error('Syötettä ei tunnistettu. Anna Torneopalin getMatches-vastaus (JSON) tai sarjaohjelman HTML.');
    process.exit(1);
  }
  rows = Array.isArray(parsed) ? parsed
    : parsed.matches || parsed.data?.matches || parsed.result?.matches || [];
}

if (!rows.length) {
  console.error('Otteluita ei löytynyt syötteestä.');
  process.exit(1);
}

// Torneopalin kenttänimet vaihtelevat rajapinnan version mukaan.
const pick = (row, ...names) => {
  for (const n of names) {
    const v = row[n];
    if (v !== undefined && v !== null && String(v).trim() !== '') return String(v).trim();
  }
  return '';
};

/** Torneopal käyttää HTML:ssä muotoa 28.08.2026, rajapinnassa 2026-08-28. */
function isoDate(value) {
  const fi = value.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})/);
  if (fi) return `${fi[3]}-${fi[2].padStart(2, '0')}-${fi[1].padStart(2, '0')}`;
  return value.slice(0, 10);
}

const normalize = (row) => {
  const score = pick(row, 'score');
  const goals = score.match(/(\d+)\s*[-–]\s*(\d+)/);
  return {
    id: pick(row, 'match_number', 'match_id'),
    date: isoDate(pick(row, 'date', 'match_date', 'day')),
    time: (pick(row, 'time', 'match_time', 'start_time') || '18:00').slice(0, 5),
    homeTeam: pick(row, 'team_A_name', 'home_team', 'team_home', 'teamA'),
    awayTeam: pick(row, 'team_B_name', 'away_team', 'team_away', 'teamB'),
    venue: pick(row, 'venue_name', 'field_name', 'venue', 'location'),
    goals: goals ? { home: Number(goals[1]), away: Number(goals[2]) } : null,
    played: !!goals || !!pick(row, 'fs_A') || /played|ended|result/i.test(pick(row, 'status')),
  };
};

/* ---------- Muunnos ---------- */

const norm = (s) => s.toLowerCase().replace(/\s+/g, ' ').trim();
const isUs = (name) => norm(name) === norm(team) || norm(name).startsWith(norm(team));

const uid = () =>
  Date.now().toString(36).slice(-5) + Math.random().toString(36).slice(2, 7);

const emptyLineup = () => ({
  formation,
  slots: Array(slotCount(formation)).fill(null),
  bench: [],
  positions: {},
  drawings: [],
});

function slotCount(id) {
  const m = String(id).match(/^(\d+)-/);
  const size = m && Number(m[1]) <= 9 ? Number(m[1]) : null;   // 8-2-3-2, 9-3-3-2, 7-2-3-1, 5-1-2-1
  if (size) return size;
  return 11;
}

const today = new Date().toISOString().slice(0, 10);
const seen = new Set();
const matches = [];
const skipped = [];

for (const row of rows) {
  const r = normalize(row);
  if (!r.date || (!r.homeTeam && !r.awayTeam)) { skipped.push({ syy: 'puutteelliset tiedot', row }); continue; }

  const home = isUs(r.homeTeam);
  const away = isUs(r.awayTeam);
  if (!home && !away) { skipped.push({ syy: `ei ${team}:n ottelu`, ottelu: `${r.homeTeam} – ${r.awayTeam}` }); continue; }
  if (!has('all') && (r.date < today || r.played)) { skipped.push({ syy: 'jo pelattu', ottelu: `${r.date} ${r.homeTeam} – ${r.awayTeam}` }); continue; }

  const key = `${r.date}|${r.time}|${r.homeTeam}|${r.awayTeam}`;
  if (seen.has(key)) continue;
  seen.add(key);

  matches.push({
    // Torneopalin ottelunumero pitää tunnisteen vakaana, jos tuonti ajetaan uudestaan.
    id: r.id ? `tp${r.id}` : uid(),
    date: r.date,
    time: r.time,
    opponent: home ? r.awayTeam : r.homeTeam,
    // Oma joukkue sellaisena kuin se on otteluohjelmassa, esim. "Ilves Beta".
    team: teamName || (home ? r.homeTeam : r.awayTeam),
    home,
    venue: r.venue,
    type: 'ottelu',
    videoUrl: '',
    notes: '',
    lineup: emptyLineup(),
    result: r.goals
      ? { gf: home ? r.goals.home : r.goals.away, ga: home ? r.goals.away : r.goals.home, events: [], notes: '' }
      : null,
  });
}

matches.sort((a, b) => `${a.date}T${a.time}`.localeCompare(`${b.date}T${b.time}`));

/* ---------- Tuloste ---------- */

if (has('sql')) {
  const user = flag('user');
  const where = user ? `user_id = '${user}'` : 'user_id = auth.uid()';
  // Supabasen SQL-editorissa ei ole kirjautunutta käyttäjää, jolloin auth.uid()
  // on NULL eikä lause osu yhteenkään riviin. Siksi lause kertoo, jos se ei
  // päivittänyt mitään – muuten editori ilmoittaa vain "Success".
  const varoitus = user ? '' : `
-- HUOM: ilman --user <uuid> ehtona on auth.uid(), joka on Supabasen
-- SQL-editorissa NULL. Aja tuonti uudestaan valinnalla --user <uuid> tai
-- korvaa alta auth.uid() omalla käyttäjätunnuksellasi.`;
  const json = JSON.stringify(matches).replace(/'/g, "''");
  // Sama lause voidaan ajaa uudestaan: tunnisteeltaan tutut ottelut vain
  // päivitetään (joukkuetieto), jolloin kokoonpanot ja tulokset säilyvät.
  console.log(`-- ${matches.length} ottelua joukkueelle ${teamName || team}
-- Voidaan ajaa turvallisesti uudelleen: jo tuodut ottelut päivitetään, ei kahdenneta.${varoitus}
do $pelikirja$
declare
  paivitetty int;
begin
update public.pelikirja
set data = jsonb_set(
      data,
      '{matches}',
      (
        select coalesce(jsonb_agg(rivi order by rivi->>'date', rivi->>'time'), '[]'::jsonb)
        from (
          -- Jo tallennetut ottelut: vain joukkuetieto päivitetään.
          select case
                   when uusi.m is null then vanha.e
                   else vanha.e || jsonb_build_object('team', uusi.m->>'team')
                 end as rivi
          from jsonb_array_elements(coalesce(data->'matches', '[]'::jsonb)) as vanha(e)
          left join jsonb_array_elements('${json}'::jsonb) as uusi(m)
                 on uusi.m->>'id' = vanha.e->>'id'
          union all
          -- Uudet ottelut lisätään sellaisenaan.
          select uusi.m
          from jsonb_array_elements('${json}'::jsonb) as uusi(m)
          where not exists (
            select 1
            from jsonb_array_elements(coalesce(data->'matches', '[]'::jsonb)) as v(e)
            where v.e->>'id' = uusi.m->>'id'
          )
        ) s
      )
    ),
    rev = rev + 1,
    updated_at = now()
where ${where};

get diagnostics paivitetty = row_count;
if paivitetty = 0 then
  raise exception 'Yhtaan rivia ei paivitetty: tarkista kayttajatunnus (SQL-editorissa auth.uid() on NULL).';
end if;
raise notice 'Paivitetty % ottelua riville.', ${matches.length};
end
$pelikirja$;`);
} else {
  console.log(JSON.stringify(matches, null, 2));
}

console.error(`\n${matches.length} ottelua muunnettu, ${skipped.length} ohitettu.`);
for (const s of skipped.slice(0, 8)) console.error(`  ohitettu: ${s.syy}${s.ottelu ? ' – ' + s.ottelu : ''}`);
