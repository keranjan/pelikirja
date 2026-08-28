// Ottelupäivä: seuraava tapahtuma isona, viimeisin tulos ja kauden luvut.
import { h, fmtDate, daysUntil, videoInfo, timeAgo } from '../ui.js';
import {
  getState, upcomingMatches, pastMatches, isPlayed, playerName, fmtRating,
} from '../store.js';
import { getFormation } from '../formations.js';
import { matchEvents } from '../timing.js';
import { navigate } from '../router.js';
import { getStatus, isConnected } from '../sync.js';
import { icon } from '../icons.js';
import { openMatchSheet } from './matches.js';

export function homeView() {
  const st = getState();
  const body = h('div', { class: 'stack home' });
  const next = upcomingMatches()[0];
  const played = pastMatches().filter(isPlayed);

  body.append(next ? nextMatchHero(next) : noMatchCard(st));

  if (played.length) {
    body.append(h('div', { class: 'section-title', text: 'Viimeisin tulos' }));
    body.append(lastResultCard(played[0]));
  }

  const later = upcomingMatches().slice(1, 4);
  if (later.length) {
    body.append(h('div', { class: 'section-title', text: 'Tulossa myöhemmin' }));
    for (const m of later) {
      body.append(h('button', { class: 'card row', onclick: () => navigate(`#/ottelu/${m.id}`) },
        h('span', { class: 'numchip tnum', style: 'width:auto;padding:0 10px', text: shortDay(m.date) }),
        h('span', { class: 'grow' },
          h('div', { class: 'bold ellip', text: `${m.home ? '' : '@ '}${m.opponent || 'Vastustaja avoin'}` }),
          h('div', { class: 'tiny muted ellip', text: `klo ${m.time}${m.venue ? ' · ' + m.venue : ''}` }),
          // Kumman joukkueen ottelu, kun seurassa on useampi joukkue.
          m.team ? h('div', { style: 'margin-top:6px' }, h('span', { class: 'badge team', text: m.team })) : null),
        h('span', { class: 'muted', text: '›' })));
    }
  }

  if (played.length) body.append(seasonStrip(played));
  if (isConnected()) body.append(syncLine());

  return {
    title: st.team.name || 'Pelikirja',
    subtitle: `Kausi ${st.team.season || ''}`.trim(),
    actions: [{ icon: icon('settings', 21), aria: 'Asetukset', onClick: () => navigate('#/asetukset') }],
    body,
  };
}

/* ---------- Seuraava ottelu ---------- */

function nextMatchHero(m) {
  const f = getFormation(m.lineup.formation);
  const filled = m.lineup.slots.filter(Boolean).length;
  const total = f.slots.length;
  const ready = filled === total;
  const days = daysUntil(m.date, m.time);

  const hero = h('div', { class: 'hero' });

  hero.append(h('div', { class: 'row between', style: 'align-items:flex-start' },
    h('div', { class: 'grow' },
      h('div', { class: 'eyebrow', text: (m.team ? `${m.team} · ` : '') + (m.type === 'turnaus' ? 'seuraava turnaus' : 'seuraava ottelu') }),
      h('h2', { class: 'opponent', text: m.opponent || 'Vastustaja avoin' }),
      h('div', { class: 'when' },
        `${m.home ? 'Kotona' : 'Vieraissa'} · ${fmtDate(m.date)} klo ${m.time}`,
        m.venue ? h('div', { class: 'tiny muted', style: 'margin-top:2px', text: m.venue }) : null)),
    countdown(days)));

  hero.append(h('div', { style: 'margin-top:18px' },
    h('div', { class: 'row between', style: 'margin-bottom:8px' },
      h('span', { class: 'small bold', text: ready ? 'Kokoonpano valmis' : 'Kokoonpano kesken' }),
      h('span', { class: 'small muted tnum', text: `${filled}/${total}` })),
    h('div', { class: 'meter' }, h('i', { style: `width:${Math.round((filled / total) * 100)}%` }))));

  hero.append(h('div', { style: 'margin-top:14px' }, miniPitch(m.lineup, f)));

  hero.append(h('div', { class: 'btn-row', style: 'margin-top:16px' },
    h('button', { class: 'btn primary', onclick: () => navigate(`#/ottelu/${m.id}`) },
      ready ? 'Avaa ottelu' : 'Täydennä kokoonpano')));

  return hero;
}

function countdown(days) {
  if (days <= 0) return h('span', { class: 'badge draw', style: 'font-size:12px;padding:6px 12px', text: 'Tänään' });
  if (days === 1) return h('span', { class: 'badge draw', style: 'font-size:12px;padding:6px 12px', text: 'Huomenna' });
  return h('div', { class: `countdown${days <= 3 ? ' soon' : ''}`, style: 'flex-direction:column;align-items:flex-end;gap:0' },
    h('span', { class: 'n', text: String(days) }),
    h('span', { class: 'u', text: 'päivää' }));
}

