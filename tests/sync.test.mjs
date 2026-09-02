// Kahden laitteen synkronointi: molempien muutokset säilyvät ja
// samaan kohteeseen tehty ristiriita ratkeaa ennustettavasti.
// Käyttö: node tests/sync.test.mjs
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { createFakeSupabase } from './fake-supabase.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 8801;
const CLOUD = `http://localhost:${PORT}/supabase`;
const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.webmanifest': 'application/manifest+json',
  '.png': 'image/png', '.svg': 'image/svg+xml',
};

const supabase = createFakeSupabase();
const server = http.createServer((req, res) => {
  if (supabase(req, res, '/supabase')) return;
  const rel = decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'index.html';
  const file = path.join(ROOT, rel);
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404).end('not found');
    return;
  }
  res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(PORT, '127.0.0.1', r));

const browser = await chromium.launch({
  executablePath: fs.existsSync('/opt/pw-browsers/chromium-1194/chrome-linux/chrome')
    ? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' : undefined,
});
const errors = [];

const fail = (msg) => { console.error('VIRHE: ' + msg); process.exitCode = 1; };

/** Avaa "laitteen": oma selainkonteksti omalla localStoragella. */
async function device(name) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'fi-FI' });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`${name}: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`${name}: ${m.text()}`); });
  await page.goto(`http://localhost:${PORT}/index.html`);
  await page.waitForTimeout(300);

  const api = {
    name,
    page,
    state: () => page.evaluate(() => JSON.parse(localStorage.getItem('pelikirja.v1'))),
    /** Muokkaa tilaa suoraan ja ilmoita sovellukselle, kuten käyttöliittymä tekisi. */
    edit: (fn) => page.evaluate(async (src) => {
      const store = await import('/js/store.js');
      store.update(new Function('st', `(${src})(st)`));
    }, fn.toString()),
    /** Hiljainen muokkaus, kuten tekstikentän tallennus: ei uudelleenpiirtoa. */
    editSilent: (fn) => page.evaluate(async (src) => {
      const store = await import('/js/store.js');
      store.update(new Function('st', `(${src})(st)`), { silent: true });
    }, fn.toString()),
    connect: () => page.evaluate(async (url) => {
      const sync = await import('/js/sync.js');
      sync.setConfig(url, 'anon-avain');
    }, CLOUD),
    signUp: (email) => page.evaluate(async (e) => {
      const sync = await import('/js/sync.js');
      await sync.signUp(e, 'salasana123');
    }, email),
    signIn: (email) => page.evaluate(async (e) => {
      const sync = await import('/js/sync.js');
      await sync.signIn(e, 'salasana123');
    }, email),
    sync: () => page.evaluate(async () => {
      const sync = await import('/js/sync.js');
      return sync.syncNow();
    }),
  };
  return api;
}

const a = await device('laite A');
const b = await device('laite B');

// --- Laite A: pelaajat ja ottelu pilveen ---
await a.edit((st) => {
  st.team.name = 'Ilves Keltainen';
  st.players.push({ id: 'p1', name: 'Aku Ahonen', number: 1, roles: ['MV'], active: true });
  st.players.push({ id: 'p2', name: 'Bertta Broman', number: 2, roles: ['LP'], active: true });
  st.matches.push({ id: 'm1', date: '2026-09-05', time: '18:00', opponent: 'PJK', home: true,
    venue: '', type: 'ottelu', videoUrl: '', notes: '', result: null,
    lineup: { formation: '4-3-3', slots: Array(11).fill(null), bench: [], positions: {}, drawings: [] } });
});
await a.connect();
await a.signUp('valmentaja@example.com');
await a.sync();

// --- Laite B: sama tunnus, tyhjä laite ---
await b.connect();
await b.signIn('valmentaja@example.com');
await b.page.waitForTimeout(300);

let sb = await b.state();
if (sb.players.length !== 2 || sb.team.name !== 'Ilves Keltainen') {
  fail(`laite B ei saanut pilven tietoja: ${JSON.stringify({ players: sb.players.length, team: sb.team.name })}`);
} else {
  console.log('laite B sai pilvestä', sb.players.length, 'pelaajaa ja joukkueen', sb.team.name);
}

