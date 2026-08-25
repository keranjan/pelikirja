// Yksittäisen ottelun näkymä: kokoonpano, tulos ja tiedot.
import { h, sheet, toast, confirmSheet, fmtDate, videoInfo } from '../ui.js';
import {
  getState, matchById, updateMatch, removeMatch, update, uid,
  sortedPlayers, playerById, playerName, cloneLineup, addLineup, lineupById,
} from '../store.js';
import { getFormation } from '../formations.js';
import { renderLineupEditor } from './pitch.js';
import { openMatchSheet } from './matches.js';
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
  body.append(h('div', { class: 'segmented' },
    ...[['kokoonpano', 'Kokoonpano'], ['tulos', 'Tulos'], ['tiedot', 'Tiedot']].map(([k, label]) =>
      h('button', { class: tab === k ? 'on' : '', onclick: () => { tab = k; navigate(`#/ottelu/${id}`); } }, label))));

  if (tab === 'kokoonpano') body.append(lineupTab(m));
  else if (tab === 'tulos') body.append(resultTab(m));
  else body.append(infoTab(m));

  return {
    title: `${m.home ? 'vs' : '@'} ${m.opponent || 'Vastustaja'}`,
    subtitle: `${fmtDate(m.date)} klo ${m.time}`,
    back: '#/ottelut',
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
    h('button', { class: 'btn sm', style: 'flex:1', onclick: () => openTemplatePicker(m) }, '📋 Hae pohjasta'),
    h('button', { class: 'btn sm', style: 'flex:1', onclick: () => saveAsTemplate(m) }, '💾 Tallenna pohjaksi')));
  wrap.append(h('button', { class: 'btn', onclick: () => shareLineup(m) }, '📤 Jaa kokoonpano'));

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
    wrap.append(h('button', { class: 'btn', onclick: () => openVideoSheet(m) }, '🎬 Lisää videolinkki'));
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

    body.append(
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
    `${st.team.name || 'Oma joukkue'} ${m.home ? 'vs' : '@'} ${m.opponent || 'vastustaja'}`,
    `${fmtDate(m.date)} klo ${m.time}${m.venue ? ' · ' + m.venue : ''}`,
    `Kokoonpano ${f.name}`,
    '',
  ];
  f.slots.forEach((slot, i) => {
    const pid = m.lineup.slots[i];
    lines.push(`${slot.pos.padEnd(4, ' ')}${pid ? who(pid) : '(avoin)'}`);
  });
  if (m.lineup.bench.length) lines.push('', `Vaihdot: ${m.lineup.bench.map(who).join(', ')}`);
  if ((m.lineup.unavailable || []).length) lines.push(`Poissa: ${m.lineup.unavailable.map(who).join(', ')}`);
  if (m.notes) lines.push('', m.notes);
  return lines.join('\n');
}

async function shareLineup(m) {
  const text = lineupText(m);
  const title = `Kokoonpano – ${m.opponent || 'ottelu'}`;
  try {
    if (navigator.share) { await navigator.share({ title, text }); return; }
    await navigator.clipboard.writeText(text);
    toast('Kokoonpano kopioitu leikepöydälle');
    return;
  } catch (e) {
    if (e && e.name === 'AbortError') return;
  }
  sheet('Kokoonpano tekstinä', (body) => {
    const ta = h('textarea', { style: 'min-height:340px;font-family:ui-monospace,monospace;font-size:13px', text });
    body.append(h('p', { class: 'tiny muted', text: 'Kopioi teksti ja liitä se vaikka joukkueen WhatsApp-ryhmään.' }), ta);
    setTimeout(() => { ta.focus(); ta.select(); }, 60);
  });
}

/* ---------- Tulos ---------- */

