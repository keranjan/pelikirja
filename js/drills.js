// Alkulämmittelyn suunnittelu: kenttäalueet, harjoituksen elementit ja
// kuvioiden geometria. Kaikki tässä on puhdasta laskentaa, jotta sen voi
// testata ilman selainta.
//
// Elementit ovat yhdessä listassa lisäysjärjestyksessä, jolloin "Kumoa"
// poistaa aina viimeksi lisätyn riippumatta siitä oliko se merkki vai veto.
// Sijainnit ovat prosentteja alueen leveydestä ja korkeudesta (0–100), joten
// ne säilyvät suhteessa, vaikka alueen kokoa vaihtaisi.

/** Kenttäalueet piirretään kentän mittakaavassa (leveys 68 m). */
export const AREAS = {
  kolmannes: { id: 'kolmannes', name: 'Kolmannes', w: 68, h: 32 },
  puolikas: { id: 'puolikas', name: 'Puoli kenttää', w: 68, h: 47.5 },
  kokonainen: { id: 'kokonainen', name: 'Koko kenttä', w: 68, h: 95 },
};
export const DEFAULT_AREA = 'kolmannes';
export const getArea = (id) => AREAS[id] || AREAS[DEFAULT_AREA];

/** Pelaajamerkkien värit: kolme eri joukkuetta tai ryhmää. */
export const PLAYER_COLORS = {
  vihrea: { id: 'vihrea', name: 'Vihreät', fill: '#0B7A45', ink: '#FFFFFF' },
  sininen: { id: 'sininen', name: 'Siniset', fill: '#1D5FD0', ink: '#FFFFFF' },
  oranssi: { id: 'oranssi', name: 'Oranssit', fill: '#D2620A', ink: '#FFFFFF' },
};
export const playerColor = (id) => PLAYER_COLORS[id] || PLAYER_COLORS.vihrea;

/** Kentälle lisättävät merkit. */
export const ITEMS = {
  pelaaja: { id: 'pelaaja', name: 'Pelaaja' },
  pallo: { id: 'pallo', name: 'Pallo' },
  totsa: { id: 'totsa', name: 'Tötsä' },
  maali: { id: 'maali', name: 'Maali' },
};

/** Piirtotyökalut: vapaa kynä ja kolme kuviota. */
export const SHAPES = {
  kyna: { id: 'kyna', name: 'Kynä', free: true },
  nelio: { id: 'nelio', name: 'Neliö', free: false },
  ympyra: { id: 'ympyra', name: 'Ympyrä', free: false },
  kolmio: { id: 'kolmio', name: 'Kolmio', free: false },
};

/** Piirrosten värit. */
// Jokaisella värillä on kevyt reunus, jotta veto erottuu nurmelta.
export const DRAW_COLORS = {
  musta: { id: 'musta', name: 'Musta', value: '#14261C', halo: 'rgba(255,255,255,.85)' },
  valkoinen: { id: 'valkoinen', name: 'Valkoinen', value: '#FFFFFF', halo: 'rgba(10,30,20,.45)' },
  punainen: { id: 'punainen', name: 'Punainen', value: '#C7412F', halo: 'rgba(255,255,255,.85)' },
  keltainen: { id: 'keltainen', name: 'Keltainen', value: '#E7B008', halo: 'rgba(20,38,28,.6)' },
};
export const STROKE_WIDTH = 0.85;
export const HALO_WIDTH = 1.9;
export const drawColor = (id) => DRAW_COLORS[id] || DRAW_COLORS.musta;

export const emptyDrill = (id, name = '') => ({
  id,
  name,
  area: DEFAULT_AREA,
  elements: [],
  notes: '',
  createdAt: new Date().toISOString(),
});

/* ---------- Elementtien lisäys ---------- */

const clamp = (v) => Math.min(100, Math.max(0, v));

/** Lisää merkin. Pelaajat numeroidaan väreittäin juoksevasti. */
export function addItem(drill, { kind, color = 'vihrea', x, y, id }) {
  const el = { id, kind, x: clamp(x), y: clamp(y) };
  if (kind === 'pelaaja') {
    el.color = color;
    el.label = String(drill.elements.filter(
      (e) => e.kind === 'pelaaja' && e.color === color).length + 1);
  }
  drill.elements.push(el);
  return el;
}