// --- Molemmat muokkaavat eri kohteita ilman välisynkronointia ---
await a.edit((st) => { st.players.find((p) => p.id === 'p1').number = 12; });
await a.edit((st) => {
  st.players.push({ id: 'p3', name: 'Cecil Cronberg', number: 4, roles: ['KP'], active: true });
});
await b.edit((st) => { st.players.find((p) => p.id === 'p2').name = 'Bertta Broman-Virta'; });
await b.edit((st) => {
  st.matches.find((m) => m.id === 'm1').lineup.drawings.push(
    { id: 'd1', tool: 'pass', color: 'black', points: [[10, 10], [40, 40]] });
});

await a.sync();
await b.sync();
await a.sync();

const sa = await a.state();
sb = await b.state();
const check = (st, label) => {
  const p1 = st.players.find((p) => p.id === 'p1');
  const p2 = st.players.find((p) => p.id === 'p2');
  const p3 = st.players.find((p) => p.id === 'p3');
  const strokes = st.matches[0].lineup.drawings.length;
  const ok = p1?.number === 12 && p2?.name === 'Bertta Broman-Virta' && p3 && strokes === 1;
  if (!ok) {
    fail(`${label} ei yhdistynyt oikein: ` + JSON.stringify({
      p1: p1?.number, p2: p2?.name, p3: !!p3, strokes,
    }));
  }
  return ok;
};
if (check(sa, 'laite A') && check(sb, 'laite B')) {
  console.log('molempien laitteiden muutokset säilyivät (numero, nimi, uusi pelaaja, taktiikkaveto)');
}

// --- Ristiriita: molemmat muokkaavat samaa pelaajaa ---
await a.edit((st) => { st.players.find((p) => p.id === 'p3').name = 'A:n versio'; });
await b.edit((st) => { st.players.find((p) => p.id === 'p3').name = 'B:n versio'; });
const ra = await a.sync();
const rb = await b.sync();
if (!rb.conflicts) fail('ristiriitaa ei havaittu');
await a.sync();

const finalA = await a.state();
const finalB = await b.state();
const nameA = finalA.players.find((p) => p.id === 'p3').name;
const nameB = finalB.players.find((p) => p.id === 'p3').name;
if (nameA !== nameB) fail(`laitteet eivät päätyneet samaan tulokseen: ${nameA} vs ${nameB}`);
else if (nameB !== 'B:n versio') fail(`ristiriidan piti ratketa myöhemmin synkronoineen hyväksi, tuli: ${nameB}`);
else console.log(`ristiriita ratkesi ennustettavasti: "${nameB}" (A:n synkronointi: ${ra.conflicts} ristiriitaa, B:n: ${rb.conflicts})`);

// --- Valmentajat synkronoituvat ---
await a.edit((st) => {
  st.staff.push({ id: 's1', name: 'Väinö Valmentaja', role: 'paavalmentaja', phone: '', notes: '', active: true });
  st.matches[0].lineup.staff = ['s1'];
});
await b.edit((st) => {
  st.staff.push({ id: 's2', name: 'Aino Apuvalmentaja', role: 'apuvalmentaja', phone: '', notes: '', active: true });
});
await a.sync();
await b.sync();
await a.sync();
const staffA = (await a.state()).staff.map((x) => x.id).sort().join(',');
const staffB = (await b.state()).staff.map((x) => x.id).sort().join(',');
const lineupStaff = (await b.state()).matches[0].lineup.staff;
if (staffA !== 's1,s2' || staffB !== 's1,s2') {
  fail(`valmentajat eivät yhdistyneet: A=${staffA} B=${staffB}`);
} else if (!lineupStaff.includes('s1')) {
  fail('valmentajan merkintä otteluun ei siirtynyt');
} else {
  console.log('valmentajat yhdistyivät molemmilta laitteilta ja ottelumerkintä siirtyi');
}

