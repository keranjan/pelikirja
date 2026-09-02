// Yksittäisen ottelun näkymä: kokoonpano, tulos ja tiedot.
import { icon } from '../icons.js';
import { h, add, sheet, toast, confirmSheet, fmtDate, videoInfo } from '../ui.js';
import {
  getState, matchById, updateMatch, removeMatch, update,
  playerById, cloneLineup, addLineup, lineupById,
  staffById, STAFF_ROLES, absentIds, tournamentById,
  RATINGS, RATING_MIN, RATING_MAX, RATING_STEP, ratingLabel, fmtRating, clampRating,
} from '../store.js';
import { getFormation } from '../formations.js';
import { matchEvents } from '../timing.js';
import { renderLineupEditor } from './pitch.js';
import { trackingTab, eventList } from './tracking.js';
import { openMatchSheet } from './matches.js';
import { stageName } from '../tournaments.js';
import { lineupDataUrl, lineupImageFile } from '../lineup-image.js';
import { navigate } from '../router.js';

const TYPES = { ottelu: 'Ottelu', turnaus: 'Turnaus', harjoitus: 'Harjoituspeli' };
let tab = 'kokoonpano';

export function matchView(id) {
  const m = matchById(id);
  if (!m) {
    return {
      title: 'Ottelua ei löydy', back: '#/ottelut',
      body: h('div', { class: 'empty' }, 'Tapahtuma on poistettu.'),
    };
  }

  const body = h('div', { class: 'stack' });
  body.append(h('div', { class: 'segmented four' },
    ...[['kokoonpano', 'Kokoonpano'], ['seuranta', 'Seuranta'], ['tulos', 'Tulos'], ['tiedot', 'Tiedot']].map(([k, label]) =>
      h('button', { class: tab === k ? 'on' : '', onclick: () => { tab = k; navigate(`#/ottelu/${id}`); } }, label))));

  if (tab === 'kokoonpano') body.append(lineupTab(m));
  else if (tab === 'seuranta') body.append(trackingTab(m));
  else if (tab === 'tulos') body.append(resultTab(m));
  else body.append(infoTab(m));

  // Turnausottelu palaa turnaukseen ja kertoo otsikossa vaiheen.
  const tournament = m.tournamentId ? tournamentById(m.tournamentId) : null;
  const stage = tournament ? stageName(tournament, m) : '';
  return {
    title: `${m.home ? 'vs' : '@'} ${m.opponent || 'Vastustaja'}`,
    subtitle: [tournament ? `${tournament.name} · ${stage}` : (m.team || ''),
      `${fmtDate(m.date)} klo ${m.time}`].filter(Boolean).join(' · '),
    back: tournament ? `#/turnaus/${tournament.id}` : '#/ottelut',
    body,
  };
}

/* ---------- Kokoonpano ---------- */

function lineupTab(m) {
  const wrap = h('div', { class: 'stack' });
  // m.lineup on sama olio kuin tilassa, joten muutokset tallentuvat suoraan.
  wrap.append(renderLineupEditor(m.lineup, (fn) => update(fn)));

  wrap.append(h('hr', { class: 'sep' }));
  wrap.append(h('div', { class: 'btn-row' },
    h('button', { class: 'btn sm', style: 'flex:1', onclick: () => openTemplatePicker(m) }, 'Hae pohjasta'),
    h('button', { class: 'btn sm', style: 'flex:1', onclick: () => saveAsTemplate(m) }, 'Tallenna pohjaksi')));
  wrap.append(h('div', { class: 'btn-row' },
    h('button', { class: 'btn', style: 'flex:1', onclick: () => previewLineupImage(m) }, 'Näytä kuvana'),
    h('button', { class: 'btn primary', style: 'flex:1', onclick: () => shareLineup(m) }, 'Jaa kokoonpano')));

  return wrap;
}

