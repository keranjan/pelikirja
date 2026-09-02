// Otteluluettelo: tulevat tapahtumat ja pelatut ottelut.
import { icon } from '../icons.js';
import { h, sheet, toast, fmtShortDate, countdownText, videoInfo } from '../ui.js';
import {
  getState, upcomingMatches, pastMatches, addMatch, updateMatch, matchKickoff, matchTeams,
  fmtRating, scoreText, addTournament, tournamentById, sortedTournaments, tournamentGames,
} from '../store.js';
import { tournamentDays, record, plural } from '../tournaments.js';
import { getFormation } from '../formations.js';
import { navigate } from '../router.js';

const TYPES = { ottelu: 'Ottelu', turnaus: 'Turnaus', harjoitus: 'Harjoituspeli' };
let tab = 'tulevat';
let teamFilter = '';   // '' = kaikki joukkueet

export function matchesView() {
  const body = h('div', { class: 'stack' });
  const state = getState();

  const seg = h('div', { class: 'segmented', style: 'margin-bottom:4px' },
    h('button', { class: tab === 'tulevat' ? 'on' : '', onclick: () => { tab = 'tulevat'; navigate('#/ottelut'); } }, 'Tulevat'),
    h('button', { class: tab === 'pelatut' ? 'on' : '', onclick: () => { tab = 'pelatut'; navigate('#/ottelut'); } }, 'Pelatut'));
  body.append(seg);

  let list = tab === 'tulevat' ? upcomingMatches() : pastMatches();

  // Jos otteluita on useammalle omalle joukkueelle, niitä voi suodattaa.
  const teams = matchTeams();
  if (teams.length > 1) {
    if (teamFilter && !teams.includes(teamFilter)) teamFilter = '';
    const chips = h('div', { class: 'chips scroll-x' },
      h('button', {
        class: `chip${teamFilter ? '' : ' on'}`,
        onclick: () => { teamFilter = ''; navigate('#/ottelut'); },
      }, 'Kaikki'),
      ...teams.map((name) => h('button', {
        class: `chip${teamFilter === name ? ' on' : ''}`,
        onclick: () => { teamFilter = name; navigate('#/ottelut'); },
      }, name)));
    body.append(chips);
    if (teamFilter) list = list.filter((m) => (m.team || '').trim() === teamFilter);
  } else {
    teamFilter = '';
  }

  // Turnausottelut niputetaan yhden turnauskortin taakse, jottei lista täyty
  // saman viikonlopun otteluista.
  list = withTournaments(list, tab === 'tulevat', teamFilter);

  if (!list.length) {
    body.append(h('div', { class: 'empty' },
      h('span', { class: 'big' }, icon(tab === 'tulevat' ? 'calendar' : 'trophy', 30)),
      h('p', { text: tab === 'tulevat' ? 'Ei tulevia tapahtumia.' : 'Ei pelattuja otteluita.' }),
      h('p', { class: 'small', text: tab === 'tulevat' ? 'Lisää ottelu, harjoituspeli tai turnaus.' : 'Merkitse otteluun tulos, niin se siirtyy tänne.' }),
      tab === 'tulevat'
        ? h('button', { class: 'btn primary', style: 'margin-top:14px;max-width:260px', onclick: () => openMatchSheet(null) }, '＋ Lisää tapahtuma')
        : null));
  } else {
    let lastMonth = '';
    let group = null;
    for (const entry of list) {
      const when = entry.tournament ? new Date(`${entry.tournament.startDate}T12:00:00`) : matchKickoff(entry);
      const month = when.getFullYear() + '-' + when.getMonth();
      if (month !== lastMonth) {
        lastMonth = month;
        body.append(h('div', { class: 'section-title', text: when.toLocaleDateString('fi-FI', { month: 'long', year: 'numeric' }) }));
        group = h('div', { class: 'cards' });
        body.append(group);
      }
      group.append(entry.tournament ? tournamentCard(entry.tournament) : matchCard(entry));
    }
  }

  return {
    title: 'Ottelut',
    subtitle: state.team.name || '',
    actions: [{ icon: '＋', aria: 'Lisää tapahtuma', onClick: () => openMatchSheet(null) }],
    body,
  };
}

/**
 * Korvaa turnausottelut turnauskorteilla. Turnaus näkyy tulevissa, kunnes sen
 * viimeinen päivä on ohi, ja sen jälkeen pelatuissa.
 */
function withTournaments(matches, upcoming, teamFilter = '') {
  const today = new Date().toISOString().slice(0, 10);
  const own = matches.filter((m) => !m.tournamentId);
  const tournaments = sortedTournaments().filter((t) => {
    const end = t.endDate || t.startDate;
    if (upcoming ? end < today : end >= today) return false;
    // Joukkuesuodatin: turnaus näkyy, jos siinä on suodatetun joukkueen ottelu
    // – tai jos otteluita ei ole vielä lisätty lainkaan.
    if (!teamFilter) return true;
    const games = tournamentGames(t.id);
    return !games.length || games.some((g) => (g.team || '').trim() === teamFilter);
  });
  const dateOf = (entry) => (entry.tournament
    ? `${entry.tournament.startDate}T00:00`
    : `${entry.date}T${entry.time || '00:00'}`);

  const entries = [...own, ...tournaments.map((t) => ({ tournament: t }))]
    .sort((a, b) => dateOf(a).localeCompare(dateOf(b)));
  return upcoming ? entries : entries.reverse();
}

