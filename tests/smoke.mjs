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
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, locale: 'fi-FI' });
const page = await ctx.newPage();
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));

const shot = (n) => page.screenshot({ path: `${SHOT}/${n}.png` });
const tap = async (sel) => { await page.locator(sel).first().click(); await page.waitForTimeout(120); };
const tapText = async (t) => { await page.getByText(t, { exact: false }).first().click(); await page.waitForTimeout(120); };

await page.goto('http://localhost:8777/index.html');
await page.waitForTimeout(400);

// --- Pelaajat ---
await tap('#tabbar a[href="#/pelaajat"]');
const players = [
  ['Aku Ahonen', '1', 'MV'], ['Bertta Broman', '2', 'LP'], ['Cecil Cronberg', '4', 'KP'],
  ['Daniela Dahl', '5', 'KP'], ['Eemil Eskola', '3', 'LP'], ['Fanni Forsman', '6', 'DKK'],
  ['Gustav Grönroos', '8', 'KK'], ['Hilla Hakala', '10', 'HKK'], ['Iiro Ilves', '7', 'LH'],
  ['Jonna Järvi', '11', 'LH'], ['Kalle Koski', '9', 'KH'], ['Lumi Laine', '14', 'KK'],
  ['Mikael Mäki', '12', 'MV'],
];
for (const [name, num, role] of players) {
  await tap('#topbar .iconbtn[aria-label="Lisää pelaaja"], .empty .btn.primary');
  await page.locator('.sheet input[type=text]').fill(name);
  await page.locator('.sheet input[type=number]').fill(num);
  await page.locator('.sheet .chip', { hasText: new RegExp('^' + role + ' ') }).first().click();
  await page.locator('.sheet .btn.primary').click();
  await page.waitForTimeout(80);
}
await shot('01-pelaajat');

// --- Ottelu ---
await tap('#tabbar a[href="#/ottelut"]');
await tap('#topbar .iconbtn[aria-label="Lisää tapahtuma"], .empty .btn.primary');
await page.locator('.sheet input[type=text]').first().fill('FC Naapuri');
const d = new Date(Date.now() + 5 * 86400000).toISOString().slice(0, 10);
await page.locator('.sheet input[type=date]').fill(d);
await page.locator('.sheet input[type=time]').fill('14:30');
await page.locator('.sheet input[type=text]').nth(1).fill('Keskuskenttä 2');
await page.locator('.sheet .btn.primary').click();
await page.waitForTimeout(300);
await shot('02-ottelu-kokoonpano-tyhja');

// Systeemi + automaattitäyttö
await page.locator('#view select').first().selectOption('4-3-3');
await page.waitForTimeout(150);
await tapText('Täytä automaattisesti');
await page.waitForTimeout(200);
await shot('03-kokoonpano-taytetty');

// Vaihda pelaaja paikkaan käsin
await page.locator('.slot').nth(9).click();
await page.waitForTimeout(200);
await shot('04-pelaajavalinta');
await page.locator('.sheet .list-item').first().click();
await page.waitForTimeout(200);

// Ryhmä -> vaihtopenkki
await tapText('Hallitse ryhmää');
await page.waitForTimeout(200);
await page.locator('.sheet .card .segmented button', { hasText: 'Vaihtopenkki' }).first().click();
await page.waitForTimeout(150);
await page.locator('#overlay .iconbtn').first().click();
await page.waitForTimeout(200);
await shot('05-penkki');

// Tallenna pohjaksi
await tapText('Tallenna pohjaksi');
await page.locator('.sheet .btn.primary').click();
await page.waitForTimeout(200);

// --- Tulos ---
await page.locator('#view .segmented button', { hasText: 'Tulos' }).click();
await page.waitForTimeout(150);
await tapText('Kirjaa tulos');
await page.waitForTimeout(200);
await tapText('Lisää maali');
await page.waitForTimeout(200);
await page.locator('.sheet select').first().selectOption({ index: 3 });
await page.locator('.sheet input[type=number]').fill('23');
await page.locator('.sheet .btn.primary').click();
await page.waitForTimeout(200);
await page.locator('#view .card .iconbtn', { hasText: '＋' }).nth(1).click(); // vastustajan maali
await page.waitForTimeout(200);
await shot('06-tulos');

// --- Tilastot / kokoonpanot / asetukset ---
await tap('#tabbar a[href="#/tilastot"]');
await shot('07-tilastot');
await tap('#tabbar a[href="#/kokoonpanot"]');
await shot('08-kokoonpanot');
await tap('#tabbar a[href="#/asetukset"]');
await shot('09-asetukset');

// --- Ottelulista (pelatut) ---
await tap('#tabbar a[href="#/ottelut"]');
await page.locator('#view .segmented button', { hasText: 'Pelatut' }).click();
await page.waitForTimeout(200);
await shot('10-ottelut-pelatut');

// --- Uudelleenlataus: pysyykö data? ---
await page.reload();
await page.waitForTimeout(500);
const persisted = await page.evaluate(() => JSON.parse(localStorage.getItem('pelikirja.v1')));
console.log('pelaajia:', persisted.players.length, '| otteluita:', persisted.matches.length,
  '| pohjia:', persisted.lineups.length, '| tulos:', JSON.stringify(persisted.matches[0].result?.gf) + '-' + persisted.matches[0].result?.ga,
  '| kentällä:', persisted.matches[0].lineup.slots.filter(Boolean).length);

await browser.close();
server.close();
if (errors.length) { console.error('VIRHEET:\n' + errors.join('\n')); process.exit(1); }
console.log('OK – ei konsolivirheitä');