/** Pieni vaakakenttä, joka näyttää yhdellä silmäyksellä montako paikkaa on täynnä. */
function miniPitch(lineup, formation) {
  const pitch = h('div', { class: 'mini-pitch' });
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'lines');
  svg.setAttribute('viewBox', '0 0 95 68');
  svg.setAttribute('preserveAspectRatio', 'none');
  svg.innerHTML = `
    <line x1="47.5" y1="2" x2="47.5" y2="66" />
    <circle cx="47.5" cy="34" r="8" />
    <rect x="2" y="20" width="11" height="28" />
    <rect x="82" y="20" width="11" height="28" />`;
  pitch.append(svg);
  formation.slots.forEach((slot, i) => {
    const filled = !!lineup.slots[i];
    // Pystykenttä käännetään vaakaan: oma maali vasemmalle.
    pitch.append(h('i', {
      class: `${filled ? '' : 'open'}${slot.pos === 'MV' && filled ? ' gk' : ''}`.trim(),
      style: `left:${100 - slot.y}%;top:${slot.x}%`,
    }));
  });
  return pitch;
}

function noMatchCard(st) {
  return h('div', { class: 'hero center' },
    h('div', { class: 'eyebrow', text: 'Ottelupäivä' }),
    h('h2', { class: 'opponent', style: 'margin-top:10px', text: 'Ei tulevia otteluita' }),
    h('p', { class: 'small muted', style: 'margin:8px 0 18px' },
      st.players.length
        ? 'Lisää seuraava ottelu, niin näet sen tässä lähtölaskennan kanssa.'
        : 'Aloita lisäämällä joukkueen pelaajat ja ensimmäinen ottelu.'),
    h('button', { class: 'btn primary', onclick: () => openMatchSheet(null) }, '＋ Lisää tapahtuma'));
}

/* ---------- Viimeisin tulos ---------- */

function lastResultCard(m) {
  const r = m.result;
  const cls = r.gf > r.ga ? 'win' : r.gf === r.ga ? 'draw' : 'loss';
  const label = r.gf > r.ga ? 'Voitto' : r.gf === r.ga ? 'Tasapeli' : 'Tappio';
  // Sama maalintekijä kootaan yhdeksi riviksi: "Koski x2, Hakala".
  const tally = new Map();
  for (const e of matchEvents(m)) {
    if (e.type !== 'goal' || e.team === 'them' || !e.playerId) continue;
    tally.set(e.playerId, (tally.get(e.playerId) || 0) + 1);
  }
  const scorers = [...tally].map(([id, n]) => (n > 1 ? `${playerName(id)} ×${n}` : playerName(id)));
  const video = videoInfo(m.videoUrl);

  const card = h('button', { class: 'card stack', style: 'gap:12px', onclick: () => navigate(`#/ottelu/${m.id}`) },
    h('div', { class: 'row between' },
      h('span', { class: 'grow' },
        h('div', { class: 'bold ellip', text: `${m.home ? '' : '@ '}${m.opponent || 'Vastustaja'}` }),
        h('div', { class: 'tiny muted', text: fmtDate(m.date) })),
      h('span', {
        class: `badge ${cls} tnum`,
        style: 'font-family:var(--display);font-size:16px;font-weight:800;padding:6px 12px',
        text: `${r.gf}–${r.ga}`,
      })),
    h('div', { class: 'row', style: 'gap:8px;flex-wrap:wrap' },
      h('span', { class: `badge ${cls}`, text: label }),
      typeof r.rating === 'number'
        ? h('span', { class: 'badge rating tnum', text: `Arvio ${fmtRating(r.rating)}` }) : null,
      scorers.length ? h('span', { class: 'tiny muted ellip', text: scorers.join(', ') }) : null,
      video ? h('span', { class: 'badge' }, icon('play', 11), 'Video') : null));

  return card;
}

/* ---------- Kauden luvut ---------- */

function seasonStrip(played) {
  let w = 0, d = 0, l = 0, gf = 0, ga = 0;
  for (const m of played) {
    gf += m.result.gf || 0;
    ga += m.result.ga || 0;
    if (m.result.gf > m.result.ga) w++;
    else if (m.result.gf === m.result.ga) d++;
    else l++;
  }
  const cell = (v, k) => h('div', {}, h('div', { class: 'v', text: v }), h('div', { class: 'k', text: k }));
  return h('div', { style: 'margin-top:24px' },
    h('div', { class: 'section-title', text: 'Kausi tähän mennessä' }),
    h('div', { class: 'stat-strip' },
      cell(String(played.length), 'Ottelua'),
      cell(`${w}–${d}–${l}`, 'V–T–H'),
      cell(`${gf}–${ga}`, 'Maalit')));
}

/** Hienovarainen tieto siitä, onko data ajan tasalla muilla laitteilla. */
function syncLine() {
  const st = getStatus();
  const text = {
    syncing: 'Synkronoidaan…',
    idle: `Synkronoitu ${timeAgo(st.lastSync)}`,
    offline: 'Ei verkkoyhteyttä – muutokset lähtevät myöhemmin',
    error: 'Synkronointi epäonnistui – katso asetukset',
  }[st.state] || '';
  if (!text) return null;
  return h('button', {
    class: 'tiny muted center',
    style: 'background:none;border:0;padding:12px 0 0;width:100%;cursor:pointer',
    onclick: () => navigate('#/asetukset'),
  }, text);
}

const shortDay = (dateStr) => {
  const d = new Date(`${dateStr}T00:00`);
  return isNaN(d) ? '–' : `${d.getDate()}.${d.getMonth() + 1}.`;
};