// --- Valmentajan arvio (hiljainen tallennus) siirtyy laitteelta toiselle ---
await a.edit((st) => {
  st.matches[0].result = { gf: 3, ga: 1, events: [], rating: null, ratingMax: 10, notes: '' };
});
await a.editSilent((st) => {
  st.matches[0].result.rating = 8.5;
  st.matches[0].result.notes = 'Hyvä paineistus, viimeistely jäi vajaaksi.';
});
await a.sync();
await b.sync();
const arvio = (await b.state()).matches[0].result;
if (arvio?.rating !== 8.5 || !arvio.notes.startsWith('Hyvä paineistus')) {
  fail('valmentajan arvio ei siirtynyt: ' + JSON.stringify(arvio));
} else {
  console.log('valmentajan arvio siirtyi laitteelle B:', `arvosana ${arvio.rating}`, `"${arvio.notes.slice(0, 24)}…"`);
}

// --- Kaikki tietolajit siirtyvät laitteelta toiselle ---
// Sovelluksessa on kuusi listaa (pelaajat, valmentajat, ottelut,
// kokoonpanopohjat, harjoitukset, turnaukset) sekä joukkueen tiedot. Tässä
// jokaisesta luodaan sisällöllinen esimerkki ja tarkistetaan, että kaikki
// – myös sisäkkäiset rakenteet – päätyvät toiselle laitteelle sellaisenaan.
await a.edit((st) => {
  st.lineups.push({
    id: 'l1', name: 'Perusasetelma', createdAt: '2026-08-01T10:00:00.000Z',
    lineup: {
      formation: '8-2-3-2', slots: ['p1', 'p2', null, null, null, null, null, null],
      bench: ['p3'], positions: { 0: { x: 34, y: 80 } }, staff: ['s1'],
      drawings: [{ id: 'd1', tool: 'shot', color: 'punainen', points: [[10, 10], [40, 60]] }],
    },
  });
  st.drills.push({
    id: 'dr1', name: 'Syöttöruudut', area: 'puolikas', notes: '10 min',
    createdAt: '2026-08-02T10:00:00.000Z',
    elements: [
      { id: 'e1', kind: 'pelaaja', color: 'sininen', label: '1', x: 20, y: 30 },
      { id: 'e2', kind: 'totsa', x: 50, y: 50 },
      { id: 'e3', kind: 'stroke', shape: 'nelio', color: 'keltainen', points: [[10, 10], [60, 70]] },
    ],
  });
  st.tournaments.push({
    id: 't1', name: 'Ilves Cup', startDate: '2026-09-12', endDate: '2026-09-13',
    venue: 'Vuores', notes: 'Kokoontuminen 8:30', createdAt: '2026-08-03T10:00:00.000Z',
    groups: [{
      id: 'g1', name: 'A', teams: ['Ilves Keltainen', 'FC Inter', 'TPV'],
      results: [{ id: 'gr1', home: 'FC Inter', away: 'TPV', hg: 2, ag: 1 }],
    }],
  });
  st.matches.push({
    id: 'cup1', date: '2026-09-12', time: '09:30', opponent: 'FC Inter', team: 'Ilves Keltainen',
    home: true, venue: 'Vuores 1', type: 'turnaus', videoUrl: '', notes: '',
    tournamentId: 't1', stage: 'lohko', groupId: 'g1', label: '',
    lineup: { formation: '8-2-3-2', slots: ['p1', 'p2', null, null, null, null, null, null],
      bench: ['p3'], positions: {}, drawings: [], staff: ['s1'] },
    timing: {
      status: 'ended', startedAt: null, elapsed: 1800, periods: 2, periodMinutes: 25,
      events: [
        { id: 'i1', at: 0, type: 'in', playerId: 'p1' },
        { id: 'g1e', at: 300, type: 'goal', team: 'us', playerId: 'p1', assistId: 'p2',
          videoUrl: 'https://app.veo.co/matches/testi/#t=300' },
        { id: 'c1', at: 900, type: 'card', team: 'them', card: 'yellow', playerId: null },
      ],
    },
    result: { gf: 1, ga: 0, events: [], rating: 8.5, ratingMax: 10, notes: 'Hyvä avaus.' },
  });
});
await a.sync();
await b.sync();

