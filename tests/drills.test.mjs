// Alkulämmittelyn logiikan yksikkötestit: elementit, kuviot ja osumien haku.
import {
  AREAS, getArea, emptyDrill, addItem, addStroke, undoLast, clearDrill, removeElement,
  boxOf, trianglePoints, penPath, hitElement, PLAYER_COLORS, SHAPES,
} from '../js/drills.js';

let checks = 0;
const fail = (msg) => { console.error('  ✗ ' + msg); process.exitCode = 1; };
const ok = (name) => { checks++; console.log('  ✓ ' + name); };
const eq = (got, want, name) => {
  if (JSON.stringify(got) !== JSON.stringify(want)) fail(`${name}: sai ${JSON.stringify(got)}, odotettiin ${JSON.stringify(want)}`);
  else ok(name);
};

const drill = (area = 'kolmannes') => ({ ...emptyDrill('d1', 'Testi'), area });

// --- Alueet ---
eq(Object.keys(AREAS), ['kolmannes', 'puolikas', 'kokonainen'], 'kolme kenttäaluetta');
eq(getArea('roska').id, 'kolmannes', 'tuntematon alue putoaa oletukseen');
eq([getArea('kolmannes').h, getArea('puolikas').h, getArea('kokonainen').h], [32, 47.5, 95],
  'alueiden korkeus kasvaa kolmanneksesta koko kenttään');

// --- Pelaajat numeroituvat väreittäin ---
{
  const d = drill();
  Object.keys(PLAYER_COLORS).forEach((color, i) => {
    addItem(d, { id: 'a' + i, kind: 'pelaaja', color, x: 10 + i, y: 10 });
    addItem(d, { id: 'b' + i, kind: 'pelaaja', color, x: 20 + i, y: 20 });
  });
  eq(d.elements.map((e) => e.color + e.label),
    ['vihrea1', 'vihrea2', 'sininen1', 'sininen2', 'oranssi1', 'oranssi2'],
    'pelaajat numeroidaan väreittäin');
}

// --- Muut merkit ja rajaus kentän sisään ---
{
  const d = drill();
  addItem(d, { id: 'p', kind: 'pallo', x: 140, y: -20 });
  eq([d.elements[0].x, d.elements[0].y], [100, 0], 'sijainti rajataan alueen sisään');
  addItem(d, { id: 't', kind: 'totsa', x: 50, y: 50 });
  addItem(d, { id: 'm', kind: 'maali', x: 50, y: 95 });
  eq(d.elements.map((e) => e.kind), ['pallo', 'totsa', 'maali'], 'pallo, tötsä ja maali lisätään');
}

// --- Vedot: kynä säilyttää pisteet, kuviot vain päät ---
{
  const d = drill();
  addStroke(d, { id: 's1', shape: 'kyna', color: 'punainen', points: [[10, 10], [20, 20], [30, 40]] });
  addStroke(d, { id: 's2', shape: 'nelio', color: 'musta', points: [[10, 10], [20, 20], [40, 60]] });
  eq(d.elements[0].points.length, 3, 'kynä säilyttää kaikki pisteet');
  eq(d.elements[1].points, [[10, 10], [40, 60]], 'kuvio tallentaa vain alku- ja loppupisteen');
  eq(addStroke(d, { id: 's3', shape: 'kyna', points: [[5, 5]] }), null, 'yhden pisteen veto ei tallennu');
}

// --- Kuvioiden geometria ---
eq(boxOf([[60, 80], [20, 30]]), { x: 20, y: 30, w: 40, h: 50 }, 'laatikko toimii kumpaan suuntaan tahansa');
eq(trianglePoints([[20, 30], [60, 80]]), [[40, 30], [60, 80], [20, 80]], 'kolmion kärki on ylhäällä keskellä');
eq(penPath([[0, 0], [50, 50]], 'kolmannes'), 'M0.00 0.00 L34.00 16.00', 'kynän polku alueen mittayksiköissä');

// --- Kumoa, poisto ja tyhjennys ---
{
  const d = drill();
  addItem(d, { id: 'a', kind: 'pallo', x: 10, y: 10 });
  addStroke(d, { id: 'b', shape: 'ympyra', points: [[10, 10], [40, 40]] });
  addItem(d, { id: 'c', kind: 'totsa', x: 60, y: 60 });
  undoLast(d);
  eq(d.elements.map((e) => e.id), ['a', 'b'], 'kumoa poistaa viimeksi lisätyn');
  removeElement(d, 'a');
  eq(d.elements.map((e) => e.id), ['b'], 'yksittäinen elementti poistuu tunnisteella');
  clearDrill(d);
  eq(d.elements.length, 0, 'tyhjennys poistaa kaiken');
}

// --- Osumien haku ---
{
  const d = drill();
  addItem(d, { id: 'a', kind: 'pelaaja', color: 'vihrea', x: 50, y: 50 });
  addStroke(d, { id: 'b', shape: 'nelio', color: 'musta', points: [[10, 10], [40, 40]] });
  eq(hitElement(d, 50, 50)?.id, 'a', 'merkki löytyy omalta paikaltaan');
  eq(hitElement(d, 90, 90), null, 'tyhjästä kohdasta ei löydy mitään');
  eq(hitElement(d, 10, 25)?.id, 'b', 'kuvion reunaviivalta löytyy veto');
  eq(hitElement(d, 25, 25), null, 'kuvion sisältä ei osu, koska kuvio on ääriviiva');
  eq(hitElement(d, 40, 40)?.id, 'b', 'kuvion nurkasta löytyy veto');

  // Päällekkäisistä valitaan viimeksi lisätty.
  addItem(d, { id: 'c', kind: 'pallo', x: 50, y: 50 });
  eq(hitElement(d, 50, 50)?.id, 'c', 'päällimmäinen elementti voittaa');
}

// --- Kynän vapaa veto löytyy myös keskeltä janaa ---
{
  const d = drill('kokonainen');
  addStroke(d, { id: 's', shape: 'kyna', points: [[10, 10], [10, 60]] });
  eq(hitElement(d, 10, 35)?.id, 's', 'vapaa veto löytyy janan keskeltä');
  eq(hitElement(d, 40, 35), null, 'kaukaa vedosta ei löydy');
}

// Ympyrä on ääriviiva: keskeltä ei osu, kehältä osuu.
{
  const d = drill('kokonainen');
  addStroke(d, { id: 'o', shape: 'ympyra', points: [[20, 20], [60, 60]] });
  eq(hitElement(d, 40, 40), null, 'ympyrän keskeltä ei osu');
  eq(hitElement(d, 60, 40)?.id, 'o', 'ympyrän kehältä osuu');
}

// Kolmion sivulta osuu, sisältä ei.
{
  const d = drill('kokonainen');
  addStroke(d, { id: 'k', shape: 'kolmio', points: [[20, 20], [60, 60]] });
  eq(hitElement(d, 20, 60)?.id, 'k', 'kolmion kannan kulmasta osuu');
  eq(hitElement(d, 40, 45), null, 'kolmion sisältä ei osu');
}

eq(Object.keys(SHAPES), ['kyna', 'nelio', 'ympyra', 'kolmio'], 'neljä piirtotyökalua');

if (!process.exitCode) console.log(`OK – alkulämmittely (${checks} tarkistusta)`);
