// Savutesti: käy läpi sovelluksen päävirran oikeassa selaimessa.
// Käyttö: npm test  (kuvakaappaukset: npm test -- <hakemisto>)
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.webmanifest': 'application/manifest+json',
  '.png': 'image/png', '.svg': 'image/svg+xml',
};
const server = http.createServer((req, res) => {
  const rel = decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'index.html';
  const file = path.join(ROOT, rel);
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404).end('not found');
    return;
  }
  res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(8777, '127.0.0.1', r));

const SHOT = process.argv[2] || path.join(ROOT, '.screenshots');
fs.mkdirSync(SHOT, { recursive: true });
const exe = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const browser = await chromium.launch({ executablePath: fs.existsSync(exe) ? exe : undefined });
const ctx = await browser.newContext({
  viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, locale: 'fi-FI',
  permissions: ['clipboard-read', 'clipboard-write'],
});
const page = await ctx.newPage();
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));

const VEO = 'https://app.veo.co/matches/20260824-ilves-keltainen-vs-pjk-v40f1ec0/';
/** Etsii ruudulta irrallisen "null"- tai "undefined"-tekstin (DOM:n append-ansa). */
const strayText = (where) => page.evaluate((sel) => {
  const root = document.querySelector(sel);
  if (!root) return null;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const text = node.textContent.trim();
    if (text === 'null' || text === 'undefined' || text === 'false') return text;
  }
  return null;
}, where);

const shot = (n) => page.screenshot({ path: `${SHOT}/${n}.png` });
const tap = async (sel) => { await page.locator(sel).first().click(); await page.waitForTimeout(120); };
const tapText = async (t) => { await page.getByText(t, { exact: false }).first().click(); await page.waitForTimeout(120); };

await page.goto('http://localhost:8777/index.html');
await page.waitForTimeout(400);

// --- Tyhjä tila: jokainen näkymä piirtyy ilman virheitä ---
for (const hash of ['#/ottelupaiva', '#/ottelut', '#/kokoonpanot', '#/pelaajat', '#/tilastot', '#/asetukset']) {
  await page.evaluate((hh) => { location.hash = hh; }, hash);
  await page.waitForTimeout(180);
  const title = (await page.locator('#topbar h1').textContent()).trim();
  const content = (await page.locator('#view').textContent()).trim();
  if (title.startsWith('Virhe') || !content) {
    console.error(`Näkymä ${hash} ei piirtynyt (otsikko: ${title})`);
    process.exit(1);
  }
}
console.log('tyhjät näkymät piirtyvät');

// --- Pelaajat ---
await tap('#tabbar a[href="#/pelaajat"]');
const players = [
  ['Aku Ahonen', '1', 'MV'], ['Bertta Broman', '2', 'LP'], ['Cecil Cronberg', '4', 'KP'],
  ['Daniela Dahl', '5', 'KP'], ['Eemil Eskola', '3', 'LP'], ['Fanni Forsman', '6', 'AKK'],
  ['Gustav Grönroos', '8', 'KK'], ['Hilla Hakala', '10', 'YKK'], ['Iiro Ilves', '7', 'LH'],
  ['Jonna Järvi', '11', 'LH'], ['Kalle Koski', '9', 'KH'], ['Lumi Laine', '14', 'KK'],
  ['Mikael Mäki', '12', 'MV'],
];
for (const [name, num, role] of players) {
  await tap('#topbar .iconbtn[aria-label="Lisää pelaaja"], .empty .btn.primary');
  const strayNew = await strayText('#overlay');
  if (strayNew) { console.error(`Uusi pelaaja -lomakkeella lukee "${strayNew}"`); process.exit(1); }
  await page.locator('.sheet input[type=text]').fill(name);
  await page.locator('.sheet input[type=number]').fill(num);
  if (name === players[0][0]) {
    // Pelinumero ja vahvempi jalka ovat samalla rivillä samalta korkeudelta.
    const boxes = await page.locator('.sheet .field-row > label').evaluateAll(
      (els) => els.map((el) => Math.round(el.getBoundingClientRect().top)));
    if (boxes.length !== 2 || boxes[0] !== boxes[1]) {
      console.error('Pelinumero ja jalka eivät ole samalla tasolla: ' + JSON.stringify(boxes));
      process.exit(1);
    }
    const chips = await page.locator('.sheet .chip').allTextContents();
    if (!chips.some((c) => c.startsWith('AKK')) || !chips.some((c) => c.startsWith('YKK'))) {
      console.error('Pelipaikkoja AKK/YKK ei löydy: ' + chips.join(' | '));
      process.exit(1);
    }
  }
  await page.locator('.sheet .chip', { hasText: new RegExp('^' + role + ' ') }).first().click();
  await page.locator('.sheet .btn.primary').click();
  await page.waitForTimeout(80);
}
// Valmentajat samalla välilehdellä
await tapText('Lisää valmentaja');
await page.waitForTimeout(250);
await page.locator('.sheet input[type=text]').first().fill('Väinö Valmentaja');
await page.locator('.sheet select').first().selectOption('paavalmentaja');
await page.locator('.sheet .btn.primary').click();
await page.waitForTimeout(250);
const staffCount = await page.evaluate(() => JSON.parse(localStorage.getItem('pelikirja.v1')).staff.length);
if (staffCount !== 1) { console.error('Valmentaja ei tallentunut'); process.exit(1); }

await shot('01-pelaajat');

// Muokkausnäkymässä on poistopainike eikä irrallista tekstiä
await page.locator('#view .card').first().click();
await page.waitForTimeout(250);
const strayEdit = await strayText('#overlay');
if (strayEdit) { console.error(`Pelaajan muokkauksessa lukee "${strayEdit}"`); process.exit(1); }
if (!(await page.locator('#overlay .btn.danger', { hasText: 'Poista pelaaja' }).count())) {
  console.error('Poista pelaaja -painike puuttuu muokkauksesta'); process.exit(1);
}
await page.locator('#overlay .iconbtn').first().click();
await page.waitForTimeout(200);
console.log('lomakkeissa ei irrallisia null-tekstejä');