{
  const sa = await a.state();
  const sb = await b.state();
  // Vertailu tehdään tunnisteen mukaan järjestettynä: listan järjestys on
  // laitekohtainen eikä vaikuta sisältöön (pilveen vietävä muoto järjestetään).
  const byId = (list) => [...list].sort((x, y) => String(x.id).localeCompare(String(y.id)));
  const pick = (st) => ({
    players: byId(st.players), staff: byId(st.staff), lineups: byId(st.lineups),
    drills: byId(st.drills), tournaments: byId(st.tournaments), matches: byId(st.matches),
    team: { name: st.team.name, season: st.team.season },
  });
  const stableOf = (device, data) => device.page.evaluate(async (value) => {
    const m = await import('/js/merge.js');
    return m.stable(value);
  }, data);
  const [ha, hb] = [await stableOf(a, pick(sa)), await stableOf(b, pick(sb))];
  if (ha !== hb) {
    fail('laitteiden tiedot eroavat synkronoinnin jälkeen');
    for (const key of ['players', 'staff', 'lineups', 'drills', 'tournaments', 'matches']) {
      const x = JSON.stringify(byId(sa[key]));
      const y = JSON.stringify(byId(sb[key]));
      if (x !== y) console.error(`  eroaa: ${key}\n    A: ${x.slice(0, 200)}\n    B: ${y.slice(0, 200)}`);
    }
  } else {
    const counts = ['players', 'staff', 'lineups', 'drills', 'tournaments', 'matches']
      .map((k) => `${k}=${sb[k].length}`).join(' ');
    console.log('kaikki tietolajit siirtyivät samanlaisina:', counts);
  }

  // Sisäkkäiset rakenteet: piirrokset, harjoituksen elementit, lohkon tulokset,
  // ottelun tapahtumat ja arvosana.
  const cup = sb.matches.find((m) => m.id === 'cup1');
  const drill = sb.drills.find((d) => d.id === 'dr1');
  const tour = sb.tournaments.find((t) => t.id === 't1');
  const tpl = sb.lineups.find((l) => l.id === 'l1');
  const nested = {
    piirros: tpl?.lineup.drawings.length,
    pohjanValmentaja: tpl?.lineup.staff.join(','),
    siirretytPaikat: Object.keys(tpl?.lineup.positions || {}).length,
    harjoituksenMerkit: drill?.elements.length,
    harjoituksenAlue: drill?.area,
    lohkonJoukkueet: tour?.groups[0].teams.length,
    lohkonTulokset: tour?.groups[0].results.length,
    turnausOttelu: `${cup?.stage}/${cup?.groupId}`,
    tapahtumat: cup?.timing.events.length,
    maalinVideo: cup?.timing.events.find((e) => e.type === 'goal')?.videoUrl,
    arvosana: cup?.result.rating,
    arvio: cup?.result.notes,
  };
  const want = {
    piirros: 1, pohjanValmentaja: 's1', siirretytPaikat: 1,
    harjoituksenMerkit: 3, harjoituksenAlue: 'puolikas',
    lohkonJoukkueet: 3, lohkonTulokset: 1, turnausOttelu: 'lohko/g1',
    tapahtumat: 3, maalinVideo: 'https://app.veo.co/matches/testi/#t=300',
    arvosana: 8.5, arvio: 'Hyvä avaus.',
  };
  if (JSON.stringify(nested) !== JSON.stringify(want)) {
    fail('sisäkkäiset tiedot eivät siirtyneet: ' + JSON.stringify(nested));
  } else {
    console.log('sisäkkäiset tiedot siirtyivät: piirrokset, harjoitusmerkit, lohkotulokset, tapahtumat ja arvio');
  }
}

// --- Eri laitteilla muokataan eri tietolajeja yhtä aikaa ---
await a.edit((st) => {
  st.drills[0].elements.push({ id: 'e4', kind: 'pallo', x: 70, y: 20 });
  st.lineups[0].name = 'Perusasetelma 2-3-2';
});
await b.edit((st) => {
  st.tournaments[0].groups[0].results.push({ id: 'gr2', home: 'TPV', away: 'Ilves Keltainen', hg: 0, ag: 3 });
  st.matches.find((m) => m.id === 'cup1').result.rating = 9;
});
await a.sync();
await b.sync();
await a.sync();