/** Turnaus näkyy listassa yhtenä korttina. */
function tournamentCard(t) {
  const games = tournamentGames(t.id);
  const days = tournamentDays(t);
  const r = record(games);
  return h('button', { class: 'card', onclick: () => navigate(`#/turnaus/${t.id}`) },
    h('div', { class: 'row' },
      h('div', { class: 'grow' },
        h('div', { class: 'bold ellip', text: t.name || 'Turnaus' }),
        h('div', { class: 'small muted ellip' },
          days.length > 1
            ? `${fmtShortDate(t.startDate)} – ${fmtShortDate(t.endDate)}`
            : fmtShortDate(t.startDate),
          t.venue ? ` · ${t.venue}` : '')),
      r.played
        ? h('span', { class: 'badge accent tnum', text: `${r.w}–${r.d}–${r.l}` })
        : h('span', { class: 'badge', text: plural(games.length, 'ottelu', 'ottelua') })),
    h('div', { class: 'row', style: 'gap:6px;margin-top:8px' },
      h('span', { class: 'badge', text: 'Turnaus' }),
      days.length > 1 ? h('span', { class: 'badge', text: plural(days.length, 'päivä', 'päivää') }) : null,
      (t.groups || []).length ? h('span', { class: 'badge', text: plural(t.groups.length, 'lohko', 'lohkoa') }) : null,
      games.some((g) => g.stage === 'jatko') ? h('span', { class: 'badge accent', text: 'Jatkopelit' }) : null));
}

function matchCard(m) {
  const f = getFormation(m.lineup.formation);
  const filled = m.lineup.slots.filter(Boolean).length;
  const cd = countdownText(m);

  let right;
  if (m.result) {
    const cls = m.result.gf > m.result.ga ? 'win' : m.result.gf === m.result.ga ? 'draw' : 'loss';
    const label = m.result.gf > m.result.ga ? 'V' : m.result.gf === m.result.ga ? 'T' : 'H';
    right = h('span', { class: `badge ${cls}`, style: 'font-size:14px;padding:5px 10px' }, scoreText(m), ' ', label);
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
      m.team ? h('span', { class: 'badge team', text: m.team }) : null,
      typeof m.result?.rating === 'number'
        ? h('span', { class: 'badge rating tnum', text: `Arvio ${fmtRating(m.result.rating)}` }) : null,
      cd && !m.result ? h('span', { class: 'badge accent', text: cd }) : null,
      videoInfo(m.videoUrl) ? h('span', { class: 'badge' }, icon('play', 11), 'Video') : null));
}

