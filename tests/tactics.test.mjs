// Taktiikkapiirrosten polkujen yksikkötestit. Käyttö: node tests/tactics.test.mjs
import assert from 'node:assert/strict';
import { strokePath, arrowHead, ARROW_SIZE, TOOLS, COLORS } from '../js/tactics.js';

let checks = 0;
const check = (name, fn) => { fn(); checks++; console.log('  ✓ ' + name); };

const endOf = (d) => d.match(/L ([\d.-]+) ([\d.-]+)$/).slice(1).map(Number);
const tipOf = (head) => head.split(' ')[0].split(',').map(Number);
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

check('katkaisematon veto päättyy piirrettyyn pisteeseen', () => {
  const points = [[50, 80], [50, 40]];
  const tip = tipOf(arrowHead(points));
  assert.ok(dist(endOf(strokePath(points)), tip) < 0.01);
});

check('nuolellinen veto katkaistaan kärjen tyveen', () => {
  const points = [[50, 80], [50, 40]];
  const gap = dist(endOf(strokePath(points, ARROW_SIZE - 0.5)), tipOf(arrowHead(points)));
  // Viiva päättyy kärjen sisään: ei ohi kärjen eikä irti siitä.
  assert.ok(gap > ARROW_SIZE * 0.6, `viiva jäi liian pitkäksi (${gap})`);
  assert.ok(gap < ARROW_SIZE, `viiva jäi liian lyhyeksi (${gap})`);
});

check('katkaisu toimii myös vinolla ja monipisteisellä vedolla', () => {
  const points = [[20, 80], [35, 65], [50, 50], [65, 30]];
  const gap = dist(endOf(strokePath(points, ARROW_SIZE - 0.5)), tipOf(arrowHead(points)));
  assert.ok(gap > ARROW_SIZE * 0.6 && gap < ARROW_SIZE, `katkaisu meni pieleen (${gap})`);
});

check('hyvin lyhyt veto ei katoa katkaisussa', () => {
  const points = [[50, 50], [50, 49]];
  const d = strokePath(points, ARROW_SIZE - 0.5);
  assert.ok(d.startsWith('M'), 'polku puuttuu');
  assert.ok(d.length > 5);
});

check('vain laukauksella on nuoli', () => {
  assert.equal(TOOLS.pass.arrow, false);
  assert.equal(TOOLS.dribble.arrow, false);
  assert.equal(TOOLS.shot.arrow, true);
  assert.ok(TOOLS.shot.width > TOOLS.pass.width, 'laukaus on paksumpi');
  assert.equal(TOOLS.dribble.dash !== null, true, 'kuljetus on katkoviiva');
});

check('jokaisella värillä on oma reunusvärinsä', () => {
  for (const [id, c] of Object.entries(COLORS)) {
    assert.ok(c.value && c.halo, `värille ${id} puuttuu arvo tai reunus`);
  }
});

check('nuolen suunta seuraa vedon loppua', () => {
  const up = tipOf(arrowHead([[50, 80], [50, 40]]));
  const right = tipOf(arrowHead([[20, 50], [70, 50]]));
  assert.ok(up[1] < 40, 'ylös piirretyn nuolen kärki on ylhäällä');
  assert.ok(right[0] > 40, 'oikealle piirretyn nuolen kärki on oikealla');
});

console.log(`OK – taktiikkapiirrokset (${checks} tarkistusta)`);