{
  const sa = await a.state();
  const sb = await b.state();
  const check = (st, label) => {
    const drill = st.drills[0];
    const tour = st.tournaments[0];
    const cup = st.matches.find((m) => m.id === 'cup1');
    const ok = drill.elements.length === 4
      && st.lineups[0].name === 'Perusasetelma 2-3-2'
      && tour.groups[0].results.length === 2
      && cup.result.rating === 9;
    if (!ok) {
      fail(`${label} ei saanut kaikkia muutoksia: ` + JSON.stringify({
        merkit: drill.elements.length, pohja: st.lineups[0].name,
        lohkotulokset: tour.groups[0].results.length, arvosana: cup.result.rating,
      }));
    }
    return ok;
  };
  if (check(sa, 'laite A') && check(sb, 'laite B')) {
    console.log('eri tietolajien yhtäaikaiset muutokset säilyivät molemmilla');
  }
}

// --- Vanha versio pilvessä ei saa pyyhkiä valmentajia ---
// Vanhempi sovellusversio ei tallentanut staff-listaa lainkaan. Silloin
// puuttuvaa listaa ei saa tulkita poistoiksi, tai kokoonpanoihin jäisi
// viittauksia valmentajiin, joita ei enää ole.
{
  const merge = await a.page.evaluate(async () => {
    const m = await import('/js/merge.js');
    const base = { version: 1, team: { name: 'Ilves' }, players: [], staff: [{ id: 's9', name: 'Vanha Valmentaja' }], matches: [], lineups: [] };
    const local = JSON.parse(JSON.stringify(base));
    const remote = { version: 1, team: { name: 'Ilves' }, players: [], matches: [], lineups: [] };  // ei staff-kenttää
    const out = m.mergeStates(base, local, remote);
    return out.state.staff.map((x) => x.id);
  });
  if (merge.join(',') !== 's9') {
    fail('vanha pilviversio pyyhki valmentajat: ' + JSON.stringify(merge));
  } else {
    console.log('vanha pilviversio ei pyyhi valmentajia');
  }
}

// --- Poisto leviää toiselle laitteelle ---
await a.edit((st) => { st.players = st.players.filter((p) => p.id !== 'p1'); });
await a.sync();
await b.sync();
const afterDelete = await b.state();
if (afterDelete.players.some((p) => p.id === 'p1')) fail('poisto ei levinnyt laitteelle B');
else console.log('poisto levisi laitteelle B');

// --- Joukkueen nimen muuttaminen ---
await a.edit((st) => { st.team.name = 'Ilves Musta'; st.team.season = '2027'; });
await a.sync();
await b.sync();
let nb = (await b.state()).team;
if (nb.name !== 'Ilves Musta' || nb.season !== '2027') {
  fail(`nimenmuutos laitteelta A ei siirtynyt: ${JSON.stringify(nb)}`);
} else {
  console.log('nimenmuutos A -> B:', nb.name, nb.season);
}

await b.edit((st) => { st.team.name = 'Ilves Valkoinen'; });
await b.sync();
await a.sync();
let na = (await a.state()).team;
if (na.name !== 'Ilves Valkoinen') fail(`nimenmuutos laitteelta B ei siirtynyt: ${na.name}`);
else console.log('nimenmuutos B -> A:', na.name);

// Molemmat nimeävät uudelleen ilman välisynkronointia
await a.edit((st) => { st.team.name = 'A:n nimi'; });
await b.edit((st) => { st.team.name = 'B:n nimi'; });
await a.sync();
const rbTeam = await b.sync();
await a.sync();
na = (await a.state()).team;
nb = (await b.state()).team;
if (na.name !== nb.name) fail(`laitteet eri nimillä: ${na.name} vs ${nb.name}`);
else if (nb.name !== 'B:n nimi') fail(`ristiriidan piti ratketa B:n hyväksi, tuli: ${nb.name}`);
else if (!rbTeam.conflicts) fail('nimen ristiriitaa ei raportoitu');
else console.log(`nimen ristiriita ratkesi: "${nb.name}" (${rbTeam.conflicts} ristiriitaa)`);

// Ulkoasu on laitekohtainen eikä saa kulkea pilven mukana
await a.edit((st) => { st.team.theme = 'dark'; });
await a.sync();
await b.sync();
if ((await b.state()).team.theme === 'dark') fail('ulkoasuvalinta siirtyi laitteelta toiselle');
else console.log('ulkoasuvalinta pysyi laitekohtaisena');

