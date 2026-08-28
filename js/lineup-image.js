// Piirtää kokoonpanosta jaettavan kuvan: kenttä, pelaajat paikoillaan,
// vaihtopenkki ja valmennus. Käytetään canvasia, jotta kuvan voi jakaa
// suoraan esimerkiksi WhatsAppiin ilman kirjastoja.
import { getFormation } from './formations.js';
import { playerById, staffById, STAFF_ROLES, getState } from './store.js';
import { shortName, initials, fmtDate } from './ui.js';

// Kiinteä vaalea väripaletti: kuva näyttää samalta myös tummassa teemassa.
const C = {
  paper: '#F4F7F4',
  ink: '#0F1A14',
  ink2: '#47564D',
  ink3: '#78887E',
  line: '#DBE4DC',
  accent: '#0B7A45',
  amber: '#9C5B06',
  pitchA: '#CDE7D4',
  pitchB: '#B4DABF',
  pitchLine: 'rgba(255,255,255,.92)',
  chip: 'rgba(255,255,255,.94)',
  chipInk: '#14261C',
  white: '#FFFFFF',
};

const font = (weight, size, family = 'Instrument Sans') =>
  `${weight} ${size}px ${family}, system-ui, -apple-system, sans-serif`;

/** Katkaisee tekstin annettuun leveyteen ja lisää tarvittaessa kolme pistettä. */
function fit(ctx, text, maxWidth) {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let cut = text;
  while (cut.length > 1 && ctx.measureText(cut + '…').width > maxWidth) cut = cut.slice(0, -1);
  return cut + '…';
}

/** Rivittää tekstin ja palauttaa piirretyn korkeuden. */
function wrap(ctx, text, x, y, maxWidth, lineHeight) {
  const words = text.split(/\s+/);
  let line = '';
  let lines = 0;
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width > maxWidth && line) {
      ctx.fillText(line, x, y + lines * lineHeight);
      lines++;
      line = word;
    } else {
      line = next;
    }
  }
  if (line) { ctx.fillText(line, x, y + lines * lineHeight); lines++; }
  return lines * lineHeight;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Kentän viivat samoilla mitoilla kuin sovelluksen kenttäkuvassa (68 x 95). */
function drawPitch(ctx, x, y, w, h) {
  const grad = ctx.createLinearGradient(x, y, x + w, y + h);
  grad.addColorStop(0, C.pitchA);
  grad.addColorStop(1, C.pitchB);
  roundRect(ctx, x, y, w, h, 18);
  ctx.fillStyle = grad;
  ctx.fill();

  // Vaaleat raidat kuten sovelluksessa
  ctx.save();
  ctx.clip();
  ctx.fillStyle = 'rgba(255,255,255,.06)';
  for (let i = 0; i < 12; i += 2) ctx.fillRect(x, y + (h / 12) * i, w, h / 12);
  ctx.restore();

  const sx = (v) => x + (v / 68) * w;
  const sy = (v) => y + (v / 95) * h;
  ctx.strokeStyle = C.pitchLine;
  ctx.lineWidth = Math.max(1.5, w * 0.006);
  const box = (bx, by, bw, bh) => ctx.strokeRect(sx(bx), sy(by), (bw / 68) * w, (bh / 95) * h);

  box(2, 2, 64, 91);
  ctx.beginPath();
  ctx.moveTo(sx(2), sy(47.5));
  ctx.lineTo(sx(66), sy(47.5));
  ctx.stroke();
  ctx.beginPath();
  ctx.ellipse(sx(34), sy(47.5), (9 / 68) * w, (9 / 95) * h, 0, 0, Math.PI * 2);
  ctx.stroke();
  box(14, 2, 40, 14);
  box(23, 2, 22, 6);
  box(14, 79, 40, 14);
  box(23, 87, 22, 6);
}

/** Pelaajamerkki: numero ympyrässä ja nimi sen alla. */
function drawToken(ctx, cx, cy, { number, name, pos, gk }, scale) {
  const r = 21 * scale;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = gk ? C.amber : C.accent;
  ctx.fill();
  ctx.lineWidth = 2.5 * scale;
  ctx.strokeStyle = 'rgba(255,255,255,.9)';
  ctx.stroke();

  ctx.fillStyle = C.white;
  ctx.font = font(800, 17 * scale, 'Archivo');
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(number), cx, cy + 1 * scale);

  // Nimilappu
  ctx.font = font(600, 12.5 * scale);
  const label = fit(ctx, name, 96 * scale);
  const tw = ctx.measureText(label).width;
  const pad = 6 * scale;
  const bh = 18 * scale;
  const by = cy + r + 5 * scale;
  roundRect(ctx, cx - tw / 2 - pad, by, tw + pad * 2, bh, 6 * scale);
  ctx.fillStyle = C.chip;
  ctx.fill();
  ctx.fillStyle = C.chipInk;
  ctx.textBaseline = 'middle';
  ctx.fillText(label, cx, by + bh / 2 + 0.5 * scale);

  // Pelipaikan lyhenne nimen alla
  ctx.font = font(700, 10 * scale);
  ctx.fillStyle = 'rgba(20,38,28,.75)';
  ctx.fillText(pos, cx, by + bh + 8 * scale);
}