// --- Ottelu ---
await tap('#tabbar a[href="#/ottelut"]');
await tap('#topbar .iconbtn[aria-label="Lisää tapahtuma"], .empty .btn.primary');
await page.locator('.sheet input[type=text]').first().fill('FC Naapuri');
const d = new Date(Date.now() + 5 * 86400000).toISOString().slice(0, 10);
await page.locator('.sheet input[type=date]').fill(d);
await page.locator('.sheet input[type=time]').fill('14:30');
await page.locator('.sheet input[type=text]').nth(1).fill('Ilves Beta');   // oma joukkue
await page.locator('.sheet input[type=text]').nth(2).fill('Keskuskenttä 2');
await page.locator('.sheet .btn.primary').click();
await page.waitForTimeout(300);
const savedTeam = await page.evaluate(() => JSON.parse(localStorage.getItem('pelikirja.v1')).matches[0].team);
if (savedTeam !== 'Ilves Beta') { console.error('Ottelun oma joukkue ei tallentunut: ' + savedTeam); process.exit(1); }
await shot('02-ottelu-kokoonpano-tyhja');

// 8 vs 8 -systeemit ovat valittavissa
const formationSelect = page.locator('#view select').first();
const options = await formationSelect.locator('option').evaluateAll((els) => els.map((e) => e.value));
for (const id of ['8-2-3-2', '8-2-4-1']) {
  if (!options.includes(id)) { console.error('Pelisysteemi puuttuu: ' + id); process.exit(1); }
}
await formationSelect.selectOption('8-2-3-2');
await page.waitForTimeout(200);
const slots8 = await page.locator('#view .slot').count();
if (slots8 !== 8) { console.error('8 vs 8 -kentällä ' + slots8 + ' paikkaa'); process.exit(1); }
console.log('8 vs 8 -systeemit kunnossa');

// Systeemi + automaattitäyttö
await page.locator('#view select').first().selectOption('4-3-3');
await page.waitForTimeout(150);
await tapText('Automaattitäyttö');
await page.waitForTimeout(200);
await shot('03-kokoonpano-taytetty');

// Vaihda pelaaja paikkaan käsin
await page.locator('.slot').nth(9).click();
await page.waitForTimeout(200);
await shot('04-pelaajavalinta');
await page.locator('.sheet .list-item').first().click();
await page.waitForTimeout(200);

// Ryhmä: napautus vihreäksi vie pelaajan mukaan otteluun (penkille)
await page.locator('#view button.btn', { hasText: 'Hallitse ryhmää' }).first().click();
await page.waitForTimeout(250);
const benchBefore = await page.evaluate(() =>
  JSON.parse(localStorage.getItem('pelikirja.v1')).matches[0].lineup.bench.length);
const offCard = page.locator('#overlay .card.pick:not(.on)').first();
if (!(await offCard.count())) { console.error('Ryhmässä ei ole valitsematonta pelaajaa'); process.exit(1); }
const offName = (await offCard.locator('.bold').textContent()).trim();
await offCard.click();
await page.waitForTimeout(200);
const picked = page.locator('#overlay .card.pick', { hasText: offName }).first();
if (!(await picked.evaluate((el) => el.classList.contains('on')))) {
  console.error('Napautettu pelaaja ei muuttunut vihreäksi'); process.exit(1);
}
if (await page.locator('#overlay .segmented button', { hasText: 'Vaihtopenkki' }).count()) {
  console.error('Vanha Vaihtopenkki/Poissa-valinta on yhä näkyvissä'); process.exit(1);
}
await shot('05-ryhma-valinta');
const state1 = await page.evaluate(() => JSON.parse(localStorage.getItem('pelikirja.v1')).matches[0].lineup);
if (state1.bench.length !== benchBefore + 1) {
  console.error('Vihreäksi napautettu pelaaja ei siirtynyt vaihtopenkille'); process.exit(1);
}
// Toinen napautus palauttaa pelaajan poissaoleviin.
await picked.click();
await page.waitForTimeout(200);
const state2 = await page.evaluate(() => JSON.parse(localStorage.getItem('pelikirja.v1')).matches[0].lineup);
if (state2.bench.length !== benchBefore) {
  console.error('Toinen napautus ei poistanut pelaajaa ryhmästä'); process.exit(1);
}
await picked.click();
await page.waitForTimeout(200);
await page.locator('#overlay .iconbtn').first().click();
await page.waitForTimeout(200);
console.log('ryhmävalinta toimii napautuksella');
await shot('05-penkki');

// Ryhmä-välilehti mahtuu ruudulle myös pitkillä nimillä.
await page.evaluate(() => { location.hash = '#/pelaajat'; });
await page.waitForTimeout(250);
const overflow = await page.evaluate(() => {
  const view = document.querySelector('#view');
  return {
    view: view.scrollWidth - view.clientWidth,
    doc: document.documentElement.scrollWidth - window.innerWidth,
  };
});
if (overflow.view > 1 || overflow.doc > 1) {
  console.error('Ryhmä-näkymää voi vierittää sivusuunnassa: ' + JSON.stringify(overflow));
  process.exit(1);
}
console.log('ryhmälista mahtuu ruudulle');
await page.evaluate(() => { history.back(); });
await page.waitForTimeout(300);

// --- Taktiikkataulu ---
await page.locator('#view .mode-switch button', { hasText: 'Taktiikka' }).click();
await page.waitForTimeout(250);

// Veto pitää aloittaa kohdasta, jossa ei ole pelaajaa – muuten se on siirto.
const freeStartOn = (target, skip = 0) => target.evaluate((n) => {
  const pitch = document.querySelector('#view .pitch');
  const r = pitch.getBoundingClientRect();
  const taken = [...pitch.querySelectorAll('.slot')].map((el) => el.getBoundingClientRect());
  const found = [];
  for (let y = 8; y < 92; y += 3) {
    for (let x = 8; x < 92; x += 3) {
      const px = r.left + (r.width * x) / 100;
      const py = r.top + (r.height * y) / 100;
      const hit = taken.some((b) => px > b.left - 8 && px < b.right + 8 && py > b.top - 8 && py < b.bottom + 8);
      if (!hit) found.push({ x: px, y: py });
    }
  }
  return found[Math.min(n * 7, found.length - 1)];
}, skip);
const freeStart = (skip = 0) => freeStartOn(page, skip);

const drawStroke = async (start, dx, dy) => {
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  const steps = 6;
  for (let i = 1; i <= steps; i++) {
    await page.mouse.move(start.x + (dx * i) / steps, start.y + (dy * i) / steps);
  }
  await page.mouse.up();
  await page.waitForTimeout(200);
};

const drawings = () => page.evaluate(() =>
  JSON.parse(localStorage.getItem('pelikirja.v1')).matches[0].lineup.drawings);