function resultTab(m) {
  const wrap = h('div', { class: 'stack' });

  if (!m.result) {
    wrap.append(h('div', { class: 'empty' },
      h('span', { class: 'big', text: '📝' }),
      h('p', { text: 'Ottelua ei ole vielä pelattu.' }),
      h('p', { class: 'small', text: 'Kirjaa lopputulos ja maalintekijät, kun ottelu on pelattu.' })));
    wrap.append(h('button', {
      class: 'btn primary',
      onclick: () => updateMatch(m.id, { result: { gf: 0, ga: 0, events: [], notes: '' } }),
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

  wrap.append(h('div', { class: 'section-title', text: `Maalit (${r.events.length})` }));
  if (!r.events.length) {
    wrap.append(h('div', { class: 'card small muted', text: 'Ei kirjattuja maalintekijöitä.' }));
  } else {
    const sorted = [...r.events].sort((a, b) => (a.minute ?? 999) - (b.minute ?? 999));
    for (const ev of sorted) {
      wrap.append(h('div', { class: 'card row' },
        h('span', { class: 'numchip', text: ev.minute != null ? `${ev.minute}'` : '–' }),
        h('span', { class: 'grow' },
          h('div', { class: 'bold ellip', text: `⚽ ${playerName(ev.scorerId)}` }),
          ev.assistId ? h('div', { class: 'tiny muted ellip', text: `Syöttö: ${playerName(ev.assistId)}` }) : null),
        h('button', {
          class: 'btn sm ghost',
          onclick: () => updateMatch(m.id, { result: { ...r, events: r.events.filter((x) => x.id !== ev.id) } }),
        }, '✕')));
    }
  }
  wrap.append(h('button', { class: 'btn', onclick: () => openGoalSheet(m) }, '＋ Lisää maali'));

  const notesI = h('textarea', { placeholder: 'Ottelumuistiinpanot', text: r.notes || '' });
  notesI.addEventListener('change', () => updateMatch(m.id, { result: { ...matchById(m.id).result, notes: notesI.value } }));
  wrap.append(h('label', { class: 'field', style: 'margin-top:16px' }, h('span', { text: 'Ottelumuistiinpanot' }), notesI));

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

function openGoalSheet(m) {
  sheet('Lisää maali', (body, close) => {
    const lu = m.lineup;
    const involved = [...lu.slots.filter(Boolean), ...lu.bench];
    const all = sortedPlayers(getState().players);
    const ordered = [
      ...all.filter((p) => involved.includes(p.id)),
      ...all.filter((p) => !involved.includes(p.id)),
    ];

    const minuteI = h('input', { type: 'number', placeholder: 'esim. 34', inputmode: 'numeric', min: '0', max: '130' });
    const scorerSel = h('select', {}, ...ordered.map((p) =>
      h('option', { value: p.id, text: `${p.number != null ? p.number + '. ' : ''}${p.name}` })));
    const assistSel = h('select', {},
      h('option', { value: '', text: 'Ei syöttäjää' }),
      ...ordered.map((p) => h('option', { value: p.id, text: `${p.number != null ? p.number + '. ' : ''}${p.name}` })));

    if (!ordered.length) {
      body.append(h('p', { class: 'muted', text: 'Lisää ensin pelaajia.' }));
      return;
    }

    body.append(
      h('label', { class: 'field' }, h('span', { text: 'Maalintekijä' }), scorerSel),
      h('label', { class: 'field' }, h('span', { text: 'Syöttäjä' }), assistSel),
      h('label', { class: 'field' }, h('span', { text: 'Minuutti' }), minuteI),
      h('button', {
        class: 'btn primary',
        onclick: () => {
          const r = matchById(m.id).result;
          const ev = {
            id: uid(),
            scorerId: scorerSel.value,
            assistId: assistSel.value || null,
            minute: minuteI.value === '' ? null : Number(minuteI.value),
          };
          updateMatch(m.id, { result: { ...r, events: [...r.events, ev], gf: (r.gf || 0) + 1 } });
          close();
          toast('Maali kirjattu');
        },
      }, 'Lisää maali'));
  });
}

/* ---------- Tiedot ---------- */

function infoTab(m) {
  const wrap = h('div', { class: 'stack' });
  const row = (k, v) => h('div', { class: 'card row between' },
    h('span', { class: 'small muted', text: k }), h('span', { class: 'bold ellip', text: v || '–' }));

  wrap.append(
    row('Vastustaja', m.opponent),
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

  wrap.append(h('button', { class: 'btn', style: 'margin-top:10px', onclick: () => openMatchSheet(m) }, '✏️ Muokkaa tapahtumaa'));
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