/** Lisää piirroksen. Kuvioille riittää alku- ja loppupiste. */
export function addStroke(drill, { shape, color = 'musta', points, id }) {
  const pts = (points || []).map(([x, y]) => [clamp(x), clamp(y)]);
  if (pts.length < 2) return null;
  const el = {
    id, kind: 'stroke', shape, color,
    points: SHAPES[shape]?.free ? pts : [pts[0], pts[pts.length - 1]],
  };
  drill.elements.push(el);
  return el;
}

export const undoLast = (drill) => { drill.elements.pop(); };
export const clearDrill = (drill) => { drill.elements = []; };
export const removeElement = (drill, id) => {
  drill.elements = drill.elements.filter((e) => e.id !== id);
};

/* ---------- Kuvioiden geometria ---------- */

/** Suorakulmio kahden pisteen väliin: { x, y, w, h } prosentteina. */
export function boxOf([a, b]) {
  const x = Math.min(a[0], b[0]);
  const y = Math.min(a[1], b[1]);
  return { x, y, w: Math.abs(b[0] - a[0]), h: Math.abs(b[1] - a[1]) };
}

/** Kolmion kärkipisteet: kärki ylhäällä keskellä, kanta alhaalla. */
export function trianglePoints([a, b]) {
  const box = boxOf([a, b]);
  return [
    [box.x + box.w / 2, box.y],
    [box.x + box.w, box.y + box.h],
    [box.x, box.y + box.h],
  ];
}

/** Vapaan vedon polku SVG:lle alueen mittayksiköissä. */
export function penPath(points, area) {
  const a = getArea(area?.id ? area.id : area);
  const sx = (v) => (v / 100) * a.w;
  const sy = (v) => (v / 100) * a.h;
  return points.map(([x, y], i) => `${i ? 'L' : 'M'}${sx(x).toFixed(2)} ${sy(y).toFixed(2)}`).join(' ');
}

/* ---------- Osuman haku ---------- */

/** Etäisyys pisteestä janalle alueen mittayksiköissä. */
function distanceToSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const len = dx * dx + dy * dy;
  const t = len ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len)) : 0;
  const cx = ax + t * dx;
  const cy = ay + t * dy;
  return Math.hypot(px - cx, py - cy);
}

/**
 * Etsii ylimmän elementin annetusta kohdasta. Etäisyys lasketaan kentän
 * metreissä, jotta osuma toimii samoin leveällä ja kapealla alueella.
 * @returns {object|null}
 */
export function hitElement(drill, x, y, { radius = 3.2 } = {}) {
  const a = getArea(drill.area);
  const toX = (v) => (v / 100) * a.w;
  const toY = (v) => (v / 100) * a.h;
  const px = toX(x);
  const py = toY(y);

  for (let i = drill.elements.length - 1; i >= 0; i--) {
    const el = drill.elements[i];
    if (el.kind !== 'stroke') {
      if (Math.hypot(px - toX(el.x), py - toY(el.y)) <= radius) return el;
      continue;
    }
    // Kuviot ovat ääriviivoja: osuma haetaan reunalta, ei sisältä.
    if (el.shape === 'ympyra') {
      const box = boxOf(el.points);
      const cx = toX(box.x + box.w / 2);
      const cy = toY(box.y + box.h / 2);
      const rx = Math.max(0.1, toX(box.w) / 2);
      const ry = Math.max(0.1, toY(box.h) / 2);
      const ang = Math.atan2((py - cy) / ry, (px - cx) / rx);
      const edge = Math.hypot(px - (cx + rx * Math.cos(ang)), py - (cy + ry * Math.sin(ang)));
      if (edge <= radius) return el;
      continue;
    }

    let ring;
    if (el.shape === 'kolmio') ring = [...trianglePoints(el.points), trianglePoints(el.points)[0]];
    else if (el.shape === 'nelio') {
      const box = boxOf(el.points);
      ring = [
        [box.x, box.y], [box.x + box.w, box.y],
        [box.x + box.w, box.y + box.h], [box.x, box.y + box.h], [box.x, box.y],
      ];
    } else ring = el.points;                    // vapaa veto

    for (let j = 0; j < ring.length - 1; j++) {
      const d = distanceToSegment(px, py,
        toX(ring[j][0]), toY(ring[j][1]), toX(ring[j + 1][0]), toY(ring[j + 1][1]));
      if (d <= radius) return el;
    }
  }
  return null;
}