// Syöttö mustalla (oletustyökalu)
const onPlayer = await page.locator('#view .slot').nth(4).boundingBox();
await drawStroke({ x: onPlayer.x + onPlayer.width / 2, y: onPlayer.y + 18 }, 90, -70);
let strokes = await drawings();
if (strokes.length !== 1 || strokes[0].tool !== 'pass' || strokes[0].color !== 'black' || strokes[0].points.length < 3) {
  console.error('Syöttöviiva ei tallentunut: ' + JSON.stringify(strokes)); process.exit(1);
}

// Laukaus punaisella
await page.locator('#view .toolbtn', { hasText: 'Laukaus' }).click();
await page.locator('#view .swatch[aria-label="Punainen"]').click();
await page.waitForTimeout(200);
await drawStroke(await freeStart(3), 60, -90);
strokes = await drawings();
if (strokes.length !== 2 || strokes[1].tool !== 'shot' || strokes[1].color !== 'red') {
  console.error('Laukausnuoli ei tallentunut: ' + JSON.stringify(strokes[1])); process.exit(1);
}
if (!(await page.locator('#view .tactics-layer polygon').count())) {
  console.error('Laukauksen nuolenkärki puuttuu'); process.exit(1);
}

// Kuljetus on katkoviiva
await page.locator('#view .toolbtn', { hasText: 'Kuljetus' }).click();
await page.waitForTimeout(150);
await drawStroke(await freeStart(6), -40, -80);
strokes = await drawings();
if (strokes[2].tool !== 'dribble') { console.error('Kuljetusviiva puuttuu'); process.exit(1); }
const dashed = await page.locator('#view .tactics-layer path[stroke-dasharray]').count();
if (dashed < 2) { console.error('Katkoviivaa ei piirretty'); process.exit(1); }

// Pelaajan siirto onnistuu vain Siirrä-työkalulla
await page.locator('#view .toolbtn', { hasText: 'Siirrä' }).click();
await page.waitForTimeout(200);
const token = page.locator('#view .slot').nth(5);
const tb = await token.boundingBox();
await page.mouse.move(tb.x + tb.width / 2, tb.y + 20);
await page.mouse.down();
await page.mouse.move(tb.x + tb.width / 2 + 40, tb.y - 30, { steps: 5 });
await page.mouse.up();
await page.waitForTimeout(250);
const positions = await page.evaluate(() =>
  JSON.parse(localStorage.getItem('pelikirja.v1')).matches[0].lineup.positions);
if (!Object.keys(positions).length) { console.error('Pelaajan siirto ei tallentunut'); process.exit(1); }
if ((await drawings()).length !== 3) { console.error('Siirto lisäsi ylimääräisen vedon'); process.exit(1); }
console.log('taktiikka: 3 vetoa (yksi aloitettu pelaajan päältä), siirretty pelaaja', Object.keys(positions)[0]);

// Takaisin piirtotyökaluun
await page.locator('#view .toolbtn', { hasText: 'Syöttö' }).click();
await page.waitForTimeout(200);

// Kaksoisnapautuksen zoomaus on estetty ja valittu työkalu erottuu selvästi
const touchRules = await page.evaluate(() => {
  const style = (sel) => getComputedStyle(document.querySelector(sel)).touchAction;
  const bg = (sel) => getComputedStyle(document.querySelector(sel)).backgroundColor;
  const tools = [...document.querySelectorAll('#view .toolbtn')];
  const on = tools.find((t) => t.classList.contains('on'));
  const off = tools.find((t) => !t.classList.contains('on'));
  return {
    body: style('body'),
    button: style('#view .toolbtn'),
    pitch: style('#view .pitch'),
    onBg: bg('#view .toolbtn.on'),
    offBg: off ? getComputedStyle(off).backgroundColor : '',
    pressed: on?.getAttribute('aria-pressed'),
  };
});
if (touchRules.body !== 'manipulation' || touchRules.button !== 'manipulation') {
  console.error('Kaksoisnapautuksen zoomausta ei ole estetty: ' + JSON.stringify(touchRules));
  process.exit(1);
}
if (touchRules.pitch !== 'none') {
  console.error('Piirtoalustalla on yhä selaimen eleet käytössä: ' + touchRules.pitch);
  process.exit(1);
}
if (touchRules.onBg === touchRules.offBg || touchRules.pressed !== 'true') {
  console.error('Valittu työkalu ei erotu: ' + JSON.stringify(touchRules));
  process.exit(1);
}
console.log(`eleet: body=${touchRules.body}, kenttä=${touchRules.pitch}; valittu työkalu ${touchRules.onBg}`);

await shot('12-taktiikka');

// --- Koko ruudun taktiikkataulu ---
await page.locator('#view .btn', { hasText: 'Koko ruutu' }).click();
await page.waitForTimeout(400);
const board = await page.locator('.board .pitch').boundingBox();
const view = page.viewportSize();
if (board.height < view.height * 0.55) {
  console.error('Taulun kenttä jäi pieneksi: ' + JSON.stringify(board)); process.exit(1);
}
const viewportLocked = await page.evaluate(() =>
  document.querySelector('meta[name="viewport"]').content);
if (!/user-scalable=no/.test(viewportLocked)) {
  console.error('Koko ruudun taulu ei lukinnut zoomausta: ' + viewportLocked);
  process.exit(1);
}
await shot('13-taktiikkataulu');
await page.mouse.move(board.x + board.width * 0.3, board.y + board.height * 0.7);
await page.mouse.down();
for (let i = 1; i <= 6; i++) {
  await page.mouse.move(board.x + board.width * (0.3 + i * 0.05), board.y + board.height * (0.7 - i * 0.05));
}
await page.mouse.up();
await page.waitForTimeout(250);
if ((await drawings()).length !== 4) {
  console.error('Koko ruudun taululla piirtäminen ei tallentunut'); process.exit(1);
}
await page.locator('.board .board-close').click();
await page.waitForTimeout(300);
if (await page.locator('.board').count()) { console.error('Taulu ei sulkeutunut'); process.exit(1); }
const viewportRestored = await page.evaluate(() =>
  document.querySelector('meta[name="viewport"]').content);
if (/user-scalable=no/.test(viewportRestored)) {
  console.error('Zoomaus jäi lukituksi taulun sulkemisen jälkeen: ' + viewportRestored);
  process.exit(1);
}
console.log('koko ruudun taulu: kenttä ' + Math.round(board.height) + 'px, piirto tallentui');
await page.locator('#view .btn', { hasText: 'Kumoa' }).click();
await page.waitForTimeout(200);

