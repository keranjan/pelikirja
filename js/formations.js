// Pelipaikat ja pelisysteemit.
// Koordinaatit: x = 0 (vasen) ... 100 (oikea), y = 0 (vastustajan maali) ... 100 (oma maali).

export const POSITIONS = {
  MV:  'Maalivahti',
  OLP: 'Oikea laitapuolustaja',
  VLP: 'Vasen laitapuolustaja',
  KP:  'Keskuspuolustaja',
  AKK: 'Alempi keskikenttä',
  KK:  'Keskikenttä',
  OKK: 'Oikea keskikenttä',
  VKK: 'Vasen keskikenttä',
  YKK: 'Ylempi keskikenttä',
  OLH: 'Oikea laitahyökkääjä',
  VLH: 'Vasen laitahyökkääjä',
  KH:  'Kärkihyökkääjä',
};

// Pelaajakortissa valittavat roolit (karkeampi jaottelu).
export const ROLES = ['MV', 'LP', 'KP', 'AKK', 'KK', 'YKK', 'LH', 'KH'];
export const ROLE_NAMES = {
  MV: 'Maalivahti', LP: 'Laitapuolustaja', KP: 'Keskuspuolustaja',
  AKK: 'Al. keskikenttä', KK: 'Keskikenttä', YKK: 'Yl. keskikenttä',
  LH: 'Laitahyökkääjä', KH: 'Kärki',
};

const s = (pos, x, y) => ({ pos, x, y });

