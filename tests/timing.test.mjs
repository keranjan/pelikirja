// Peliajan laskennan yksikkötestit. Käyttö: node tests/timing.test.mjs
import assert from 'node:assert/strict';
import {
  emptyTiming, clockSeconds, playingTimes, onField, substitutions, periodOf, fmtClock,
} from '../js/timing.js';

let checks = 0;
const check = (name, fn) => { fn(); checks++; console.log('  ✓ ' + name); };

const ev = (at, type, playerId, id = `${type}-${playerId}-${at}`) => ({ id, at, type, playerId });

const paused = (events, elapsed) => ({ ...emptyTiming(), status: 'paused', elapsed, events });

check('avauskokoonpano kerryttää peliaikaa kellon mukaan', () => {
  const t = paused([ev(0, 'in', 'a'), ev(0, 'in', 'b')], 1800);
  const times = playingTimes(t);
  assert.equal(times.get('a'), 1800);
  assert.equal(times.get('b'), 1800);
});

check('vaihto jakaa peliajan oikein', () => {
  const t = paused([ev(0, 'in', 'a'), ev(600, 'out', 'a'), ev(600, 'in', 'b')], 1800);
  assert.equal(playingTimes(t).get('a'), 600);
  assert.equal(playingTimes(t).get('b'), 1200);
});

check('sama pelaaja voi käydä kentällä useasti', () => {
  const t = paused([
    ev(0, 'in', 'a'), ev(300, 'out', 'a'), ev(900, 'in', 'a'), ev(1200, 'out', 'a'),
  ], 1800);
  assert.equal(playingTimes(t).get('a'), 300 + 300);
});

check('kentällä olevat päivittyvät vaihtojen mukaan', () => {
  const t = paused([ev(0, 'in', 'a'), ev(0, 'in', 'b'), ev(600, 'out', 'a'), ev(600, 'in', 'c')], 1800);
  assert.deepEqual([...onField(t)].sort(), ['b', 'c']);
});

check('pysäytetty kello ei kerrytä aikaa', () => {
  const t = paused([ev(0, 'in', 'a')], 900);
  const first = clockSeconds(t);
  assert.equal(first, 900);
  assert.equal(clockSeconds(t, Date.now() + 60000), 900);
});

check('käyvä kello etenee seinäkellon mukaan', () => {
  const started = Date.now() - 65000;
  const t = { ...emptyTiming(), status: 'running', startedAt: started, elapsed: 100, events: [] };
  assert.equal(clockSeconds(t, started + 65000), 165);
});

check('vaihdot pariutuvat esitystä varten', () => {
  const t = paused([
    ev(0, 'in', 'a'), ev(600, 'out', 'a'), ev(600, 'in', 'b'), ev(1200, 'in', 'c'),
  ], 1800);
  const subs = substitutions(t);
  assert.equal(subs.length, 2);
  assert.deepEqual({ at: subs[0].at, outId: subs[0].outId, inId: subs[0].inId }, { at: 600, outId: 'a', inId: 'b' });
  assert.deepEqual({ at: subs[1].at, outId: subs[1].outId, inId: subs[1].inId }, { at: 1200, outId: null, inId: 'c' });
});

check('menneisyyden hetkellä laskettu peliaika ei katso tulevia tapahtumia', () => {
  const t = paused([ev(0, 'in', 'a'), ev(600, 'out', 'a')], 1800);
  assert.equal(playingTimes(t, 300).get('a'), 300);
});

check('jaksot lasketaan jakson pituudesta', () => {
  const t = { ...emptyTiming(2, 25) };
  assert.equal(periodOf(0, t), 1);
  assert.equal(periodOf(1499, t), 1);
  assert.equal(periodOf(1500, t), 2);
  assert.equal(periodOf(9999, t), 2);
});

check('kello muotoillaan mm:ss', () => {
  assert.equal(fmtClock(0), '00:00');
  assert.equal(fmtClock(65), '01:05');
  assert.equal(fmtClock(3725), '62:05');
});

console.log(`OK – peliajan laskenta (${checks} tarkistusta)`);