// Kumoa toimii ensimmäisellä painauksella eikä näkymä hyppää alkuun
await page.evaluate(() => { const v = document.getElementById('view'); v.scrollTop = v.scrollHeight; });
await page.waitForTimeout(200);
const scrollBefore = await page.evaluate(() => document.getElementById('view').scrollTop);
if (scrollBefore < 50) { console.error('Testiä varten pitäisi olla vieritettävää sisältöä'); process.exit(1); }
await page.locator('#view .btn', { hasText: 'Kumoa' }).click();
await page.waitForTimeout(250);
if ((await drawings()).length !== 2) { console.error('Kumoa ei toiminut'); process.exit(1); }
const scrollAfter = await page.evaluate(() => document.getElementById('view').scrollTop);
if (Math.abs(scrollAfter - scrollBefore) > 4) {
  console.error(`Näkymä hyppäsi painalluksesta: ${scrollBefore} -> ${scrollAfter}`);
  process.exit(1);
}
console.log(`kumoa toimi kerralla, vierityskohta säilyi (${scrollAfter} px)`);
await page.locator('#view .btn', { hasText: 'Tyhjennä' }).click();
await page.waitForTimeout(200);
if ((await drawings()).length !== 0) { console.error('Tyhjennys ei toiminut'); process.exit(1); }
await page.locator('#view .btn', { hasText: 'Palauta paikat' }).click();
await page.waitForTimeout(200);
const cleared = await page.evaluate(() =>
  JSON.parse(localStorage.getItem('pelikirja.v1')).matches[0].lineup.positions);
if (Object.keys(cleared).length) { console.error('Paikkojen palautus ei toiminut'); process.exit(1); }

await page.locator('#view .mode-switch button', { hasText: 'Kokoonpano' }).click();
await page.waitForTimeout(250);

// Valmentaja mukaan otteluun
await page.locator('#view .btn', { hasText: 'Valmentajat' }).click();
await page.waitForTimeout(250);
await page.locator('#overlay .list-item').first().click();
await page.waitForTimeout(250);
await page.locator('#overlay .iconbtn').first().click();
await page.waitForTimeout(250);
const inLineup = await page.evaluate(() =>
  JSON.parse(localStorage.getItem('pelikirja.v1')).matches[0].lineup.staff);
if (inLineup.length !== 1) { console.error('Valmentaja ei tullut kokoonpanoon: ' + JSON.stringify(inLineup)); process.exit(1); }

// Jaettu kokoonpano sisältää valmennuksen
await page.locator('#view .btn', { hasText: 'Jaa kokoonpano' }).click();
await page.waitForTimeout(400);
const shared = await page.evaluate(async () => {
  try { return await navigator.clipboard.readText(); }
  catch { return document.querySelector('#overlay textarea')?.value || ''; }
});
if (!/Valmennus: Väinö Valmentaja \(Päävalmentaja\)/.test(shared)) {
  console.error('Jaettu kokoonpano ei sisällä valmennusta:\n' + shared);
  process.exit(1);
}
if (await page.locator('#overlay .sheet').count()) {
  await page.locator('#overlay .iconbtn').first().click();
  await page.waitForTimeout(200);
}
console.log('valmentaja kokoonpanossa ja jaetussa tekstissä');

// Tallenna pohjaksi
await tapText('Tallenna pohjaksi');
await page.locator('.sheet .btn.primary').click();
await page.waitForTimeout(200);

// --- Otteluseuranta ---
await page.locator('#view .segmented.four button', { hasText: 'Seuranta' }).click();
await page.waitForTimeout(300);
await page.locator('#view input#periods').fill('2');
await page.locator('#view input#plen').fill('25');
await page.locator('#view .btn.primary', { hasText: 'Käynnistä ottelukello' }).click();
await page.waitForTimeout(300);

const timing = () => page.evaluate(() =>
  JSON.parse(localStorage.getItem('pelikirja.v1')).matches[0].timing);
let t = await timing();
const starters = t.events.filter((e) => e.type === 'in' && e.at === 0).length;
if (t.status !== 'running' || starters < 5) {
  console.error('Kello ei käynnistynyt oikein: ' + JSON.stringify({ status: t.status, starters }));
  process.exit(1);
}

// Kello etenee
const firstClock = await page.locator('#view .clock').textContent();
await page.waitForTimeout(2200);
const laterClock = await page.locator('#view .clock').textContent();
if (firstClock === laterClock) { console.error(`Kello ei edennyt (${firstClock})`); process.exit(1); }

// Peliaika karttuu kentällä olevalle
const fieldRowTime = await page.locator('#view .card.row .tnum').first().textContent();

// Vaihto: ensimmäinen kentältä ulos, penkiltä tilalle
await page.locator('#view .btn', { hasText: 'Vaihda' }).first().click();
await page.waitForTimeout(300);
await page.locator('#overlay .list-item').first().click();
await page.waitForTimeout(400);
t = await timing();
const subs = t.events.filter((e) => e.at > 0);
if (subs.length !== 2 || !subs.some((e) => e.type === 'out') || !subs.some((e) => e.type === 'in')) {
  console.error('Vaihtoa ei kirjattu: ' + JSON.stringify(subs));
  process.exit(1);
}

// Tauko pysäyttää kellon
await page.locator('#view .btn', { hasText: 'Tauko' }).click();
await page.waitForTimeout(300);
t = await timing();
if (t.status !== 'paused' || !(t.elapsed > 0)) {
  console.error('Tauko ei pysäyttänyt kelloa: ' + JSON.stringify({ status: t.status, elapsed: t.elapsed }));
  process.exit(1);
}
const pausedClock = await page.locator('#view .clock').textContent();
await page.waitForTimeout(1500);
if ((await page.locator('#view .clock').textContent()) !== pausedClock) {
  console.error('Kello jatkoi käyntiä tauolla'); process.exit(1);
}

await shot('14-peliaika');