// --- Nimeäminen oikeasta käyttöliittymästä, ei suoraan tilaa muokaten ---
await a.page.evaluate(() => { location.hash = '#/asetukset'; });
await a.page.waitForTimeout(400);
await a.page.locator('#view .card input[type=text]').first().fill('Ilves Keltainen 07');
await a.page.locator('#view .card .btn.primary', { hasText: 'Tallenna' }).first().click();
await a.page.waitForTimeout(300);
await a.sync();
await b.sync();
const uiName = (await b.state()).team.name;
if (uiName !== 'Ilves Keltainen 07') {
  fail(`asetuksista tehty nimeäminen ei siirtynyt: ${uiName}`);
} else {
  console.log('asetuksista nimetty joukkue siirtyi toiselle laitteelle:', uiName);
}
// Nimi näkyy myös etusivun otsikossa
await b.page.evaluate(() => { location.hash = '#/ottelupaiva'; });
await b.page.waitForTimeout(300);
const heading = (await b.page.locator('#topbar h1').textContent()).trim();
if (!heading.startsWith('Ilves Keltainen 07')) fail(`etusivun otsikko ei päivittynyt: ${heading}`);
else console.log('etusivun otsikko laitteella B:', heading);

// --- Uusi laite, jolle on annettu nimi ennen kirjautumista ---
const c = await device('laite C');
await c.edit((st) => { st.team.name = 'C:n oma nimi'; });
await c.connect();
await c.signIn('valmentaja@example.com');
await c.page.waitForTimeout(300);
const nc = (await c.state()).team;
if (nc.name !== 'C:n oma nimi') {
  fail(`tyhjällä laitteella annettu nimi hukkui kirjautuessa: ${nc.name}`);
} else {
  console.log('tyhjällä laitteella annettu nimi säilyi:', nc.name);
}

// --- Aivan uusi laite ilman omia muutoksia saa pilven nimen ---
const d = await device('laite D');
await d.connect();
await d.signIn('valmentaja@example.com');
await d.page.waitForTimeout(300);
const nd = (await d.state()).team;
if (nd.name === 'Oma joukkue') fail('uusi laite jäi oletusnimeen');
else console.log('uusi laite sai pilven nimen:', nd.name);

// Uusi laite saa myös kaiken muun sisällön, ei pelkkää nimeä
{
  const sd = await d.state();
  const sb2 = await b.state();
  const counts = (st) => ['players', 'staff', 'lineups', 'drills', 'tournaments', 'matches']
    .map((k) => `${k}=${(st[k] || []).length}`).join(' ');
  if (counts(sd) !== counts(sb2)) {
    fail(`uusi laite sai vajaan sisällön:\n  uusi: ${counts(sd)}\n  vanha: ${counts(sb2)}`);
  } else {
    console.log('uusi laite sai koko sisällön:', counts(sd));
  }
}

// --- Rakennetarkistus: jokainen tilan lista kulkee pilveen ja yhdistämisen läpi ---
// Näin uusi lista ei voi jäädä vahingossa synkronoinnin ulkopuolelle.
{
  const gaps = await a.page.evaluate(async () => {
    const store = await import('/js/store.js');
    const m = await import('/js/merge.js');
    const st = store.getState();
    const lists = Object.keys(st).filter((k) => Array.isArray(st[k]));
    const inPayload = Object.keys(m.payload(st));
    const merged = m.mergeStates(null, st, m.payload(st)).state;
    return {
      lists,
      puuttuuPayloadista: lists.filter((k) => !inPayload.includes(k)),
      puuttuuYhdistamisesta: lists.filter((k) => !Array.isArray(merged[k])),
      hukkuiYhdistamisessa: lists.filter((k) => (merged[k] || []).length !== st[k].length),
    };
  });
  if (gaps.puuttuuPayloadista.length || gaps.puuttuuYhdistamisesta.length || gaps.hukkuiYhdistamisessa.length) {
    fail('synkronoinnin ulkopuolelle jää tietoa: ' + JSON.stringify(gaps));
  } else {
    console.log(`kaikki ${gaps.lists.length} listaa kulkevat pilveen ja yhdistämisen läpi:`, gaps.lists.join(', '));
  }
}

await browser.close();
server.close();

if (errors.length) {
  console.error('SELAINVIRHEET:\n' + errors.join('\n'));
  process.exitCode = 1;
}
if (!process.exitCode) console.log('OK – synkronointi toimii kahdella laitteella');
