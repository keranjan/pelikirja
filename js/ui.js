// Pienet UI-apurit: elementtien luonti, alapaneelit, ilmoitukset, päivämäärät.

export function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'html') el.innerHTML = v;
    else if (k === 'text') el.textContent = v;
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k in el && k !== 'list' && typeof v !== 'object') el[k] = v;
    else el.setAttribute(k, v);
  }
  for (const c of children.flat(Infinity)) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c.nodeType ? c : document.createTextNode(String(c)));
  }
  return el;
}

export const $ = (sel, root = document) => root.querySelector(sel);

export const clear = (el) => { while (el.firstChild) el.removeChild(el.firstChild); return el; };

/* ---------- Ilmoitus ---------- */
let toastTimer = null;
export function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.textContent = ''; }, 2200);
}

/* ---------- Alapaneeli ---------- */
export function closeSheet() {
  clear(document.getElementById('overlay'));
}

export function sheet(title, buildBody, { onClose } = {}) {
  const overlay = clear(document.getElementById('overlay'));
  const body = h('div', { class: 'body' });
  const box = h('div', { class: 'sheet' },
    h('header', {},
      h('h2', { text: title }),
      h('button', { class: 'iconbtn', 'aria-label': 'Sulje', onclick: close }, '✕')),
    body);
  overlay.append(box);
  overlay.onclick = (e) => { if (e.target === overlay) close(); };

  function close() { closeSheet(); onClose?.(); }
  buildBody(body, close);
  return { close, body };
}

export function confirmSheet(title, message, confirmLabel = 'Poista') {
  return new Promise((resolve) => {
    let done = false;
    const { close } = sheet(title, (body, closeFn) => {
      body.append(
        h('p', { class: 'muted', text: message }),
        h('div', { class: 'btn-row' },
          h('button', { class: 'btn ghost', onclick: () => { done = true; closeFn(); resolve(false); } }, 'Peruuta'),
          h('button', { class: 'btn danger', onclick: () => { done = true; closeFn(); resolve(true); } }, confirmLabel)));
    }, { onClose: () => { if (!done) resolve(false); } });
    void close;
  });
}

/* ---------- Päivämäärät ---------- */
const WD = ['su', 'ma', 'ti', 'ke', 'to', 'pe', 'la'];
const MO = ['tammi', 'helmi', 'maalis', 'huhti', 'touko', 'kesä', 'heinä', 'elo', 'syys', 'loka', 'marras', 'joulu'];

export function fmtDate(dateStr) {
  const d = new Date(`${dateStr}T00:00`);
  if (isNaN(d)) return dateStr || '';
  return `${WD[d.getDay()]} ${d.getDate()}.${d.getMonth() + 1}.${d.getFullYear()}`;
}

export function fmtShortDate(dateStr) {
  const d = new Date(`${dateStr}T00:00`);
  if (isNaN(d)) return dateStr || '';
  return `${WD[d.getDay()]} ${d.getDate()}.${d.getMonth() + 1}.`;
}

export function monthLabel(dateStr) {
  const d = new Date(`${dateStr}T00:00`);
  if (isNaN(d)) return '';
  return `${MO[d.getMonth()]}kuu ${d.getFullYear()}`;
}

export function daysUntil(dateStr, time = '00:00') {
  const then = new Date(`${dateStr}T${time}`);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const that = new Date(then); that.setHours(0, 0, 0, 0);
  return Math.round((that - today) / 86400000);
}

export function countdownText(m) {
  const d = daysUntil(m.date, m.time);
  if (d === 0) return 'Tänään';
  if (d === 1) return 'Huomenna';
  if (d > 1 && d <= 30) return `${d} pv`;
  return '';
}

/** "juuri nyt", "5 min sitten", "eilen klo 18:30" */
export function timeAgo(iso) {
  if (!iso) return 'ei koskaan';
  const then = new Date(iso);
  if (isNaN(then)) return 'ei koskaan';
  const mins = Math.round((Date.now() - then.getTime()) / 60000);
  if (mins < 1) return 'juuri nyt';
  if (mins < 60) return `${mins} min sitten`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} h sitten`;
  return `${fmtShortDate(then.toISOString().slice(0, 10))} klo ${String(then.getHours()).padStart(2, '0')}:${String(then.getMinutes()).padStart(2, '0')}`;
}

export const initials = (name) =>
  name.trim().split(/\s+/).map((w) => w[0] || '').join('').slice(0, 2).toUpperCase();

/** Lyhyt näyttönimi kenttäkuvaan: "Virtanen" tai "M. Virtanen". */
export function shortName(name) {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0];
  return `${parts[0][0]}. ${parts[parts.length - 1]}`;
}

/* ---------- Videolinkit ---------- */

const VIDEO_SERVICES = {
  'app.veo.co': 'Veo',
  'veo.co': 'Veo',
  'youtube.com': 'YouTube',
  'm.youtube.com': 'YouTube',
  'youtu.be': 'YouTube',
  'vimeo.com': 'Vimeo',
  'spiideo.com': 'Spiideo',
  'app.spiideo.com': 'Spiideo',
  'hudl.com': 'Hudl',
  'fi.hudl.com': 'Hudl',
};

/**
 * Tunnistaa ottelun videolinkin. Palauttaa null, jos osoite ei kelpaa
 * (vain http- ja https-osoitteet hyväksytään).
 */
export function videoInfo(raw) {
  const text = (raw || '').trim();
  if (!text) return null;
  let url;
  try {
    url = new URL(text);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
  const host = url.hostname.replace(/^www\./, '');
  const service = VIDEO_SERVICES[host];
  return { url: url.href, host, service: service || host, known: !!service };
}