// Maali oman joukkueen pelaajalle
await page.locator('#view .btn', { hasText: 'Maali' }).first().click();
await page.waitForTimeout(300);
await page.locator('#overlay .btn.primary').first().click();
await page.waitForTimeout(300);
await page.locator('#overlay .list-item').first().click();
await page.waitForTimeout(300);
await page.locator('#overlay .list-item').nth(1).click();
await page.waitForTimeout(400);
t = await timing();
const goal = t.events.find((e) => e.type === 'goal');
if (!goal || goal.team !== 'us' || !goal.playerId || !goal.assistId) {
  console.error('Maalia ei kirjattu oikein: ' + JSON.stringify(goal));
  process.exit(1);
}
let score = await page.evaluate(() => JSON.parse(localStorage.getItem('pelikirja.v1')).matches[0].result);
if (!score || score.gf !== 1) { console.error('Tulos ei päivittynyt maalista: ' + JSON.stringify(score)); process.exit(1); }

// Vastustajan maali
await page.locator('#view .btn', { hasText: 'Maali' }).first().click();
await page.waitForTimeout(300);
await page.locator('#overlay .btn', { hasText: 'teki maalin' }).nth(1).click();
await page.waitForTimeout(400);
score = await page.evaluate(() => JSON.parse(localStorage.getItem('pelikirja.v1')).matches[0].result);
if (score.ga !== 1) { console.error('Vastustajan maali ei kirjautunut: ' + JSON.stringify(score)); process.exit(1); }

// Keltainen kortti omalle pelaajalle
await page.locator('#view .btn', { hasText: 'Kortti' }).first().click();
await page.waitForTimeout(300);
await page.locator('#overlay .btn', { hasText: 'Keltainen' }).click();
await page.waitForTimeout(300);
await page.locator('#overlay .list-item').first().click();
await page.waitForTimeout(400);
t = await timing();
const card = t.events.find((e) => e.type === 'card');
if (!card || card.card !== 'yellow' || !card.playerId) {
  console.error('Korttia ei kirjattu: ' + JSON.stringify(card)); process.exit(1);
}

// Tapahtuman ajan korjaus yhteisestä listasta
await page.locator('#view .card.event', { hasText: '▲' }).first().click();
await page.waitForTimeout(300);
await page.locator('#overlay input[type=number]').fill('12');
await page.locator('#overlay .btn.primary').click();
await page.waitForTimeout(300);
t = await timing();
if (!t.events.some((e) => e.at === 720)) {
  console.error('Tapahtuman ajan korjaus ei tallentunut: ' + JSON.stringify(t.events.map((e) => e.at)));
  process.exit(1);
}
console.log('seuranta: maali syöttäjineen, vastustajan maali, kortti ja ajan korjaus');
console.log(`peliaika: kello ${firstClock} -> ${laterClock}, ensimmäinen pelaaja ${fieldRowTime}`);

// --- Tulos ---
await page.locator('#view .segmented button', { hasText: 'Tulos' }).click();
await page.waitForTimeout(300);

// Seurannan tapahtumat näkyvät tuloksissa aikajärjestyksessä
const timelineTimes = await page.locator('#view .card.event .numchip').allTextContents();
if (timelineTimes.length < 3) {
  console.error('Tapahtumalista jäi vajaaksi: ' + JSON.stringify(timelineTimes));
  process.exit(1);
}
const asSeconds = timelineTimes.map((t2) => {
  const [mm, ss] = t2.split(':').map(Number);
  return mm * 60 + ss;
});
if (asSeconds.some((v, i) => i > 0 && v < asSeconds[i - 1])) {
  console.error('Tapahtumat eivät ole aikajärjestyksessä: ' + JSON.stringify(timelineTimes));
  process.exit(1);
}
const shownScore = await page.locator('#view .card.center').first().textContent();
console.log(`tulokset: ${timelineTimes.length} tapahtumaa aikajärjestyksessä, tulos ${shownScore.replace(/\s+/g, ' ').trim().slice(0, 24)}`);
// Veo-videolinkki
await tapText('Lisää videolinkki');
await page.waitForTimeout(200);
const strayVideo = await strayText('#overlay');
if (strayVideo) { console.error(`Videolinkki-ikkunassa lukee "${strayVideo}"`); process.exit(1); }
await page.locator('.sheet input[type=text]').fill('ei-mikaan-osoite');
await page.locator('.sheet .btn.primary').click();
await page.waitForTimeout(200);
if (!(await page.locator('#overlay .sheet').count())) { console.error('Kelvoton videolinkki hyväksyttiin'); process.exit(1); }
await page.locator('.sheet input[type=text]').fill(VEO);
await page.locator('.sheet .btn.primary').click();
await page.waitForTimeout(250);
const videoLink = page.locator('#view a.btn.primary');
const videoHref = await videoLink.getAttribute('href');
console.log('videonappi:', (await videoLink.textContent()).trim(), '->', videoHref);
if (videoHref !== VEO) { console.error('Videolinkki ei tallentunut'); process.exit(1); }

// Valmentajan arvio: arvosana asteikolla 4–10 ja sanallinen analyysi
const rating = () => page.evaluate(() => JSON.parse(localStorage.getItem('pelikirja.v1')).matches[0].result.rating);
const grades = page.locator('#view .grades .grade');
const gradeText = await grades.allTextContents();
if (gradeText.join(',') !== '4,5,6,7,8,9,10') {
  console.error('Arvosana-asteikko ei ole 4–10: ' + gradeText.join(',')); process.exit(1);
}
await grades.nth(4).click();          // 8
await page.waitForTimeout(250);
if (await rating() !== 8) { console.error('Arvosana ei tallentunut: ' + await rating()); process.exit(1); }
await page.locator('#view .btn', { hasText: '＋ 0,5' }).click();
await page.waitForTimeout(250);
if (await rating() !== 8.5) { console.error('Puolikas ei toiminut: ' + await rating()); process.exit(1); }
const reviewCard = await page.locator('#view .grades').locator('..').textContent();
if (!reviewCard.includes('8,5') || !reviewCard.includes('Hyvä +')) {
  console.error('Arvosanan kuvaus tai lukema puuttuu: ' + reviewCard.slice(0, 100)); process.exit(1);
}
// Asteikon ylä- ja alarajat pitävät
await page.locator('#view .grades .grade', { hasText: '10' }).click();
await page.waitForTimeout(200);
if (await page.locator('#view .btn', { hasText: '＋ 0,5' }).isEnabled()) {
  console.error('Arvosana yli kympin on mahdollinen'); process.exit(1);
}
const ANALYYSI = 'Puolustus piti hyvin, keskikentän paineistus parani toisella jaksolla.';
await page.locator('#view textarea').last().fill(ANALYYSI);
await page.locator('#view .grades .grade').nth(4).click();   // vie fokuksen pois -> change
await page.waitForTimeout(250);
const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('pelikirja.v1')).matches[0].result);
if (stored.notes !== ANALYYSI) { console.error('Analyysi ei tallentunut: ' + stored.notes); process.exit(1); }
if (stored.rating !== 8) { console.error('Arvosanan vaihto ei toiminut: ' + stored.rating); process.exit(1); }
// Saman numeron napautus uudestaan poistaa arvosanan.
await page.locator('#view .grades .grade').nth(4).click();
await page.waitForTimeout(250);
if (await rating() !== null) { console.error('Arvosanan poisto ei toiminut'); process.exit(1); }
await page.locator('#view .grades .grade').nth(4).click();
await page.locator('#view .btn', { hasText: '＋ 0,5' }).click();
await page.waitForTimeout(250);
console.log('valmentajan arvio: arvosana', await rating(), 'ja analyysi tallessa');
await shot('06-tulos');