function openTemplatePicker(m) {
  sheet('Hae kokoonpanopohjasta', (body, close) => {
    const lineups = getState().lineups;
    if (!lineups.length) {
      body.append(h('p', { class: 'muted', text: 'Ei tallennettuja pohjia. Luo pohja Kokoonpanot-välilehdellä.' }));
      return;
    }
    for (const l of lineups) {
      const f = getFormation(l.lineup.formation);
      body.append(h('button', {
        class: 'list-item',
        onclick: () => {
          updateMatch(m.id, { lineup: cloneLineup(lineupById(l.id).lineup) });
          close();
          toast('Kokoonpano haettu pohjasta');
        },
      },
        h('span', { class: 'grow' },
          h('div', { class: 'bold', text: l.name }),
          h('div', { class: 'tiny muted', text: `${f.name} · ${l.lineup.slots.filter(Boolean).length}/${f.slots.length} pelaajaa` }))));
    }
  });
}

function saveAsTemplate(m) {
  sheet('Tallenna kokoonpanopohjaksi', (body, close) => {
    const nameI = h('input', {
      type: 'text',
      value: `${getFormation(m.lineup.formation).name} vs ${m.opponent || fmtDate(m.date)}`,
      placeholder: 'Pohjan nimi',
    });
    body.append(
      h('label', { class: 'field' }, h('span', { text: 'Nimi' }), nameI),
      h('button', {
        class: 'btn primary',
        onclick: () => {
          const name = nameI.value.trim() || 'Kokoonpano';
          const l = addLineup(name, m.lineup.formation);
          update((st) => {
            const t = st.lineups.find((x) => x.id === l.id);
            t.lineup = cloneLineup(m.lineup);
          });
          close();
          toast('Pohja tallennettu');
        },
      }, 'Tallenna pohja'));
  });
}

/* ---------- Ottelun video ---------- */

function videoBlock(m) {
  const video = videoInfo(m.videoUrl);
  const wrap = h('div', { class: 'stack', style: 'margin-top:16px' });

  if (!video) {
    wrap.append(h('button', { class: 'btn', onclick: () => openVideoSheet(m) }, 'Lisää videolinkki'));
    return wrap;
  }

  wrap.append(h('a', {
    class: 'btn primary', href: video.url, target: '_blank', rel: 'noopener noreferrer',
  }, video.known ? `▶︎ Katso ${video.service}-tallenne` : '▶︎ Katso ottelun tallenne'));
  wrap.append(h('div', { class: 'row between' },
    h('span', { class: 'tiny muted ellip', text: video.host }),
    h('button', { class: 'btn sm ghost', onclick: () => openVideoSheet(m) }, 'Muokkaa linkkiä')));
  return wrap;
}

function openVideoSheet(m) {
  sheet('Ottelun video', (body, close) => {
    const input = h('input', {
      type: 'text', value: m.videoUrl || '', inputmode: 'url', autocomplete: 'off',
      placeholder: 'https://app.veo.co/matches/...',
    });

    add(body,
      h('p', { class: 'small muted', text: 'Liitä ottelun tallenteen osoite, esimerkiksi Veosta. Linkki avautuu uuteen välilehteen – video toistetaan palvelun omassa sovelluksessa.' }),
      h('label', { class: 'field' }, h('span', { text: 'Videolinkki' }), input),
      h('button', {
        class: 'btn primary',
        onclick: () => {
          const value = input.value.trim();
          if (value && !videoInfo(value)) {
            toast('Videolinkin pitää alkaa https://');
            input.focus();
            return;
          }
          updateMatch(m.id, { videoUrl: value });
          close();
          toast(value ? 'Videolinkki tallennettu' : 'Videolinkki poistettu');
        },
      }, 'Tallenna'),
      m.videoUrl ? h('button', {
        class: 'btn danger', style: 'margin-top:10px',
        onclick: () => { updateMatch(m.id, { videoUrl: '' }); close(); toast('Videolinkki poistettu'); },
      }, 'Poista linkki') : null);

    setTimeout(() => input.focus(), 60);
  });
}

/* ---------- Kokoonpanon jakaminen ---------- */