export const FORMATIONS = [
  // 11 vs 11
  { id: '4-4-2', name: '4-4-2', size: 11, slots: [
    s('MV',50,89), s('VLP',13,74), s('KP',36,78), s('KP',64,78), s('OLP',87,74),
    s('VKK',13,50), s('KK',36,52), s('KK',64,52), s('OKK',87,50), s('KH',37,22), s('KH',63,22) ]},
  { id: '4-3-3', name: '4-3-3', size: 11, slots: [
    s('MV',50,89), s('VLP',13,74), s('KP',36,78), s('KP',64,78), s('OLP',87,74),
    s('AKK',50,60), s('KK',27,48), s('KK',73,48), s('VLH',15,24), s('KH',50,16), s('OLH',85,24) ]},
  { id: '4-2-3-1', name: '4-2-3-1', size: 11, slots: [
    s('MV',50,89), s('VLP',13,74), s('KP',36,78), s('KP',64,78), s('OLP',87,74),
    s('AKK',34,60), s('AKK',66,60), s('VLH',14,38), s('YKK',50,36), s('OLH',86,38), s('KH',50,16) ]},
  { id: '4-5-1', name: '4-5-1', size: 11, slots: [
    s('MV',50,89), s('VLP',13,74), s('KP',36,78), s('KP',64,78), s('OLP',87,74),
    s('VKK',11,50), s('KK',32,54), s('AKK',50,62), s('KK',68,54), s('OKK',89,50), s('KH',50,20) ]},
  { id: '3-5-2', name: '3-5-2', size: 11, slots: [
    s('MV',50,89), s('KP',27,78), s('KP',50,80), s('KP',73,78),
    s('VKK',11,52), s('KK',33,54), s('AKK',50,62), s('KK',67,54), s('OKK',89,52), s('KH',38,20), s('KH',62,20) ]},
  { id: '3-4-3', name: '3-4-3', size: 11, slots: [
    s('MV',50,89), s('KP',27,78), s('KP',50,80), s('KP',73,78),
    s('VKK',13,52), s('KK',38,54), s('KK',62,54), s('OKK',87,52),
    s('VLH',17,24), s('KH',50,18), s('OLH',83,24) ]},
  { id: '5-3-2', name: '5-3-2', size: 11, slots: [
    s('MV',50,89), s('VLP',10,68), s('KP',30,80), s('KP',50,82), s('KP',70,80), s('OLP',90,68),
    s('KK',28,50), s('AKK',50,58), s('KK',72,50), s('KH',38,20), s('KH',62,20) ]},

  // 9 vs 9
  { id: '9-3-3-2', name: '3-3-2', size: 9, slots: [
    s('MV',50,89), s('KP',22,76), s('KP',50,78), s('KP',78,76),
    s('VKK',20,50), s('KK',50,52), s('OKK',80,50), s('KH',36,22), s('KH',64,22) ]},
  { id: '9-3-2-3', name: '3-2-3', size: 9, slots: [
    s('MV',50,89), s('KP',22,76), s('KP',50,78), s('KP',78,76),
    s('KK',33,54), s('KK',67,54), s('VLH',18,24), s('KH',50,18), s('OLH',82,24) ]},
  { id: '9-2-3-3', name: '2-3-3', size: 9, slots: [
    s('MV',50,89), s('KP',33,78), s('KP',67,78),
    s('VKK',18,52), s('KK',50,54), s('OKK',82,52), s('VLH',18,24), s('KH',50,18), s('OLH',82,24) ]},

  // 8 vs 8
  { id: '8-2-3-2', name: '2-3-2', size: 8, slots: [
    s('MV',50,91), s('KP',30,76), s('KP',70,76),
    s('VKK',17,50), s('KK',50,52), s('OKK',83,50), s('KH',35,21), s('KH',65,21) ]},
  { id: '8-2-4-1', name: '2-4-1', size: 8, slots: [
    s('MV',50,91), s('KP',30,76), s('KP',70,76),
    s('VKK',13,52), s('KK',38,54), s('KK',62,54), s('OKK',87,52), s('KH',50,20) ]},
  { id: '8-3-2-2', name: '3-2-2', size: 8, slots: [
    s('MV',50,91), s('KP',22,76), s('KP',50,78), s('KP',78,76),
    s('KK',33,50), s('KK',67,50), s('KH',35,21), s('KH',65,21) ]},
  { id: '8-3-3-1', name: '3-3-1', size: 8, slots: [
    s('MV',50,91), s('KP',22,76), s('KP',50,78), s('KP',78,76),
    s('VKK',18,50), s('KK',50,52), s('OKK',82,50), s('KH',50,20) ]},
  { id: '8-2-2-3', name: '2-2-3', size: 8, slots: [
    s('MV',50,91), s('KP',30,77), s('KP',70,77), s('KK',33,54), s('KK',67,54),
    s('VLH',17,24), s('KH',50,18), s('OLH',83,24) ]},
  { id: '8-3-1-3', name: '3-1-3', size: 8, slots: [
    s('MV',50,91), s('KP',22,76), s('KP',50,78), s('KP',78,76), s('AKK',50,55),
    s('VLH',18,26), s('KH',50,19), s('OLH',82,26) ]},

  // 7 vs 7
  { id: '7-2-3-1', name: '2-3-1', size: 7, slots: [
    s('MV',50,88), s('KP',30,74), s('KP',70,74),
    s('VKK',18,48), s('KK',50,50), s('OKK',82,48), s('KH',50,20) ]},
  { id: '7-3-2-1', name: '3-2-1', size: 7, slots: [
    s('MV',50,88), s('KP',22,74), s('KP',50,77), s('KP',78,74),
    s('KK',32,48), s('KK',68,48), s('KH',50,20) ]},
  { id: '7-2-1-2-1', name: '2-1-2-1', size: 7, slots: [
    s('MV',50,88), s('KP',30,76), s('KP',70,76), s('AKK',50,58),
    s('VKK',22,40), s('OKK',78,40), s('KH',50,18) ]},

  // 5 vs 5
  { id: '5-1-2-1', name: '1-2-1', size: 5, slots: [
    s('MV',50,87), s('KP',50,70), s('VKK',22,46), s('OKK',78,46), s('KH',50,22) ]},
  { id: '5-2-1-1', name: '2-1-1', size: 5, slots: [
    s('MV',50,87), s('KP',30,72), s('KP',70,72), s('KK',50,46), s('KH',50,22) ]},
  { id: '5-1-1-2', name: '1-1-2', size: 5, slots: [
    s('MV',50,87), s('KP',50,72), s('KK',50,48), s('KH',32,22), s('KH',68,22) ]},
];

export const getFormation = (id) => FORMATIONS.find(f => f.id === id) || FORMATIONS[0];

export const formationsBySize = () => {
  const map = new Map();
  for (const f of FORMATIONS) {
    if (!map.has(f.size)) map.set(f.size, []);
    map.get(f.size).push(f);
  }
  return [...map.entries()].sort((a, b) => b[0] - a[0]);
};

// Roolisuositus: mikä pelaajan rooli sopii kenttäpaikkaan.
const POS_TO_ROLE = {
  MV: 'MV', OLP: 'LP', VLP: 'LP', KP: 'KP', AKK: 'AKK',
  KK: 'KK', OKK: 'KK', VKK: 'KK', YKK: 'YKK', OLH: 'LH', VLH: 'LH', KH: 'KH',
};
export const roleForPosition = (pos) => POS_TO_ROLE[pos] || 'KK';