// --- Tilastot / kokoonpanot / asetukset ---
await tap('#tabbar a[href="#/tilastot"]');
await page.waitForTimeout(300);
const statHeaders = await page.locator('#view table.stats th').allTextContents();
if (!statHeaders.includes('Min')) {
  console.error('Peliaikasarake puuttuu tilastoista: ' + statHeaders.join(', '));
  process.exit(1);
}
const statsText = await page.locator('#view').textContent();
if (!statsText.includes('Valmentajan arvosana') || !statsText.includes('8,5')) {
  console.error('Arvosanan keskiarvo puuttuu tilastoista'); process.exit(1);
}
await shot('07-tilastot');
await tap('#tabbar a[href="#/kokoonpanot"]');
await shot('08-kokoonpanot');
await page.evaluate(() => { location.hash = '#/asetukset'; });
await page.waitForTimeout(300);
await shot('09-asetukset');

// --- Varmuuskopion vienti ja tuonti ---
await tapText('Vie tiedot');
await page.waitForTimeout(200);
const backup = await page.locator('.sheet textarea').inputValue();
await page.locator('#overlay .iconbtn').first().click();
await tapText('Tyhjennä kaikki tiedot');
await page.waitForTimeout(200);
await page.locator('.sheet .btn.danger').click();
await page.waitForTimeout(300);
const afterReset = await page.evaluate(() => JSON.parse(localStorage.getItem('pelikirja.v1')).players.length);
await tapText('Tuo tiedot');
await page.waitForTimeout(200);
await page.locator('.sheet textarea').fill(backup);
await page.locator('.sheet .btn', { hasText: 'Tuo liitetty teksti' }).click();
await page.waitForTimeout(300);
const afterImport = await page.evaluate(() => JSON.parse(localStorage.getItem('pelikirja.v1')).players.length);
console.log('varmuuskopio: tyhjennyksen jälkeen', afterReset, 'pelaajaa, tuonnin jälkeen', afterImport);
if (afterReset !== 0 || afterImport !== players.length) { console.error('Varmuuskopion vienti/tuonti ei toimi'); process.exit(1); }

// --- Kahden joukkueen ottelut erottuvat ja suodattuvat ---
await tap('#tabbar a[href="#/ottelut"]');
await tap('#topbar .iconbtn[aria-label="Lisää tapahtuma"]');
await page.locator('.sheet input[type=text]').first().fill('Tampere United');
await page.locator('.sheet input[type=date]').fill(new Date(Date.now() + 9 * 86400000).toISOString().slice(0, 10));
await page.locator('.sheet input[type=text]').nth(1).fill('Ilves Keltainen');
await page.locator('.sheet .btn.primary').click();
await page.waitForTimeout(300);
// Toinen tuleva ottelu, jotta etusivulle syntyy myös "Tulossa myöhemmin" -lista.
await tap('#tabbar a[href="#/ottelut"]');
await tap('#topbar .iconbtn[aria-label="Lisää tapahtuma"]');
await page.locator('.sheet input[type=text]').first().fill('Ilves Alfa');
await page.locator('.sheet input[type=date]').fill(new Date(Date.now() + 12 * 86400000).toISOString().slice(0, 10));
await page.locator('.sheet input[type=text]').nth(1).fill('Ilves Beta');
await page.locator('.sheet .btn.primary').click();
await page.waitForTimeout(300);
await tap('#tabbar a[href="#/ottelut"]');
await page.locator('#view .segmented button', { hasText: 'Tulevat' }).click();
await page.waitForTimeout(250);
const teamChips = await page.locator('#view .chips .chip').allTextContents();
if (!teamChips.includes('Ilves Beta') || !teamChips.includes('Ilves Keltainen')) {
  console.error('Joukkuesuodatin puuttuu: ' + JSON.stringify(teamChips)); process.exit(1);
}
await page.locator('#view .chips .chip', { hasText: 'Ilves Keltainen' }).click();
await page.waitForTimeout(250);
const shownTeams = await page.locator('#view .cards .badge.team').allTextContents();
if (!shownTeams.length || shownTeams.some((t) => t !== 'Ilves Keltainen')) {
  console.error('Joukkuesuodatus ei rajaa otteluita: ' + JSON.stringify(shownTeams)); process.exit(1);
}
await shot('10-joukkuesuodatin');
await page.locator('#view .chips .chip', { hasText: 'Kaikki' }).click();
await page.waitForTimeout(250);
console.log('joukkuesuodatin:', teamChips.join(' | '));
await page.locator('#view .card', { hasText: 'Tampere United' }).click();
await page.waitForTimeout(300);
await page.locator('#view .segmented button', { hasText: 'Tiedot' }).click();
await page.waitForTimeout(200);
const infoTeam = await page.locator('#view .card.row.between', { hasText: 'Oma joukkue' }).textContent();
if (!infoTeam.includes('Ilves Keltainen')) { console.error('Oma joukkue puuttuu ottelun tiedoista'); process.exit(1); }

// Kokoonpanoa täydennettäessä ei ole erillistä poissaolijoiden listaa.
await page.locator('#view .segmented button', { hasText: 'Kokoonpano' }).first().click();
await page.waitForTimeout(250);
const lineupSections = await page.locator('#view .section-title').allTextContents();
if (lineupSections.some((t) => t.startsWith('Poissa'))) {
  console.error('Kokoonpanossa on yhä poissa-lista: ' + JSON.stringify(lineupSections)); process.exit(1);
}
console.log('kokoonpanon osiot:', lineupSections.join(' | '));

