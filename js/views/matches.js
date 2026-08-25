// Otteluluettelo: tulevat tapahtumat ja pelatut ottelut.
import { h, sheet, toast, fmtShortDate, countdownText } from '../ui.js';
import { getState, upcomingMatches, pastMatches, addMatch, updateMatch, matchKickoff } from '../store.js';
import { getFormation } from '../formations.js';
import { navigate } from '../router.js';

const TYPES = { ottelu: 'Ottelu', turnaus: 'Turnaus', harjoitus: 'Harjoituspeli' };
let tab = 'tulevat';

export function matchesView() {
  const body = h('div', { class: 'stack' });
  const state = getState();

  const seg = h('div', { class: 'segmented', style: 'margin-bottom:4px' },
    h('button', { class: tab === 'tulevat' ? 'on' : '', onclick: () => { tab = 'tulevat'; navigate('#/ottelut'); } }, 'Tulevat'),
    h('button', { class: tab === 'pelatut' ? 'on' : '', onclick: () => { tab = 'pelatut'; navigate('#/ottelut'); } }, 'Pelatut'));
  body.append(seg);

  const list = tab === 'tulevat' ? upcomingMatches() : pastMatches();

  if (!list.length) {
    body.append(h('div', { class: 'empty' },
      h('span', { class: 'big', text: tab === 'tulevat' ? '📅' : '🏆' }),
      h('p', { text: tab === 'tulevat' ? 'Ei tulevia tapahtumia.' : 'Ei pelattuja otteluita.' }),
      h('p', { class: 'small', text: tab === 'tulevat' ? 'Lisää ottelu, harjoituspeli tai turnaus.' : 'Merkitse otteluun tulos, niin se siirtyy tänne.' }),
      tab === 'tulevat'
        ? h('button', { class: 'btn primary', style: 'margin-top:14px;max-width:260px', onclick: () => openMatchSheet(null) }, '＋ Lisää tapahtuma')
        : null));
  } else {
    let lastMonth = '';
    for (const m of list) {
      const month = matchKickoff(m).getFullYear() + '-' + matchKickoff(m).getMonth();
      if (month !== lastMonth) {
        lastMonth = month;
        const d = matchKickoff(m);
        body.append(h('div', { class: 'section-title', text: d.toLocaleDateString('fi-FI', { month: 'long', year: 'numeric' }) }));
      }
      body.append(matchCard(m));
    }
  }

  return {
    title: state.team.name || 'Ottelut',
    subtitle: `Kausi ${state.team.season || ''}`.trim(),
    actions: [{ icon: '＋', aria: 'Lisää tapahtuma', onClick: () => openMatchSheet(null) }],
    body,
  };
}

function matchCard(m) {
  const f = getFormation(m.lineup.formation);
  const filled = m.lineup.slots.filter(Boolean).length;
  const cd = countdownText(m);

  let right;
  if (m.result) {
    const cls = m.result.gf > m.result.ga ? 'win' : m.result.gf === m.result.ga ? 'draw' : 'loss';
    const label = m.result.gf > m.result.ga ? 'V' : m.result.gf === m.result.ga ? 'T' : 'H';
    right = h('span', { class: `badge ${cls}`, style: 'font-size:14px;padding:5px 10px' }, `${m.result.gf}–${m.result.ga}`, ' ', label);
  } else {
    right = h('span', { class: 'badge' + (filled === f.slots.length && filled > 0 ? ' accent' : ''), text: `${filled}/${f.slots.length}` });
  }

  return h('button', { class: 'card', onclick: () => navigate(`#/ottelu/${m.id}`) },
    h('div', { class: 'row' },
      h('div', { class: 'grow' },
        h('div', { class: 'row', style: 'gap:6px' },
          h('span', { class: 'bold ellip', text: `${m.home ? '' : '@ '}${m.opponent || 'Vastustaja avoin'}` })),
        h('div', { class: 'small muted ellip' },
          `${fmtShortDate(m.date)} klo ${m.time || '–'}`,
          m.venue ? ` · ${m.venue}` : '')),
      right),
    h('div', { class: 'row', style: 'gap:6px;margin-top:8px' },
      h('span', { class: 'badge', text: TYPES[m.type] || m.type }),
      h('span', { class: 'badge', text: m.home ? 'Koti' : 'Vieras' }),
      cd && !m.result ? h('span', { class: 'badge accent', text: cd }) : null));
}

export function openMatchSheet(match) {
  const isNew = !match;
  let home = match ? match.home !== false : true;

  sheet(isNew ? 'Uusi tapahtuma' : 'Muokkaa tapahtumaa', (body, close) => {
    const dateI = h('input', { type: 'date', value: match?.date || new Date().toISOString().slice(0, 10) });
    const timeI = h('input', { type: 'time', value: match?.time || '18:00' });
    const oppI = h('input', { type: 'text', value: match?.opponent || '', placeholder: 'Vastustajan nimi', autocomplete: 'off' });
    const venueI = h('input', { type: 'text', value: match?.venue || '', placeholder: 'Kenttä tai halli', autocomplete: 'off' });
    const notesI = h('textarea', { placeholder: 'Kokoontuminen, varusteet, muuta huomioitavaa', text: match?.notes || '' });
    const typeSel = h('select', {}, ...Object.entries(TYPES).map(([v, label]) =>
      h('option', { value: v, text: label, selected: (match?.type || 'ottelu') === v })));

    const haToggle = h('div', { class: 'segmented' },
      h('button', { type: 'button', class: home ? 'on' : '', onclick: (e) => setHA(true, e) }, 'Kotiottelu'),
      h('button', { type: 'button', class: !home ? 'on' : '', onclick: (e) => setHA(false, e) }, 'Vierasottelu'));
    function setHA(v, e) {
      home = v;
      [...haToggle.children].forEach((b) => b.classList.remove('on'));
      e.currentTarget.classList.add('on');
    }

    body.append(
      h('label', { class: 'field' }, h('span', { text: 'Vastustaja' }), oppI),
      h('div', { class: 'field-row' },
        h('label', { class: 'field', style: 'flex:1.3' }, h('span', { text: 'Päivä' }), dateI),
        h('label', { class: 'field', style: 'flex:1' }, h('span', { text: 'Aika' }), timeI)),
      h('label', { class: 'field' }, h('span', { text: 'Paikka' }), venueI),
      h('label', { class: 'field' }, h('span', { text: 'Tapahtuman tyyppi' }), typeSel),
      h('label', { class: 'field' }, h('span', { text: 'Koti vai vieras' }), haToggle),
      h('label', { class: 'field' }, h('span', { text: 'Muistiinpanot' }), notesI),
      h('button', {
        class: 'btn primary',
        onclick: () => {
          const data = {
            date: dateI.value || new Date().toISOString().slice(0, 10),
            time: timeI.value || '18:00',
            opponent: oppI.value.trim(),
            venue: venueI.value.trim(),
            type: typeSel.value,
            home,
            notes: notesI.value.trim(),
          };
          if (isNew) {
            const m = addMatch(data);
            close();
            toast('Tapahtuma lisätty');
            navigate(`#/ottelu/${m.id}`);
          } else {
            updateMatch(match.id, data);
            close();
            toast('Tallennettu');
          }
        },
      }, isNew ? 'Lisää tapahtuma' : 'Tallenna'));

    if (isNew) setTimeout(() => oppI.focus(), 60);
  });
}