/**
 * Piirtää kokoonpanokuvan ja palauttaa canvasin.
 * @param {object} m ottelu
 */
export function lineupCanvas(m) {
  const scale = 2;                       // terävä myös puhelimen näytöllä
  const W = 900;
  const pad = 36;
  const lineup = m.lineup;
  const formation = getFormation(lineup.formation);
  const team = m.team || getState().team.name || 'Oma joukkue';

  const bench = lineup.bench.map(playerById).filter(Boolean);
  const staff = (lineup.staff || []).map(staffById).filter(Boolean);

  const headerH = 156;
  const pitchW = W - pad * 2;
  const pitchH = Math.round((pitchW * 95) / 68);
  const footerRows = (bench.length ? 1 : 0) + (staff.length ? 1 : 0);
  const footerH = footerRows ? 24 + footerRows * 58 : 16;
  const H = headerH + pitchH + footerH + pad;

  const canvas = document.createElement('canvas');
  canvas.width = W * scale;
  canvas.height = H * scale;
  const ctx = canvas.getContext('2d');
  ctx.scale(scale, scale);

  ctx.fillStyle = C.paper;
  ctx.fillRect(0, 0, W, H);

  /* --- Otsikko --- */
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = C.accent;
  ctx.font = font(700, 14, 'Archivo');
  ctx.fillText('KOKOONPANO', pad, pad + 14);

  ctx.fillStyle = C.ink;
  ctx.font = font(800, 34, 'Archivo');
  ctx.fillText(fit(ctx, `${team} ${m.home ? 'vs' : '@'} ${m.opponent || 'vastustaja'}`, pitchW), pad, pad + 52);

  ctx.fillStyle = C.ink2;
  ctx.font = font(400, 17);
  const when = `${fmtDate(m.date)} klo ${m.time || '–'}${m.venue ? ' · ' + m.venue : ''}`;
  ctx.fillText(fit(ctx, when, pitchW), pad, pad + 78);

  ctx.fillStyle = C.ink3;
  ctx.font = font(600, 15);
  ctx.fillText(`${formation.name} · ${formation.slots.length} pelaajaa kentällä`, pad, pad + 100);

  /* --- Kenttä --- */
  const px = pad;
  const py = headerH;
  drawPitch(ctx, px, py, pitchW, pitchH);

  formation.slots.forEach((slot, i) => {
    const at = (lineup.positions || {})[i] || slot;
    const cx = px + (at.x / 100) * pitchW;
    const cy = py + (at.y / 100) * pitchH;
    const p = lineup.slots[i] ? playerById(lineup.slots[i]) : null;
    if (!p) {
      ctx.beginPath();
      ctx.arc(cx, cy, 21, 0, Math.PI * 2);
      ctx.setLineDash([5, 4]);
      ctx.lineWidth = 2;
      ctx.strokeStyle = 'rgba(255,255,255,.9)';
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = C.chipInk;
      ctx.font = font(600, 12);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(slot.pos, cx, cy);
      return;
    }
    drawToken(ctx, cx, cy, {
      number: p.number ?? initials(p.name),
      name: shortName(p.name),
      pos: slot.pos,
      gk: slot.pos === 'MV',
    }, 1);
  });

  /* --- Vaihtopenkki ja valmennus --- */
  let y = headerH + pitchH + 30;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  const row = (title, text) => {
    ctx.fillStyle = C.ink3;
    ctx.font = font(700, 12, 'Archivo');
    ctx.fillText(title.toUpperCase(), pad, y);
    ctx.fillStyle = C.ink;
    ctx.font = font(400, 16);
    y += 22;
    y += wrap(ctx, text, pad, y, pitchW, 22) + 14;
  };
  if (bench.length) {
    row(`Vaihtopenkki (${bench.length})`,
      bench.map((p) => `${p.number ?? ''} ${p.name}`.trim()).join(' · '));
  }
  if (staff.length) {
    row('Valmennus',
      staff.map((s) => `${s.name} (${(STAFF_ROLES[s.role] || 'toimihenkilö').toLowerCase()})`).join(' · '));
  }

  return canvas;
}

// JPEG pitää jaettavan kuvan kevyenä (satoja kilotavuja PNG:n megatavujen
// sijaan), mikä on tärkeää mobiiliverkossa jaettaessa.
const TYPE = 'image/jpeg';
const QUALITY = 0.92;

/** Kokoonpanokuva selaimen näytettäväksi (esikatselu). */
export const lineupDataUrl = (m) => lineupCanvas(m).toDataURL(TYPE, QUALITY);

/** Kokoonpanokuva tiedostona jakamista varten. */
export function lineupImageFile(m) {
  const canvas = lineupCanvas(m);
  const name = `kokoonpano-${(m.opponent || 'ottelu').replace(/[^\w\-]+/g, '-').toLowerCase()}-${m.date}.jpg`;
  return new Promise((resolve) => {
    canvas.toBlob((blob) => {
      resolve(blob ? new File([blob], name, { type: TYPE }) : null);
    }, TYPE, QUALITY);
  });
}