// --- Ottelulista (pelatut) ---
await tap('#tabbar a[href="#/ottelut"]');
await page.locator('#view .segmented button', { hasText: 'Pelatut' }).click();
await page.waitForTimeout(200);
await shot('10-ottelut-pelatut');

// --- Ottelupäivä-etusivu ---
await tap('#tabbar a[href="#/ottelupaiva"]');
await page.waitForTimeout(300);
await shot('11-ottelupaiva');
const heroText = await page.locator('#view .hero').first().textContent();
if (!heroText.includes('Tampere United') || !heroText.includes('Ilves Keltainen')) {
  console.error('Etusivun ottelukortista puuttuu ottelu tai joukkue: ' + heroText.slice(0, 120));
  process.exit(1);
}
// Tulossa myöhemmin -kortti kertoo kumman joukkueen ottelu on.
const laterTeams = await page.locator('#view .card.row .badge.team').allTextContents();
if (!laterTeams.includes('Ilves Beta')) {
  console.error('Tulossa myöhemmin -kortista puuttuu joukkue: ' + JSON.stringify(laterTeams));
  process.exit(1);
}
console.log('tulossa myöhemmin:', laterTeams.join(' | '));

// Ylimääräinen ottelu pois, jotta loput tarkistukset katsovat alkuperäistä dataa.
await tap('#tabbar a[href="#/ottelut"]');
await page.locator('#view .segmented button', { hasText: 'Tulevat' }).click();
await page.waitForTimeout(250);
for (const opponent of ['Tampere United', 'Ilves Alfa']) {
  await page.locator('#view .card', { hasText: opponent }).click();
  await page.waitForTimeout(300);
  await page.locator('#view .segmented button', { hasText: 'Tiedot' }).click();
  await page.waitForTimeout(200);
  await page.locator('#view .btn.danger', { hasText: 'Poista tapahtuma' }).click();
  await page.waitForTimeout(200);
  await page.locator('#overlay .btn.danger').click();
  await page.waitForTimeout(300);
}
await tap('#tabbar a[href="#/ottelupaiva"]');
await page.waitForTimeout(250);

// --- Uudelleenlataus: pysyykö data? ---
await page.reload();
await page.waitForTimeout(500);
const persisted = await page.evaluate(() => JSON.parse(localStorage.getItem('pelikirja.v1')));
console.log('videolinkki tallessa:', persisted.matches[0].videoUrl === VEO);
console.log('pelaajia:', persisted.players.length, '| otteluita:', persisted.matches.length,
  '| pohjia:', persisted.lineups.length, '| tulos:', JSON.stringify(persisted.matches[0].result?.gf) + '-' + persisted.matches[0].result?.ga,
  '| kentällä:', persisted.matches[0].lineup.slots.filter(Boolean).length);

// --- Tablettiasettelu ---
for (const [label, size] of [['tabletti pysty', { width: 800, height: 1280 }],
                             ['tabletti vaaka', { width: 1280, height: 800 }]]) {
  const ctx = await browser.newContext({ viewport: size, locale: 'fi-FI', hasTouch: true });
  const tp = await ctx.newPage();
  tp.on('pageerror', (e) => errors.push(`${label}: ${e.message}`));
  await tp.goto('http://localhost:8777/index.html');
  await tp.evaluate((seed) => localStorage.setItem('pelikirja.v1', JSON.stringify(seed)), {
    version: 1, team: { name: 'Tabletti', season: '2026', theme: 'light' }, matches: [],
    players: Array.from({ length: 8 }, (_, i) => ({ id: 'p' + i, name: 'Pelaaja ' + i, number: i + 1, roles: ['KK'], active: true })),
    lineups: [{ id: 'l1', name: 'Asetelma', lineup: {
      formation: '4-3-3', slots: Array(11).fill(null), bench: [], positions: {}, drawings: [] } }],
  });
  await tp.reload();
  await tp.waitForTimeout(400);

  // Sovellus käyttää käytettävissä olevan leveyden, ei jää kapeaksi palkiksi
  const appWidth = await tp.evaluate(() => document.getElementById('app').getBoundingClientRect().width);
  if (appWidth < Math.min(size.width, 780)) {
    console.error(`${label}: kehys jäi kapeaksi (${Math.round(appWidth)} px / ${size.width} px)`);
    process.exit(1);
  }

  // Pelaajakortit useassa sarakkeessa
  await tp.evaluate(() => { location.hash = '#/pelaajat'; });
  await tp.waitForTimeout(300);
  const columns = await tp.evaluate(() => {
    const cards = [...document.querySelectorAll('#view .cards > *')].slice(0, 4);
    return new Set(cards.map((c) => Math.round(c.getBoundingClientRect().left))).size;
  });
  if (columns < 2) { console.error(`${label}: pelaajalista jäi yhteen sarakkeeseen`); process.exit(1); }

  // Kenttäkuva mahtuu ruudulle ilman vieritystä
  await tp.evaluate(() => { location.hash = '#/kokoonpano/l1'; });
  await tp.waitForTimeout(400);
  const pitch = await tp.evaluate(() => {
    const r = document.querySelector('.pitch').getBoundingClientRect();
    return { h: Math.round(r.height), bottom: Math.round(r.bottom), vh: window.innerHeight };
  });
  if (pitch.h < 200 || pitch.bottom > pitch.vh + 8) {
    console.error(`${label}: kenttä ei mahdu ruudulle (${JSON.stringify(pitch)})`);
    process.exit(1);
  }

  // Vaaka-asennossa navigaatio on sivupalkkina kentän vasemmalla puolella
  if (size.width >= 1000) {
    const rail = await tp.evaluate(() => {
      const nav = document.getElementById('tabbar').getBoundingClientRect();
      const view = document.getElementById('view').getBoundingClientRect();
      return { navRight: Math.round(nav.right), viewLeft: Math.round(view.left), navHeight: Math.round(nav.height) };
    });
    if (rail.navRight > rail.viewLeft + 1 || rail.navHeight < 300) {
      console.error(`${label}: sivunavigaatio puuttuu (${JSON.stringify(rail)})`);
      process.exit(1);
    }
  }
  console.log(`${label}: kehys ${Math.round(appWidth)} px, ${columns} saraketta, kenttä ${pitch.h} px`);
  await ctx.close();
}

