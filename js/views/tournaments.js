// Turnausnäkymä: ohjelma päivittäin, lohkot ja jatkopelit.
import { icon } from '../icons.js';
import { h, add, sheet, toast, confirmSheet, fmtDate, fmtShortDate } from '../ui.js';
import {
  getState, tournamentById, tournamentGames, updateTournament, removeTournament,
  addGroup, updateGroup, removeGroup, addMatch, matchTeams, scoreText,
} from '../store.js';
import {
  STAGES, PLAYOFF_LABELS, tournamentDays, gamesByDay, stageName, allTeams, record, plural,
} from '../tournaments.js';
import { navigate } from '../router.js';

export function tournamentView(id) {
  const t = tournamentById(id);
  if (!t) {
    return { title: 'Turnaus', back: '#/ottelut', body: h('p', { class: 'muted', text: 'Turnausta ei löydy.' }) };
  }

  const games = tournamentGames(id);
  const body = h('div', { class: 'stack' });
  const days = tournamentDays(t);
  const teams = allTeams(t);

  /* --- Yhteenveto --- */
  const r = record(games);
  body.append(h('div', { class: 'card stack', style: 'gap:10px' },
    h('div', { class: 'row between' },
      h('span', { class: 'grow' },
        h('div', { class: 'eyebrow', text: 'TURNAUS' }),
        h('div', { class: 'bold ellip', style: 'font-size:18px', text: t.name || 'Turnaus' })),
      h('span', { class: 'badge accent', text: plural(days.length, 'päivä', 'päivää') })),
    h('div', { class: 'small muted' },
      days.length > 1
        ? `${fmtDate(t.startDate)} – ${fmtDate(t.endDate)}`
        : fmtDate(t.startDate),
      t.venue ? ` · ${t.venue}` : ''),
    h('div', { class: 'row', style: 'gap:8px;flex-wrap:wrap' },
      h('span', { class: 'badge', text: plural(games.length, 'ottelu', 'ottelua') }),
      teams.length ? h('span', { class: 'badge', text: plural(teams.length, 'joukkue', 'joukkuetta') }) : null,
      (t.groups || []).length ? h('span', { class: 'badge', text: plural(t.groups.length, 'lohko', 'lohkoa') }) : null,
      r.played ? h('span', { class: 'badge accent tnum', text: `${r.w}–${r.d}–${r.l} · ${r.gf}–${r.ga}` }) : null)));

  /* --- Ohjelma päivittäin --- */
  body.append(h('div', { class: 'section-title', text: `Ohjelma (${games.length})` }));
  if (!games.length) {
    body.append(h('div', { class: 'card small muted', text: 'Ei vielä otteluita. Lisää lohkopelit alta – jatkopelit voi lisätä turnauksen edetessä.' }));
  } else {
    for (const day of gamesByDay(games)) {
      if (days.length > 1) {
        body.append(h('div', { class: 'tiny muted bold', style: 'margin:10px 2px 4px',
          text: fmtDate(day.date).toUpperCase() }));
      }
      const cards = h('div', { class: 'cards tight' });
      for (const g of day.games) cards.append(gameCard(t, g));
      body.append(cards);
    }
  }
  body.append(h('div', { class: 'btn-row', style: 'margin-top:10px' },
    h('button', { class: 'btn primary', style: 'flex:1', onclick: () => openGameSheet(t, null, 'lohko') }, '＋ Lohkopeli'),
    h('button', { class: 'btn', style: 'flex:1', onclick: () => openGameSheet(t, null, 'jatko') }, '＋ Jatkopeli')));

  /* --- Lohkot --- */
  body.append(h('div', { class: 'section-title', text: `Lohkot (${(t.groups || []).length})` }));
  if (!(t.groups || []).length) {
    body.append(h('div', { class: 'card small muted', text: 'Lisää lohko ja sen joukkueet, niin voit merkitä ottelut lohkoon.' }));
  } else {
    for (const g of t.groups) {
      const played = games.filter((m) => m.groupId === g.id);
      body.append(h('button', { class: 'card row compact', onclick: () => openGroupSheet(t, g) },
        h('span', { class: 'numchip sm accent', text: g.name || '?' }),
        h('span', { class: 'grow' },
          h('div', { class: 'bold ellip', text: `Lohko ${g.name}` }),
          h('div', { class: 'tiny muted ellip', text: (g.teams || []).length
            ? `${plural(g.teams.length, 'joukkue', 'joukkuetta')} · ${plural(played.length, 'oma ottelu', 'omaa ottelua')}`
            : 'Ei joukkueita' })),
        h('span', { class: 'muted', text: '›' })));
    }
  }
  body.append(h('button', { class: 'btn', style: 'margin-top:8px', onclick: () => openGroupSheet(t, null) },
    '＋ Lisää lohko'));

  /* --- Muistiinpanot --- */
  const notesI = h('textarea', { rows: 3, placeholder: 'Kokoontuminen, ruokailut, muuta huomioitavaa.', text: t.notes || '' });
  notesI.addEventListener('change', () => updateTournament(id, { notes: notesI.value }, { silent: true }));
  body.append(h('label', { class: 'field', style: 'margin-top:16px' },
    h('span', { text: 'Muistiinpanot' }), notesI));

  body.append(h('button', {
    class: 'btn danger',
    onclick: async () => {
      const extra = games.length ? ` Myös ${games.length} ottelua poistetaan.` : '';
      if (await confirmSheet('Poista turnaus', `Turnaus poistetaan pysyvästi.${extra}`)) {
        removeTournament(id);
        toast('Turnaus poistettu');
        navigate('#/ottelut');
      }
    },
  }, 'Poista turnaus'));

  return {
    title: t.name || 'Turnaus',
    subtitle: days.length > 1 ? `${fmtShortDate(t.startDate)} – ${fmtShortDate(t.endDate)}` : fmtDate(t.startDate),
    back: '#/ottelut',
    actions: [{ icon: '✎', aria: 'Muokkaa turnausta', onClick: () => openTournamentSheet(t) }],
    body,
  };
}