function lineupText(m) {
  const st = getState();
  const f = getFormation(m.lineup.formation);
  const who = (id) => {
    const p = playerById(id);
    if (!p) return '–';
    return `${p.number != null ? p.number + ' ' : ''}${p.name}`;
  };
  const lines = [
    `${m.team || st.team.name || 'Oma joukkue'} ${m.home ? 'vs' : '@'} ${m.opponent || 'vastustaja'}`,
    `${fmtDate(m.date)} klo ${m.time}${m.venue ? ' · ' + m.venue : ''}`,
    `Kokoonpano ${f.name}`,
    '',
  ];
  f.slots.forEach((slot, i) => {
    const pid = m.lineup.slots[i];
    lines.push(`${slot.pos.padEnd(4, ' ')}${pid ? who(pid) : '(avoin)'}`);
  });
  if (m.lineup.bench.length) lines.push('', `Vaihdot: ${m.lineup.bench.map(who).join(', ')}`);
  if ((m.lineup.staff || []).length) {
    const staff = m.lineup.staff
      .map((id) => staffById(id))
      .filter(Boolean)
      .map((person) => `${person.name} (${STAFF_ROLES[person.role] || 'toimihenkilö'})`);
    if (staff.length) lines.push('', `Valmennus: ${staff.join(', ')}`);
  }
  // Poissaolijat ovat mielekkäitä vasta kun ryhmä on valittu.
  const squadPicked = m.lineup.slots.filter(Boolean).length + m.lineup.bench.length;
  const absent = squadPicked ? absentIds(m.lineup) : [];
  if (absent.length) lines.push('', `Poissa: ${absent.map(who).join(', ')}`);
  if (m.notes) lines.push('', m.notes);
  return lines.join('\n');
}

async function shareLineup(m) {
  const text = lineupText(m);
  const title = `Kokoonpano – ${m.opponent || 'ottelu'}`;

  // Kuva kenttäkokoonpanosta jaetaan tekstin mukana, jos laite tukee sitä.
  let file = null;
  try {
    file = await lineupImageFile(m);
  } catch (e) {
    console.warn('Kokoonpanokuvaa ei voitu piirtää:', e);
  }

  try {
    if (file && navigator.canShare?.({ files: [file] })) {
      await navigator.share({ title, text, files: [file] });
      return;
    }
    if (navigator.share) { await navigator.share({ title, text }); return; }
  } catch (e) {
    if (e && e.name === 'AbortError') return;
  }
  openShareSheet(m, text, file);
}

/** Varasuunnitelma, kun laite ei osaa jakaa: kuva ja teksti talteen käsin. */
function openShareSheet(m, text, file) {
  sheet('Jaa kokoonpano', (body) => {
    const url = file ? URL.createObjectURL(file) : null;
    if (url) {
      body.append(h('img', {
        src: url, alt: 'Kokoonpano kentällä',
        style: 'width:100%;border-radius:14px;border:1px solid var(--line)',
      }));
      body.append(h('a', {
        class: 'btn primary', style: 'margin:12px 0', href: url, download: file.name,
      }, 'Tallenna kuva'));
      body.append(h('p', { class: 'tiny muted', text: 'Voit myös painaa kuvaa pitkään ja tallentaa sen kuviin.' }));
    }
    const ta = h('textarea', { style: 'min-height:220px;font-family:ui-monospace,monospace;font-size:13px', text });
    body.append(h('button', {
      class: 'btn', onclick: async () => {
        try {
          await navigator.clipboard.writeText(text);
          toast('Kokoonpano kopioitu leikepöydälle');
        } catch { ta.focus(); ta.select(); }
      },
    }, 'Kopioi teksti'), ta);
  });
}

/** Näyttää kokoonpanokuvan esikatseluna omassa paneelissaan. */
function previewLineupImage(m) {
  const src = lineupDataUrl(m);
  sheet('Kokoonpanokuva', (body) => {
    body.append(h('img', {
      src, alt: 'Kokoonpano kentällä',
      style: 'width:100%;border-radius:14px;border:1px solid var(--line)',
    }));
    body.append(h('p', { class: 'tiny muted', style: 'margin-top:10px',
      text: 'Sama kuva lähtee mukaan, kun jaat kokoonpanon.' }));
  });
}

/* ---------- Tulos ---------- */

