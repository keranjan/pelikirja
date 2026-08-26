// Kauden tilastot: joukkue ja pelaajat.
import { h } from '../ui.js';
import { icon } from '../icons.js';
import { getState, sortedPlayers, isPlayed } from '../store.js';
import { seasonPlayingTime } from './playtime.js';

export function statsView() {
  const st = getState();
  const played = st.matches.filter(isPlayed);
  // Peliaikaa voi kertyä jo ennen kuin tulos on kirjattu.
  const tracked = st.matches.filter((m) => m.timing && m.timing.events?.length);
  const body = h('div', { class: 'stack' });

  if (!played.length && !tracked.length) {
    body.append(h('div', { class: 'empty' },
      h('span', { class: 'big' }, icon('chart', 30)),
      h('p', { text: 'Ei vielä tilastoja.' }),
      h('p', { class: 'small', text: 'Kirjaa otteluihin tulokset tai seuraa peliaikaa, niin tilastot kertyvät tänne.' })));
    return { title: 'Tilastot', body };
  }

  let w = 0, d = 0, l = 0, gf = 0, ga = 0;
  for (const m of played) {
    gf += m.result.gf || 0;
    ga += m.result.ga || 0;
    if (m.result.gf > m.result.ga) w++;
    else if (m.result.gf === m.result.ga) d++;
    else l++;
  }

  const kpi = (v, k) => h('div', { class: 'kpi' }, h('div', { class: 'v', text: String(v) }), h('div', { class: 'k', text: k }));

  if (played.length) {
    body.append(h('div', { class: 'section-title', text: 'Joukkue' }));
    body.append(h('div', { class: 'kpi-grid' }, kpi(played.length, 'Ottelua'), kpi(w, 'Voittoa'), kpi(d, 'Tasapeliä')));
    body.append(h('div', { class: 'kpi-grid' }, kpi(l, 'Tappiota'), kpi(`${gf}–${ga}`, 'Maalit'), kpi(w * 3 + d, 'Pistettä')));
  }

  // Pelaajakohtaiset tilastot
  const rows = sortedPlayers(st.players).map((p) => {
    let starts = 0, subs = 0, goals = 0, assists = 0;
    const minutes = Math.round(seasonPlayingTime(tracked, p.id) / 60);
    const counted = played.length ? played : tracked;
    for (const m of counted) {
      if (m.lineup.slots.includes(p.id)) starts++;
      else if (m.lineup.bench.includes(p.id)) subs++;
      for (const ev of m.result?.events || []) {
        if (ev.scorerId === p.id) goals++;
        if (ev.assistId === p.id) assists++;
      }
    }
    return { p, starts, subs, goals, assists, minutes, points: goals + assists };
  }).filter((r) => r.starts || r.subs || r.goals || r.assists || r.minutes);

  rows.sort((a, b) => b.goals - a.goals || b.assists - a.assists || b.starts - a.starts);

  body.append(h('div', { class: 'section-title', text: 'Pelaajat' }));
  if (tracked.length) {
    const minutes = rows.map((r) => r.minutes).filter((v) => v > 0);
    if (minutes.length > 1) {
      const min = Math.min(...minutes), max = Math.max(...minutes);
      body.append(h('div', { class: 'card row between', style: 'margin-bottom:10px' },
        h('span', { class: 'small muted', text: `Peliaika ${tracked.length === 1 ? 'ottelussa' : `${tracked.length} ottelussa`}` }),
        h('span', { class: 'bold tnum', text: `${min}–${max} min` })));
    }
  }
  if (!rows.length) {
    body.append(h('div', { class: 'card small muted', text: 'Kokoonpanoja ei ole liitetty pelattuihin otteluihin.' }));
  } else {
    const table = h('table', { class: 'stats' },
      h('thead', {}, h('tr', {},
        h('th', { text: 'Pelaaja' }), h('th', { text: 'Al.' }), h('th', { text: 'Vh.' }),
        tracked.length ? h('th', { text: 'Min' }) : null,
        h('th', { text: 'M' }), h('th', { text: 'S' }))),
      h('tbody', {}, ...rows.map((r) => h('tr', {},
        h('td', {}, h('span', { class: 'bold', text: r.p.name })),
        h('td', { text: String(r.starts) }),
        h('td', { text: String(r.subs) }),
        tracked.length ? h('td', { class: 'bold', text: String(r.minutes) }) : null,
        h('td', { class: 'bold', text: String(r.goals) }),
        h('td', { text: String(r.assists) })))));
    body.append(h('div', { class: 'card' }, table));
    body.append(h('p', { class: 'tiny muted center', text: tracked.length
      ? 'Al. = avauskokoonpanossa · Vh. = vaihtopenkillä · Min = peliaika · M = maalit · S = syötöt'
      : 'Al. = avauskokoonpanossa · Vh. = vaihtopenkillä · M = maalit · S = syötöt' }));
  }

  return { title: 'Tilastot', subtitle: `Kausi ${st.team.season || ''}`.trim(), body };
}