/** Yksi turnausottelu ohjelmassa. */
function gameCard(t, g) {
  const played = !!g.result;
  return h('button', { class: 'card row compact', onclick: () => navigate(`#/ottelu/${g.id}`) },
    h('span', { class: 'numchip sm tnum', style: 'width:auto;padding:0 8px', text: g.time || '–' }),
    h('span', { class: 'grow' },
      h('div', { class: 'bold ellip', text: `${g.home ? '' : '@ '}${g.opponent || 'Vastustaja avoin'}` }),
      h('div', { class: 'tiny muted ellip', text: [stageName(t, g), g.venue].filter(Boolean).join(' · ') })),
    played
      ? h('span', {
        class: `badge ${g.result.gf > g.result.ga ? 'win' : g.result.gf === g.result.ga ? 'draw' : 'loss'} tnum`,
        text: scoreText(g),
      })
      : h('span', { class: 'muted', text: '›' }));
}

/* ---------- Turnauksen tiedot ---------- */

export function openTournamentSheet(t) {
  sheet('Turnauksen tiedot', (body, close) => {
    const nameI = h('input', { type: 'text', value: t.name || '', placeholder: 'esim. Ilves Cup' });
    const startI = h('input', { type: 'date', value: t.startDate || '' });
    const endI = h('input', { type: 'date', value: t.endDate || t.startDate || '' });
    const venueI = h('input', { type: 'text', value: t.venue || '', placeholder: 'Kenttäalue tai paikkakunta' });
    add(body,
      h('label', { class: 'field' }, h('span', { text: 'Turnauksen nimi' }), nameI),
      h('div', { class: 'field-row' },
        h('label', { class: 'field' }, h('span', { text: 'Alkaa' }), startI),
        h('label', { class: 'field' }, h('span', { text: 'Päättyy' }), endI)),
      h('label', { class: 'field' }, h('span', { text: 'Paikka' }), venueI),
      h('button', {
        class: 'btn primary',
        onclick: () => {
          const start = startI.value || t.startDate;
          updateTournament(t.id, {
            name: nameI.value.trim() || t.name,
            startDate: start,
            endDate: endI.value && endI.value >= start ? endI.value : start,
            venue: venueI.value.trim(),
          });
          close();
          toast('Tallennettu');
        },
      }, 'Tallenna'));
  });
}

/* ---------- Lohkot ---------- */

function openGroupSheet(t, group) {
  sheet(group ? `Lohko ${group.name}` : 'Uusi lohko', (body, close) => {
    const nameI = h('input', { type: 'text', value: group?.name || '', placeholder: 'A' });
    const teamsI = h('textarea', {
      rows: 8, placeholder: 'Yksi joukkue riviä kohden',
      text: (group?.teams || []).join('\n'),
    });
    add(body,
      h('label', { class: 'field' }, h('span', { text: 'Lohkon nimi' }), nameI),
      h('label', { class: 'field' },
        h('span', { text: 'Joukkueet' }), teamsI,
        h('span', { class: 'tiny muted', text: 'Yksi joukkue riviä kohden. Nimet tulevat vastustajan valintaan.' })),
      h('button', {
        class: 'btn primary',
        onclick: () => {
          const teams = teamsI.value.split('\n').map((x) => x.trim()).filter(Boolean);
          const name = nameI.value.trim() || String.fromCharCode(65 + (t.groups || []).length);
          if (group) updateGroup(t.id, group.id, { name, teams });
          else updateGroup(t.id, addGroup(t.id, name).id, { teams });
          close();
        },
      }, group ? 'Tallenna' : 'Lisää lohko'),
      group ? h('button', {
        class: 'btn danger', style: 'margin-top:10px',
        onclick: async () => {
          if (await confirmSheet('Poista lohko', 'Lohko poistetaan. Sen ottelut säilyvät, mutta ne irrotetaan lohkosta.')) {
            removeGroup(t.id, group.id);
            close();
          }
        },
      }, 'Poista lohko') : null);
  });
}