function resultTab(m) {
  const wrap = h('div', { class: 'stack' });

  if (!m.result) {
    wrap.append(h('div', { class: 'empty' },
      h('span', { class: 'big' }, icon('note', 30)),
      h('p', { text: 'Ottelua ei ole vielä pelattu.' }),
      h('p', { class: 'small', text: 'Kirjaa lopputulos ja maalintekijät, kun ottelu on pelattu.' })));
    wrap.append(h('button', {
      class: 'btn primary',
      onclick: () => updateMatch(m.id, {
        result: { gf: 0, ga: 0, events: [], rating: null, ratingMax: RATING_MAX, notes: '' },
      }),
    }, '＋ Kirjaa tulos'));
    return wrap;
  }

  const r = m.result;
  const setScore = (key, delta) => updateMatch(m.id, {
    result: { ...r, [key]: Math.max(0, (r[key] || 0) + delta) },
  });

  const counter = (label, key) => h('div', { class: 'card center', style: 'flex:1' },
    h('div', { class: 'tiny muted bold ellip', text: label }),
    h('div', { class: 'row', style: 'justify-content:center;gap:14px;margin-top:6px' },
      h('button', { class: 'iconbtn', onclick: () => setScore(key, -1) }, '−'),
      h('span', { style: 'font-size:32px;font-weight:800;min-width:38px;font-variant-numeric:tabular-nums', text: String(r[key] || 0) }),
      h('button', { class: 'iconbtn', onclick: () => setScore(key, 1) }, '＋')));

  wrap.append(h('div', { class: 'row', style: 'gap:10px;align-items:stretch' },
    counter(m.home ? (getState().team.name || 'Me') : (m.opponent || 'Vastustaja'), m.home ? 'gf' : 'ga'),
    counter(m.home ? (m.opponent || 'Vastustaja') : (getState().team.name || 'Me'), m.home ? 'ga' : 'gf')));

  const outcome = r.gf > r.ga ? ['win', 'Voitto'] : r.gf === r.ga ? ['draw', 'Tasapeli'] : ['loss', 'Tappio'];
  wrap.append(h('div', { class: 'center' }, h('span', { class: `badge ${outcome[0]}`, text: outcome[1] })));

  wrap.append(videoBlock(m));

  const events = matchEvents(m);
  wrap.append(h('div', { class: 'section-title', text: `Ottelun tapahtumat (${events.length})` }));
  // Tapahtumia voi korjata myös jälkikäteen: pelaajat, aika ja poisto.
  wrap.append(eventList(m, (fn) => update(() => fn(matchById(m.id))), { editable: true }));
  wrap.append(h('p', { class: 'tiny muted center', style: 'margin:4px 0 0',
    text: events.length
      ? 'Napauta tapahtumaa muokataksesi pelaajia ja aikaa tai poistaaksesi sen.'
      : 'Tapahtumat kirjataan Seuranta-välilehdellä ottelun aikana.' }));

  wrap.append(coachReview(m));

  wrap.append(h('button', {
    class: 'btn danger',
    onclick: async () => {
      if (await confirmSheet('Poista tulos', 'Tulos ja maalit poistetaan. Ottelu palaa tuleviin tapahtumiin.')) {
        updateMatch(m.id, { result: null });
        toast('Tulos poistettu');
      }
    },
  }, 'Poista tulos'));

  return wrap;
}

/* ---------- Valmentajan arvio ---------- */

/**
 * Ottelun arvosana kouluasteikolla 4–10 ja sanallinen analyysi.
 * Kokonaisluku napautetaan suoraan, puolikkaat ±0,5-painikkeilla.
 */
