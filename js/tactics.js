// Taktiikkapiirrosten työkalut, värit ja polkujen laskenta.
// Piste tallennetaan normalisoituna (0–100) kentän leveydestä ja korkeudesta,
// joten piirros skaalautuu minkä kokoiseen kenttäkuvaan tahansa.

export const PITCH_W = 68;
export const PITCH_H = 95;

export const TOOLS = {
  pass:    { name: 'Syöttö',   width: 0.85, dash: null,        arrow: false },
  dribble: { name: 'Kuljetus', width: 0.85, dash: '2.6 1.9',   arrow: false },
  shot:    { name: 'Laukaus',  width: 1.9,  dash: null,        arrow: true  },
};

export const COLORS = {
  black:  { name: 'Musta',     value: '#141A16', halo: 'rgba(255,255,255,.45)' },
  white:  { name: 'Valkoinen', value: '#FFFFFF', halo: 'rgba(0,0,0,.35)' },
  red:    { name: 'Punainen',  value: '#E03131', halo: 'rgba(255,255,255,.4)' },
  yellow: { name: 'Keltainen', value: '#FFD43B', halo: 'rgba(0,0,0,.35)' },
};

export const toolOf = (id) => TOOLS[id] || TOOLS.pass;
export const colorOf = (id) => COLORS[id] || COLORS.black;

const sx = (x) => (x / 100) * PITCH_W;
const sy = (y) => (y / 100) * PITCH_H;

/** Nuolenkärjen pituus kentän yksikköinä. */
export const ARROW_SIZE = 3.4;

const toSvg = (points) => (points || []).map(([x, y]) => [sx(x), sy(y)]);

/**
 * Lyhentää polkua lopusta annetun matkan verran. Nuolellisessa vedossa viiva
 * päättyy kärjen tyveen, jottei pyöreä viivanpää pilkistä kärjen ohi.
 */
function trimEnd(p, distance) {
  if (p.length < 2 || distance <= 0) return p;
  const out = [...p];
  let left = distance;

  while (out.length >= 2 && left > 0) {
    const last = out[out.length - 1];
    const prev = out[out.length - 2];
    const seg = Math.hypot(last[0] - prev[0], last[1] - prev[1]);
    if (seg > left) {
      const t = (seg - left) / seg;
      out[out.length - 1] = [prev[0] + (last[0] - prev[0]) * t, prev[1] + (last[1] - prev[1]) * t];
      left = 0;
    } else {
      out.pop();
      left -= seg;
    }
  }
  // Hyvin lyhyt veto: jätetään edes lyhyt tynkä, jottei viiva katoa kokonaan.
  return out.length >= 2 ? out : p.slice(0, 2);
}

/** Pehmennetty polku sormella piirretystä pistejonosta. */
export function strokePath(points, trim = 0) {
  if (!points || points.length === 0) return '';
  const p = trim > 0 ? trimEnd(toSvg(points), trim) : toSvg(points);
  if (p.length === 1) return `M ${p[0][0]} ${p[0][1]} l 0.01 0`;
  if (p.length === 2) return `M ${p[0][0]} ${p[0][1]} L ${p[1][0]} ${p[1][1]}`;

  let d = `M ${p[0][0]} ${p[0][1]}`;
  for (let i = 1; i < p.length - 1; i++) {
    const mx = (p[i][0] + p[i + 1][0]) / 2;
    const my = (p[i][1] + p[i + 1][1]) / 2;
    d += ` Q ${p[i][0]} ${p[i][1]} ${mx} ${my}`;
  }
  const last = p[p.length - 1];
  d += ` L ${last[0]} ${last[1]}`;
  return d;
}

/** Nuolenkärki viimeisen liikesuunnan mukaan; null jos suuntaa ei saada. */
export function arrowHead(points, size = ARROW_SIZE) {
  if (!points || points.length < 2) return null;
  const p = points.map(([x, y]) => [sx(x), sy(y)]);
  const tip = p[p.length - 1];

  // Etsi riittävän kaukaa edellinen piste, jotta suunta ei heittele.
  let prev = p[0];
  for (let i = p.length - 2; i >= 0; i--) {
    const dx = tip[0] - p[i][0], dy = tip[1] - p[i][1];
    if (Math.hypot(dx, dy) >= size * 0.7) { prev = p[i]; break; }
  }
  const dx = tip[0] - prev[0], dy = tip[1] - prev[1];
  const len = Math.hypot(dx, dy);
  if (len < 0.4) return null;

  const ux = dx / len, uy = dy / len;
  const bx = tip[0] - ux * size, by = tip[1] - uy * size;
  const w = size * 0.5;
  return [
    `${tip[0]},${tip[1]}`,
    `${bx - uy * w},${by + ux * w}`,
    `${bx + uy * w},${by - ux * w}`,
  ].join(' ');
}

/** Kentän mitat huomioiva pisteen normalisointi kosketuksen sijainnista. */
export function normalize(event, element) {
  const r = element.getBoundingClientRect();
  const x = ((event.clientX - r.left) / r.width) * 100;
  const y = ((event.clientY - r.top) / r.height) * 100;
  return [
    Math.round(Math.min(100, Math.max(0, x)) * 10) / 10,
    Math.round(Math.min(100, Math.max(0, y)) * 10) / 10,
  ];
}