export function openMatchSheet(match) {
  const isNew = !match;
  let home = match ? match.home !== false : true;
  let type = match?.type || 'ottelu';

  sheet(isNew ? 'Uusi tapahtuma' : 'Muokkaa tapahtumaa', (body, close) => {
    /* --- Tyyppi ensin: se ratkaisee minkä muotoinen lomake on --- */
    const typeRow = h('div', { class: 'segmented' },
      ...Object.entries(TYPES).map(([value, label]) => h('button', {
        type: 'button', class: type === value ? 'on' : '',
        onclick: (e) => {
          type = value;
          [...typeRow.children].forEach((b) => b.classList.remove('on'));
          e.currentTarget.classList.add('on');
          apply();
        },
      }, label)));

    /* --- Yksittäinen ottelu tai harjoituspeli --- */
    const dateI = h('input', { type: 'date', value: match?.date || new Date().toISOString().slice(0, 10) });
    const timeI = h('input', { type: 'time', value: match?.time || '18:00' });
    const oppI = h('input', { type: 'text', value: match?.opponent || '', placeholder: 'Vastustajan nimi', autocomplete: 'off' });
    // Oma joukkue: seurassa voi olla useampi joukkue, esim. Ilves Beta ja Ilves Keltainen.
    const known = matchTeams();
    const teamI = h('input', {
      type: 'text', value: match?.team || '', autocomplete: 'off',
      list: known.length ? 'omat-joukkueet' : null,
      placeholder: getState().team.name || 'Oma joukkue',
    });
    const teamList = known.length
      ? h('datalist', { id: 'omat-joukkueet' }, ...known.map((n) => h('option', { value: n })))
      : null;
    const venueI = h('input', { type: 'text', value: match?.venue || '', placeholder: 'Kenttä tai halli', autocomplete: 'off' });
    const notesI = h('textarea', { placeholder: 'Kokoontuminen, varusteet, muuta huomioitavaa', text: match?.notes || '' });
    const videoI = h('input', {
      type: 'text', value: match?.videoUrl || '', autocomplete: 'off',
      inputmode: 'url', placeholder: 'https://app.veo.co/matches/...',
    });

    const haToggle = h('div', { class: 'segmented' },
      h('button', { type: 'button', class: home ? 'on' : '', onclick: (e) => setHA(true, e) }, 'Kotiottelu'),
      h('button', { type: 'button', class: !home ? 'on' : '', onclick: (e) => setHA(false, e) }, 'Vierasottelu'));
    function setHA(v, e) {
      home = v;
      [...haToggle.children].forEach((b) => b.classList.remove('on'));
      e.currentTarget.classList.add('on');
    }

    const matchFields = h('div', { class: 'stack', style: 'gap:12px' },
      h('label', { class: 'field' }, h('span', { text: 'Vastustaja' }), oppI),
      h('label', { class: 'field' },
        h('span', { text: 'Oma joukkue' }), teamI, teamList,
        h('span', { class: 'tiny muted', text: 'Kumman joukkueen ottelu tämä on. Voit jättää tyhjäksi, jos joukkueita on vain yksi.' })),
      h('div', { class: 'field-row' },
        h('label', { class: 'field', style: 'flex:1.3' }, h('span', { text: 'Päivä' }), dateI),
        h('label', { class: 'field', style: 'flex:1' }, h('span', { text: 'Aika' }), timeI)),
      h('label', { class: 'field' }, h('span', { text: 'Paikka' }), venueI),
      h('label', { class: 'field' }, h('span', { text: 'Koti vai vieras' }), haToggle),
      h('label', { class: 'field' },
        h('span', { text: 'Videolinkki' }), videoI,
        h('span', { class: 'tiny muted', text: 'Ottelun tallenne esimerkiksi Veosta – linkki avautuu ottelun Tulos-välilehdeltä.' })),
      h('label', { class: 'field' }, h('span', { text: 'Muistiinpanot' }), notesI));

    /* --- Turnaus: monipäiväinen tapahtuma, jolla on omat ottelunsa --- */
    const today = new Date().toISOString().slice(0, 10);
    const tNameI = h('input', { type: 'text', placeholder: 'esim. Ilves Cup', autocomplete: 'off' });
    const tStartI = h('input', { type: 'date', value: today });
    const tEndI = h('input', { type: 'date', value: today });
    const tVenueI = h('input', { type: 'text', placeholder: 'Kenttäalue tai paikkakunta', autocomplete: 'off' });
    const tNotesI = h('textarea', { placeholder: 'Kokoontuminen, ruokailut, muuta huomioitavaa' });
    const tourFields = h('div', { class: 'stack', style: 'gap:12px' },
      h('label', { class: 'field' }, h('span', { text: 'Turnauksen nimi' }), tNameI),
      h('div', { class: 'field-row' },
        h('label', { class: 'field' }, h('span', { text: 'Alkaa' }), tStartI),
        h('label', { class: 'field' }, h('span', { text: 'Päättyy' }), tEndI)),
      h('label', { class: 'field' }, h('span', { text: 'Paikka' }), tVenueI),
      h('label', { class: 'field' },
        h('span', { text: 'Muistiinpanot' }), tNotesI,
        h('span', { class: 'tiny muted', text: 'Turnaukseen lisätään seuraavaksi lohkot ja ottelut. Jatkopelit voi lisätä turnauksen edetessä.' })));

    const saveBtn = h('button', { class: 'btn primary' }, 'Lisää tapahtuma');

    // Turnauslomake on käytössä vain uutta tapahtumaa luodessa: valmista
    // ottelua ei muuteta turnaukseksi kesken kaiken.
    const isTournament = () => isNew && type === 'turnaus';
    const apply = () => {
      matchFields.style.display = isTournament() ? 'none' : '';
      tourFields.style.display = isTournament() ? '' : 'none';
      saveBtn.textContent = isTournament() ? 'Luo turnaus' : (isNew ? 'Lisää tapahtuma' : 'Tallenna');
    };

    saveBtn.addEventListener('click', () => {
      if (isTournament()) {
        const start = tStartI.value || today;
        const t = addTournament({
          name: tNameI.value.trim() || 'Turnaus',
          startDate: start,
          endDate: tEndI.value && tEndI.value >= start ? tEndI.value : start,
          venue: tVenueI.value.trim(),
          notes: tNotesI.value.trim(),
        });
        close();
        toast('Turnaus luotu');
        navigate(`#/turnaus/${t.id}`);
        return;
      }
      const video = videoI.value.trim();
      if (video && !videoInfo(video)) {
        toast('Videolinkin pitää alkaa https://');
        videoI.focus();
        return;
      }
      const data = {
        videoUrl: video,
        date: dateI.value || new Date().toISOString().slice(0, 10),
        time: timeI.value || '18:00',
        opponent: oppI.value.trim(),
        team: teamI.value.trim(),
        venue: venueI.value.trim(),
        type,
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
    });

    body.append(
      h('label', { class: 'field' }, h('span', { text: 'Tapahtuman tyyppi' }), typeRow),
      matchFields, tourFields, saveBtn);
    apply();

    if (isNew) setTimeout(() => (isTournament() ? tNameI : oppI).focus(), 60);
  });
}