/* ---------- Turnausottelu ---------- */

/** Lisää turnaukseen lohkopelin tai jatkopelin. */
export function openGameSheet(t, game, stage = 'lohko') {
  const days = tournamentDays(t);
  sheet(stage === 'jatko' ? 'Uusi jatkopeli' : 'Uusi lohkopeli', (body, close) => {
    const oppI = h('input', {
      type: 'text', value: game?.opponent || '', placeholder: 'Vastustajan nimi', autocomplete: 'off',
      list: allTeams(t).length ? 'turnauksen-joukkueet' : null,
    });
    const teamList = allTeams(t).length
      ? h('datalist', { id: 'turnauksen-joukkueet' }, ...allTeams(t).map((n) => h('option', { value: n })))
      : null;
    const dateSel = h('select', {}, ...days.map((d) => h('option', {
      value: d, text: fmtDate(d), selected: (game?.date || days[0]) === d,
    })));
    const timeI = h('input', { type: 'time', value: game?.time || '10:00' });
    const venueI = h('input', { type: 'text', value: game?.venue || t.venue || '', placeholder: 'Kenttä' });
    const known = matchTeams();
    const ownI = h('input', {
      type: 'text', value: game?.team || '', autocomplete: 'off',
      list: known.length ? 'omat-joukkueet-turnaus' : null,
      placeholder: getState().team.name || 'Oma joukkue',
    });
    const ownList = known.length
      ? h('datalist', { id: 'omat-joukkueet-turnaus' }, ...known.map((n) => h('option', { value: n })))
      : null;

    // Lohkopelissä valitaan lohko, jatkopelissä ottelun nimi.
    const groupSel = h('select', {},
      h('option', { value: '', text: 'Ei lohkoa' }),
      ...(t.groups || []).map((g) => h('option', {
        value: g.id, text: `Lohko ${g.name}`, selected: game?.groupId === g.id,
      })));
    const labelI = h('input', {
      type: 'text', value: game?.label || '', placeholder: 'esim. Välierä',
      list: 'jatkopelien-nimet', autocomplete: 'off',
    });
    const labelList = h('datalist', { id: 'jatkopelien-nimet' },
      ...PLAYOFF_LABELS.map((n) => h('option', { value: n })));

    let home = game ? game.home !== false : true;
    const haToggle = h('div', { class: 'segmented' },
      h('button', { type: 'button', class: home ? 'on' : '', onclick: (e) => setHA(true, e) }, 'Kotijoukkue'),
      h('button', { type: 'button', class: !home ? 'on' : '', onclick: (e) => setHA(false, e) }, 'Vierasjoukkue'));
    function setHA(v, e) {
      home = v;
      [...haToggle.children].forEach((b) => b.classList.remove('on'));
      e.currentTarget.classList.add('on');
    }

    add(body,
      h('label', { class: 'field' }, h('span', { text: 'Vastustaja' }), oppI, teamList),
      stage === 'jatko'
        ? h('label', { class: 'field' },
          h('span', { text: 'Ottelun nimi' }), labelI, labelList,
          h('span', { class: 'tiny muted', text: 'Esimerkiksi Välierä tai Sijoitusottelu 5.–6.' }))
        : h('label', { class: 'field' }, h('span', { text: 'Lohko' }), groupSel),
      h('div', { class: 'field-row' },
        h('label', { class: 'field', style: 'flex:1.4' }, h('span', { text: 'Päivä' }), dateSel),
        h('label', { class: 'field', style: 'flex:1' }, h('span', { text: 'Aika' }), timeI)),
      h('label', { class: 'field' }, h('span', { text: 'Kenttä' }), venueI),
      h('label', { class: 'field' }, h('span', { text: 'Oma joukkue' }), ownI, ownList),
      h('label', { class: 'field' }, h('span', { text: 'Koti vai vieras' }), haToggle),
      h('button', {
        class: 'btn primary',
        onclick: () => {
          const m = addMatch({
            type: 'turnaus',
            tournamentId: t.id,
            stage,
            groupId: stage === 'lohko' ? groupSel.value : '',
            label: stage === 'jatko' ? labelI.value.trim() : '',
            opponent: oppI.value.trim(),
            team: ownI.value.trim(),
            date: dateSel.value || t.startDate,
            time: timeI.value || '10:00',
            venue: venueI.value.trim(),
            home,
          });
          close();
          toast(stage === 'jatko' ? 'Jatkopeli lisätty' : 'Lohkopeli lisätty');
          navigate(`#/ottelu/${m.id}`);
        },
      }, 'Lisää ottelu'));

    setTimeout(() => oppI.focus(), 60);
  });
}

export { STAGES };
