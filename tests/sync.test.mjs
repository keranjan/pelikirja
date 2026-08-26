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
    lineup: { formation: '4-3-3', slots: Array(11).fill(null), bench: [], unavailable: [], positions: {}, drawings: [] } });
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

await browser.close();
server.close();

if (errors.length) {
  console.error('SELAINVIRHEET:\n' + errors.join('\n'));
  process.exitCode = 1;
}
if (!process.exitCode) console.log('OK – synkronointi toimii kahdella laitteella');