// --- Sormella piirtäminen kosketusnäytöllä ---
{
  const touchCtx = await browser.newContext({
    viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
  });
  const tp = await touchCtx.newPage();
  tp.on('pageerror', (e) => errors.push('touch pageerror: ' + e.message));
  await tp.goto('http://localhost:8777/index.html');
  await tp.evaluate(() => localStorage.setItem('pelikirja.v1', JSON.stringify({
    version: 1, team: { name: 'Kosketus', season: '2026', theme: 'light' }, players: [], matches: [],
    lineups: [{ id: 'tl', name: 'Taktiikka', lineup: {
      formation: '4-3-3', slots: Array(11).fill(null), bench: [], positions: {}, drawings: [] } }],
  })));
  // Hash-navigointi ei lataa sivua uudelleen, joten tila luetaan reloadilla.
  await tp.reload();
  await tp.waitForTimeout(400);
  await tp.evaluate(() => { location.hash = '#/kokoonpano/tl'; });
  await tp.waitForTimeout(400);
  await tp.locator('#view .segmented button', { hasText: 'Taktiikka' }).click();
  await tp.waitForTimeout(300);

  const start = await freeStartOn(tp, 2);
  const cdp = await touchCtx.newCDPSession(tp);
  const touch = (type, x, y) => cdp.send('Input.dispatchTouchEvent', {
    type,
    touchPoints: type === 'touchEnd' ? [] : [{ x, y, radiusX: 8, radiusY: 8, force: 1 }],
  });
  const x0 = start.x;
  const y0 = start.y;
  await touch('touchStart', x0, y0);
  for (let i = 1; i <= 8; i++) await touch('touchMove', x0 + i * 6, y0 - i * 9);
  await touch('touchEnd', x0 + 48, y0 - 72);
  await tp.waitForTimeout(300);

  // Kaksoisnapautus: toisen napautuksen oletustoiminto (zoomaus) estetään
  await tp.evaluate(() => {
    window.__tapDefaults = [];
    document.querySelector('#view .pitch')
      .addEventListener('touchend', (e) => window.__tapDefaults.push(e.defaultPrevented));
  });
  const tapAt = async (x, y) => {
    await touch('touchStart', x, y);
    await touch('touchEnd', x, y);
  };
  await tapAt(start.x, start.y);
  await tp.waitForTimeout(120);
  await tapAt(start.x, start.y);
  await tp.waitForTimeout(200);
  const defaults = await tp.evaluate(() => window.__tapDefaults);
  if (defaults.length < 2 || defaults[0] !== false || defaults[1] !== true) {
    console.error('Kaksoisnapautusta ei estetty piirtoalustalla: ' + JSON.stringify(defaults));
    process.exit(1);
  }
  console.log('kaksoisnapautus estetty piirtoalustalla (1. napautus sallittu, 2. estetty)');

  const touchStrokes = await tp.evaluate(() =>
    JSON.parse(localStorage.getItem('pelikirja.v1')).lineups[0].lineup.drawings);
  if (touchStrokes.length !== 1 || touchStrokes[0].points.length < 3) {
    console.error('Sormella piirtäminen ei tallentunut: ' + JSON.stringify(touchStrokes));
    process.exit(1);
  }
  // Painike reagoi jo sormen osuessa ja näyttää painallustilan
  const undo = tp.locator('#view .btn', { hasText: 'Kumoa' });
  await undo.scrollIntoViewIfNeeded();
  await tp.waitForTimeout(200);
  const undoBox = await undo.boundingBox();
  const ux = undoBox.x + undoBox.width / 2;
  const uy = undoBox.y + undoBox.height / 2;
  await touch('touchStart', ux, uy);
  await tp.waitForTimeout(80);
  const pressedClass = await undo.evaluate((el) => el.className);
  await touch('touchEnd', ux, uy);
  await tp.waitForTimeout(300);
  const afterUndo = await tp.evaluate(() =>
    JSON.parse(localStorage.getItem('pelikirja.v1')).lineups[0].lineup.drawings.length);
  if (!pressedClass.includes('pressing')) {
    console.error('Painikkeen painallustila ei näkynyt: ' + pressedClass);
    process.exit(1);
  }
  if (afterUndo !== 0) {
    console.error('Kumoa ei reagoinut yhteen kosketukseen: vetoja ' + afterUndo);
    process.exit(1);
  }
  console.log('kosketus: painallustila näkyy heti ja toiminto tapahtuu sormen noustessa');

  const scrolled = await tp.evaluate(() => document.getElementById('view').scrollTop);
  if (scrolled !== 0) { console.error('Piirtäminen vieritti näkymää'); process.exit(1); }
  console.log('sormipiirto: ' + touchStrokes[0].points.length + ' pistettä, näkymä ei vierinyt');
  await touchCtx.close();
}

// --- Vanha tähtiarvosana muuttuu kouluasteikolle ---
{
  const ctx2 = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'fi-FI' });
  const op = await ctx2.newPage();
  op.on('pageerror', (e) => errors.push('migraatio: ' + e.message));
  await op.goto('http://localhost:8777/index.html');
  await op.evaluate(() => localStorage.setItem('pelikirja.v1', JSON.stringify({
    version: 1, team: { name: 'Vanha', season: '2026' }, players: [], staff: [], lineups: [],
    matches: [1, 2, 3, 4, 5].map((star, i) => ({
      id: 'v' + i, date: '2026-05-0' + (i + 1), time: '18:00', opponent: 'Vastus ' + i,
      home: true, venue: '', type: 'ottelu', videoUrl: '', notes: '',
      lineup: { formation: '4-3-3', slots: Array(11).fill(null), bench: [], positions: {}, drawings: [] },
      result: { gf: 1, ga: 0, events: [], rating: star, notes: '' },
    })),
  })));
  await op.reload();
  await op.waitForTimeout(400);
  // Uudelleenlataus vielä kerran: migraatio ei saa muuttaa arvoja toistamiseen.
  await op.reload();
  await op.waitForTimeout(400);
  const migrated = await op.evaluate(async () => {
    const store = await import('/js/store.js');
    return store.getState().matches.map((m) => m.result.rating);
  });
  if (migrated.join(',') !== '4,5.5,7,8.5,10') {
    console.error('Tähtiarvosanojen muunnos epäonnistui: ' + JSON.stringify(migrated));
    process.exit(1);
  }
  console.log('vanhat tähtiarvosanat kouluasteikolla:', migrated.join(' · '));
  await ctx2.close();
}

await browser.close();
server.close();
if (errors.length) { console.error('VIRHEET:\n' + errors.join('\n')); process.exit(1); }
console.log('OK – ei konsolivirheitä');