function coachReview(m) {
  const r = m.result;
  const rating = typeof r.rating === 'number' ? r.rating : null;
  const wrap = h('div', { class: 'stack', style: 'gap:8px' });

  wrap.append(h('div', { class: 'section-title', style: 'margin-bottom:0', text: 'Valmentajan arvio' }));

  const setRating = (value) => updateMatch(m.id, {
    result: {
      ...matchById(m.id).result,
      rating: value === null ? null : clampRating(value),
      ratingMax: RATING_MAX,
    },
  });

  const grades = h('div', { class: 'grades' });
  for (let g = RATING_MIN; g <= RATING_MAX; g++) {
    grades.append(h('button', {
      class: `grade${rating !== null && Math.floor(rating) === g ? ' on' : ''}`,
      'aria-label': `${g} – ${RATINGS[g]}`,
      'aria-pressed': rating !== null && Math.floor(rating) === g ? 'true' : 'false',
      // Saman kokonaisluvun napautus uudestaan poistaa arvosanan.
      onclick: () => setRating(rating === g ? null : g),
      text: String(g),
    }));
  }

  const nudge = (delta) => h('button', {
    class: 'btn sm ghost', style: 'flex:1',
    disabled: rating === null
      || (delta < 0 && rating <= RATING_MIN) || (delta > 0 && rating >= RATING_MAX),
    onclick: () => setRating(rating + delta),
  }, `${delta > 0 ? '＋' : '−'} ${fmtRating(Math.abs(delta))}`);

  wrap.append(h('div', { class: 'card' },
    h('div', { class: 'row between' },
      h('span', { class: 'small muted', text: rating !== null ? ratingLabel(rating) : 'Ei arvosanaa' }),
      h('span', {
        class: 'tnum',
        style: `font-family:var(--display);font-size:30px;font-weight:800;${rating === null ? 'color:var(--ink-3)' : 'color:var(--amber)'}`,
        text: rating !== null ? fmtRating(rating) : '–',
      })),
    grades,
    h('div', { class: 'btn-row', style: 'margin-top:8px' },
      nudge(-RATING_STEP),
      nudge(RATING_STEP),
      h('button', {
        class: 'btn sm ghost', style: 'flex:1',
        disabled: rating === null,
        onclick: () => setRating(null),
      }, 'Poista')),
    h('div', { class: 'tiny muted center', style: 'margin-top:8px',
      text: 'Asteikko 4–10. Puolikkaat säädetään ±0,5-painikkeilla.' })));

  const notesI = h('textarea', {
    rows: 5,
    placeholder: 'Miten ottelu meni? Onnistumiset, kehityskohteet, huomiot pelaajista.',
    text: r.notes || '',
  });
  // Tallennus ilman uudelleenpiirtoa: muuten kentästä pois vievä napautus
  // korvaisi juuri painetun painikkeen eikä painallus menisi perille.
  notesI.addEventListener('change', () => updateMatch(m.id, {
    result: { ...matchById(m.id).result, notes: notesI.value },
  }, { silent: true }));
  wrap.append(h('label', { class: 'field' },
    h('span', { text: 'Kommentti tai analyysi' }), notesI,
    h('span', { class: 'tiny muted', text: 'Tallentuu automaattisesti, kun siirryt pois kentästä.' })));

  return wrap;
}

/* ---------- Tiedot ---------- */

function infoTab(m) {
  const wrap = h('div', { class: 'stack' });
  const row = (k, v) => h('div', { class: 'card row between' },
    h('span', { class: 'small muted', text: k }), h('span', { class: 'bold ellip', text: v || '–' }));

  wrap.append(
    row('Vastustaja', m.opponent),
    row('Oma joukkue', m.team),
    row('Päivä', fmtDate(m.date)),
    row('Alkaa', m.time),
    row('Paikka', m.venue),
    row('Tyyppi', TYPES[m.type] || m.type),
    row('Koti/vieras', m.home ? 'Kotiottelu' : 'Vierasottelu'));

  const video = videoInfo(m.videoUrl);
  wrap.append(h('div', { class: 'card row between' },
    h('span', { class: 'small muted', text: 'Video' }),
    video
      ? h('a', { class: 'bold ellip', href: video.url, target: '_blank', rel: 'noopener noreferrer', style: 'color:var(--accent)', text: `${video.service} ↗` })
      : h('span', { class: 'bold', text: '–' })));

  if (m.notes) {
    wrap.append(h('div', { class: 'section-title', text: 'Muistiinpanot' }));
    wrap.append(h('div', { class: 'card small', text: m.notes }));
  }

  wrap.append(h('button', { class: 'btn', style: 'margin-top:10px', onclick: () => openMatchSheet(m) }, 'Muokkaa tapahtumaa'));
  wrap.append(h('button', {
    class: 'btn danger',
    onclick: async () => {
      if (await confirmSheet('Poista tapahtuma', 'Tapahtuma, sen kokoonpano ja tulos poistetaan pysyvästi.')) {
        removeMatch(m.id);
        toast('Tapahtuma poistettu');
        navigate('#/ottelut');
      }
    },
  }, 'Poista tapahtuma'));

  return wrap;
}
