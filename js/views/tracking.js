// Otteluseuranta: ottelukello, maalit, kortit, vaihdot ja peliaika.
import { h, add, sheet, toast, confirmSheet, pressable } from '../ui.js';
import {
  matchById, update, playerById, getState,
  startTiming, pauseTiming, endTiming, resetTiming, substitute,
  removeTimingEvents, moveTimingEvents, ensureTiming, recordGoal, recordCard,
  removeResultEvent,
} from '../store.js';
import {
  clockSeconds, playingTimes, onField, substitutions, periodOf, totalSeconds,
  matchEvents, goalsFrom, CARDS, fmtClock, fmtMinutes,
} from '../timing.js';

// Kello päivittyy sekunnin välein ilman koko näkymän uudelleenpiirtoa.
let ticker = null;

export function trackingTab(match) {
  clearInterval(ticker);
  const wrap = h('div', { class: 'stack' });
  const timing = match.timing;
  const commit = (fn) => update(() => fn(matchById(match.id)));

  if (!timing || (timing.status === 'idle' && !timing.events.length)) {
    return startCard(match, wrap, commit);
  }

  const live = [];                    // sekunnin välein päivittyvät solmut
  const at = () => clockSeconds(matchById(match.id)?.timing);

  /* --- Kello --- */
  const clockEl = h('div', { class: 'clock', text: fmtClock(at()) });
  const periodEl = h('div', { class: 'tiny muted bold', text: periodText(at(), timing) });
  const running = timing.status === 'running';

  // Unohtunut kello: varoitus, jos aikaa on kulunut selvästi otteluaikaa enemmän.
  const forgotten = timing.status === 'running' && at() > totalSeconds(timing) + 30 * 60;

  const score = goalsFrom(match);
  const teamName = getState().team.name || 'Me';

  wrap.append(h('div', { class: 'card center stack', style: 'gap:10px' },
    h('div', { class: 'row', style: 'justify-content:center;gap:14px' },
      h('span', { class: 'small bold ellip', style: 'max-width:38%', text: match.home ? teamName : (match.opponent || 'Vastustaja') }),
      h('span', { class: 'score tnum', text: match.home ? `${score.us}–${score.them}` : `${score.them}–${score.us}` }),
      h('span', { class: 'small bold ellip', style: 'max-width:38%', text: match.home ? (match.opponent || 'Vastustaja') : teamName })),
    periodEl,
    clockEl,
    forgotten
      ? h('span', { class: 'badge draw', text: 'Kello on käynyt pitkään – muista päättää ottelu' })
      : null,
    timing.status === 'ended'
      ? h('span', { class: 'badge', text: 'Ottelu päättynyt' })
      : h('div', { class: 'btn-row' },
          h('button', {
            class: running ? 'btn' : 'btn primary',
            onclick: () => commit(running ? pauseTiming : startTiming),
          }, running ? 'Tauko' : (timing.status === 'paused' ? 'Jatka' : 'Käynnistä')),
          h('button', {
            class: 'btn ghost',
            onclick: async () => {
              if (await confirmSheet('Päätä ottelu', 'Kello pysähtyy ja peliajat jäävät talteen.', 'Päätä')) {
                commit(endTiming);
              }
            },
          }, 'Päätä ottelu'))));

  /* --- Tapahtumien kirjaus --- */
  if (timing.status !== 'ended') {
    wrap.append(h('div', { class: 'btn-row' },
      pressable(h('button', { class: 'btn action' }, '⚽ Maali'), () => openGoalSheet(match, commit)),
      pressable(h('button', { class: 'btn action' }, '🟨 Kortti'), () => openCardSheet(match, commit))));
  }

  /* --- Kentällä ja penkillä --- */
  const field = onField(timing, at());
  const squad = [...match.lineup.slots.filter(Boolean), ...match.lineup.bench];
  const times = playingTimes(timing, at());
  const bench = squad.filter((id) => !field.has(id));
  // Vähiten pelannut koko ryhmästä – myös kentällä oleva voi olla vähiten
  // pelannut, joten merkkiä ei voi päätellä pelkästä vaihtopenkistä. Tasatilanne
  // jätetään merkitsemättä, koska silloin merkki ei kertoisi mitään.
  const secondsOf = (id) => times.get(id) || 0;
  const least = squad.length ? Math.min(...squad.map(secondsOf)) : null;
  const atLeast = squad.filter((id) => secondsOf(id) === least);
  const leastPlayed = atLeast.length === 1 ? atLeast[0] : null;

  const row = (playerId, isOn) => {
    const p = playerById(playerId);
    if (!p) return null;
    const timeEl = h('span', { class: 'tnum bold', text: fmtMinutes(times.get(playerId) || 0) });
    live.push({ el: timeEl, playerId });
    return h('div', { class: 'card row' },
      h('span', { class: `numchip${isOn ? ' accent' : ''}`, text: p.number ?? '–' }),
      h('span', { class: 'grow' },
        h('div', { class: 'bold ellip', text: p.name }),
        playerId === leastPlayed
          ? h('span', { class: 'badge draw', text: 'vähiten peliaikaa' })
          : null),
      timeEl,
      h('button', {
        class: isOn ? 'btn sm' : 'btn sm primary',
        disabled: timing.status === 'ended',
        onclick: () => openSwap(match, playerId, isOn, commit),
      }, isOn ? 'Vaihda' : 'Kentälle'));
  };

  wrap.append(h('div', { class: 'section-title', text: `Kentällä (${field.size})` }));
  const byNumber = (a, b) => (playerById(a)?.number ?? 999) - (playerById(b)?.number ?? 999);
  const onList = [...field].filter((id) => squad.includes(id)).sort(byNumber);
  if (!onList.length) {
    wrap.append(h('div', { class: 'card small muted', text: 'Ei pelaajia kentällä.' }));
  } else {
    onList.forEach((id) => add(wrap, row(id, true)));
  }

  wrap.append(h('div', { class: 'section-title', text: `Vaihtopenkillä (${bench.length})` }));
  if (!bench.length) {
    wrap.append(h('div', { class: 'card small muted', text: 'Ei vaihtopelaajia. Lisää heidät kokoonpanoon.' }));
  } else {
    [...bench]
      .sort((a, b) => secondsOf(a) - secondsOf(b))
      .forEach((id) => add(wrap, row(id, false)));
  }

  /* --- Tapahtumat --- */
  wrap.append(h('div', { class: 'section-title', text: 'Tapahtumat' }));
  wrap.append(eventList(match, commit, { editable: true }));

  wrap.append(h('button', {
    class: 'btn danger', style: 'margin-top:12px',
    onclick: async () => {
      if (await confirmSheet('Nollaa peliaika', 'Kello, vaihdot ja peliajat poistetaan tästä ottelusta.', 'Nollaa')) {
        commit(resetTiming);
      }
    },
  }, 'Nollaa peliaikaseuranta'));

  /* --- Sekuntipäivitys --- */
  if (timing.status === 'running') {
    ticker = setInterval(() => {
      if (!document.body.contains(clockEl)) { clearInterval(ticker); return; }
      const live_ = matchById(match.id);
      if (!live_) { clearInterval(ticker); return; }
      const seconds = clockSeconds(live_.timing);
      clockEl.textContent = fmtClock(seconds);
      periodEl.textContent = periodText(seconds, live_.timing);
      const current = playingTimes(live_.timing, seconds);
      for (const item of live) item.el.textContent = fmtMinutes(current.get(item.playerId) || 0);
    }, 1000);
  }

  return wrap;
}

const periodText = (seconds, timing) => {
  const total = totalSeconds(timing);
  if (seconds >= total) return 'Peliaika täynnä';
  return `${periodOf(seconds, timing)}. jakso / ${timing.periods}`;
};

/* ---------- Aloitusnäkymä ---------- */

function startCard(match, wrap, commit) {
  const starters = match.lineup.slots.filter(Boolean).length;
  const timing = ensureTimingView(match);

  wrap.append(h('div', { class: 'card stack center' },
    h('div', { class: 'eyebrow', text: 'Peliaika' }),
    h('p', { class: 'small muted', style: 'margin:6px 0 0' },
      starters
        ? `Avauskokoonpanossa on ${starters} pelaajaa. Kello käynnistyy alkuvihellyksestä ja merkitsee heidät kentälle.`
        : 'Valitse ensin avauskokoonpano Kokoonpano-välilehdellä.'),
    h('div', { class: 'field-row', style: 'margin-top:14px' },
      h('label', { class: 'field' }, h('span', { text: 'Jaksoja' }),
        h('input', { type: 'number', id: 'periods', value: timing.periods, min: '1', max: '4', inputmode: 'numeric' })),
      h('label', { class: 'field' }, h('span', { text: 'Jakson pituus (min)' }),
        h('input', { type: 'number', id: 'plen', value: timing.periodMinutes, min: '5', max: '60', inputmode: 'numeric' }))),
    h('button', {
      class: 'btn primary', disabled: !starters,
      onclick: () => {
        const periods = Number(document.getElementById('periods').value) || 2;
        const periodMinutes = Number(document.getElementById('plen').value) || 30;
        commit((m) => {
          const t = ensureTiming(m);
          t.periods = Math.max(1, periods);
          t.periodMinutes = Math.max(1, periodMinutes);
          startTiming(m);
        });
      },
    }, 'Käynnistä ottelukello')));

  return wrap;
}

const ensureTimingView = (match) => match.timing || { periods: 2, periodMinutes: 30 };

/* ---------- Vaihdon tekeminen ---------- */

function openSwap(match, playerId, isOn, commit) {
  const person = playerById(playerId);
  const timing = match.timing;
  const field = onField(timing);
  const squad = [...match.lineup.slots.filter(Boolean), ...match.lineup.bench];
  const times = playingTimes(timing);
  const options = isOn
    ? squad.filter((id) => !field.has(id))
    : [...field].filter((id) => squad.includes(id));

  sheet(isOn ? `${person?.name} ulos` : `${person?.name} kentälle`, (body, close) => {
    add(body,
      h('p', { class: 'tiny muted', text: isOn ? 'Kuka tulee tilalle?' : 'Kuka jää pois?' }),
      ...options
        .sort((a, b) => (isOn ? (times.get(a) || 0) - (times.get(b) || 0) : (times.get(b) || 0) - (times.get(a) || 0)))
        .map((id) => {
          const other = playerById(id);
          if (!other) return null;
          return h('button', {
            class: 'list-item',
            onclick: () => {
              commit((m) => substitute(m, isOn ? playerId : id, isOn ? id : playerId));
              close();
              toast('Vaihto kirjattu');
            },
          },
            h('span', { class: 'numchip', text: other.number ?? '–' }),
            h('span', { class: 'grow ellip bold', text: other.name }),
            h('span', { class: 'tiny muted tnum', text: fmtMinutes(times.get(id) || 0) }));
        }),
      options.length ? null : h('p', { class: 'muted', text: 'Ei vaihdettavia pelaajia.' }),
      h('button', {
        class: 'btn ghost', style: 'margin-top:12px',
        onclick: () => {
          commit((m) => substitute(m, isOn ? playerId : null, isOn ? null : playerId));
          close();
          toast(isOn ? 'Pelaaja pois kentältä' : 'Pelaaja kentälle');
        },
      }, isOn ? 'Vain ulos (vajaa joukkue)' : 'Vain sisään'));
  });
}

/* ---------- Vaihdon korjaaminen ---------- */

function openEditSub(match, sub, commit) {
  sheet('Korjaa vaihto', (body, close) => {
    const minuteI = h('input', {
      type: 'number', value: Math.round(sub.at / 60), min: '0', max: '200', inputmode: 'numeric',
    });
    add(body,
      h('p', { class: 'small muted' },
        sub.inId ? `Sisään: ${playerById(sub.inId)?.name || '–'}. ` : '',
        sub.outId ? `Ulos: ${playerById(sub.outId)?.name || '–'}.` : ''),
      h('label', { class: 'field' }, h('span', { text: 'Minuutti' }), minuteI),
      h('button', {
        class: 'btn primary',
        onclick: () => {
          commit((m) => moveTimingEvents(m, sub.ids, (Number(minuteI.value) || 0) * 60));
          close();
          toast('Vaihdon aika korjattu');
        },
      }, 'Tallenna'),
      h('button', {
        class: 'btn danger', style: 'margin-top:10px',
        onclick: () => {
          commit((m) => removeTimingEvents(m, sub.ids));
          close();
          toast('Vaihto poistettu');
        },
      }, 'Poista vaihto'));
  });
}

/* ---------- Tapahtumalista ---------- */

const teamLabel = (match, team) => {
  const own = getState().team.name || 'Oma joukkue';
  return team === 'them' ? (match.opponent || 'Vastustaja') : own;
};

/** Yhteinen tapahtumalista seurantaan ja tuloksiin. */
export function eventList(match, commit, { editable = false } = {}) {
  const events = matchEvents(match);
  if (!events.length) {
    return h('div', { class: 'card small muted', text: 'Ei kirjattuja tapahtumia.' });
  }

  const list = h('div', { class: 'stack', style: 'gap:8px' });
  for (let i = 0; i < events.length; i++) {
    const e = events[i];
    // Vaihto näytetään yhtenä rivinä: sisään tullut ja ulos mennyt yhdessä.
    const next = events[i + 1];
    const pairedSub = e.type === 'out' && next?.type === 'in' && next.at === e.at;
    if (pairedSub) i++;

    const ours = e.team !== 'them';
    // Oman joukkueen maalit korostetaan, jotta ne erottuvat tapahtumalistasta.
    const ourGoal = ours && e.type === 'goal';
    const row = h(editable ? 'button' : 'div', {
      class: `card row event${ours ? '' : ' away'}${ourGoal ? ' ourgoal' : ''}`,
      onclick: editable ? () => openEventSheet(match, e, commit) : null,
    },
      h('span', { class: 'numchip tnum', style: 'width:auto;padding:0 8px', text: fmtClock(e.at) }),
      h('span', { class: 'grow' }, pairedSub ? subText(next.playerId, e.playerId) : eventText(match, e)),
      editable ? h('span', { class: 'muted', text: '›' }) : null);
    list.append(row);
  }
  return list;
}

const subText = (inId, outId) => h('span', {},
  h('div', { class: 'bold ellip', text: `▲ ${playerById(inId)?.name || '–'}` }),
  h('div', { class: 'tiny muted ellip', text: `▼ ${playerById(outId)?.name || '–'}` }));

function eventText(match, e) {
  const name = (id) => playerById(id)?.name || null;

  if (e.type === 'goal') {
    return h('span', {},
      h('div', { class: 'bold ellip', text: `⚽ ${name(e.playerId) || teamLabel(match, e.team)}` }),
      h('div', { class: 'tiny muted ellip', text: e.assistId
        ? `Syöttö: ${name(e.assistId) || '–'}`
        : (e.playerId ? teamLabel(match, e.team) : 'Maali') }));
  }

  if (e.type === 'card') {
    return h('span', {},
      h('div', { class: 'bold ellip', text: `${e.card === 'red' ? '🟥' : '🟨'} ${name(e.playerId) || teamLabel(match, e.team)}` }),
      h('div', { class: 'tiny muted', text: `${CARDS[e.card] || 'Kortti'} · ${teamLabel(match, e.team)}` }));
  }

  const label = e.type === 'in' ? '▲ Kentälle' : '▼ Pois kentältä';
  return h('span', {},
    h('div', { class: 'bold ellip', text: `${label}: ${name(e.playerId) || '–'}` }),
    h('div', { class: 'tiny muted', text: 'Vaihto' }));
}

/* ---------- Maalin ja kortin kirjaus ---------- */

const squadOf = (match) => [...match.lineup.slots.filter(Boolean), ...match.lineup.bench];

function playerPicker(match, { onPick, allowNone, noneLabel }) {
  const rows = [];
  const field = onField(match.timing);
  const squad = squadOf(match);
  const sorted = [...squad].sort((a, b) => {
    const onA = field.has(a) ? 0 : 1, onB = field.has(b) ? 0 : 1;
    if (onA !== onB) return onA - onB;
    return (playerById(a)?.number ?? 999) - (playerById(b)?.number ?? 999);
  });

  for (const id of sorted) {
    const p = playerById(id);
    if (!p) continue;
    rows.push(pressable(h('button', { class: 'list-item' },
      h('span', { class: `numchip${field.has(id) ? ' accent' : ''}`, text: p.number ?? '–' }),
      h('span', { class: 'grow ellip bold', text: p.name }),
      field.has(id) ? h('span', { class: 'badge accent', text: 'kentällä' }) : null), () => onPick(id)));
  }
  if (allowNone) {
    rows.push(pressable(h('button', { class: 'btn ghost', style: 'margin-top:8px' }, noneLabel), () => onPick(null)));
  }
  return rows;
}

function openGoalSheet(match, commit) {
  sheet('Maali', (body, close) => {
    const own = getState().team.name || 'Oma joukkue';
    add(body,
      h('p', { class: 'tiny muted', text: 'Kummalle joukkueelle maali kirjataan?' }),
      pressable(h('button', { class: 'btn primary', style: 'margin-bottom:10px' }, `${own} teki maalin`), () => {
        close();
        openScorerSheet(match, commit);
      }),
      pressable(h('button', { class: 'btn' }, `${match.opponent || 'Vastustaja'} teki maalin`), () => {
        commit((m) => recordGoal(m, { team: 'them' }));
        close();
        toast('Vastustajan maali kirjattu');
      }));
  });
}

function openScorerSheet(match, commit) {
  sheet('Maalintekijä', (body, close) => {
    add(body,
      h('p', { class: 'tiny muted', text: 'Kuka teki maalin?' }),
      ...playerPicker(match, {
        allowNone: true,
        noneLabel: 'Ei tiedossa',
        onPick: (playerId) => {
          close();
          if (!playerId) {
            commit((m) => recordGoal(m, { team: 'us' }));
            toast('Maali kirjattu');
            return;
          }
          openAssistSheet(match, commit, playerId);
        },
      }));
  });
}

function openAssistSheet(match, commit, scorerId) {
  sheet('Syöttäjä', (body, close) => {
    add(body,
      h('p', { class: 'tiny muted', text: `Maalintekijä ${playerById(scorerId)?.name || ''}. Kuka syötti?` }),
      ...playerPicker(match, {
        allowNone: true,
        noneLabel: 'Ei syöttäjää',
        onPick: (assistId) => {
          commit((m) => recordGoal(m, { team: 'us', playerId: scorerId, assistId: assistId === scorerId ? null : assistId }));
          close();
          toast('Maali kirjattu');
        },
      }));
  });
}

function openCardSheet(match, commit) {
  sheet('Kortti', (body, close) => {
    const own = getState().team.name || 'Oma joukkue';
    const pick = (card) => {
      close();
      sheet(CARDS[card], (b2, close2) => {
        add(b2,
          h('p', { class: 'tiny muted', text: 'Kenelle kortti kirjataan?' }),
          ...playerPicker(match, {
            allowNone: false,
            onPick: (playerId) => {
              commit((m) => recordCard(m, { team: 'us', card, playerId }));
              close2();
              toast(`${CARDS[card]} kirjattu`);
            },
          }),
          h('div', { class: 'section-title', text: match.opponent || 'Vastustaja' }),
          pressable(h('button', { class: 'btn' }, `${match.opponent || 'Vastustaja'}: ${CARDS[card].toLowerCase()}`), () => {
            commit((m) => recordCard(m, { team: 'them', card }));
            close2();
            toast(`${CARDS[card]} kirjattu`);
          }));
      });
    };

    add(body,
      h('p', { class: 'tiny muted', text: `Kortin väri. Oman joukkueen kortti kirjataan pelaajalle (${own}).` }),
      pressable(h('button', { class: 'btn', style: 'margin-bottom:10px;border-color:var(--amber);color:var(--amber)' }, '🟨 Keltainen kortti'), () => pick('yellow')),
      pressable(h('button', { class: 'btn', style: 'border-color:var(--red);color:var(--red)' }, '🟥 Punainen kortti'), () => pick('red')));
  });
}

/* ---------- Tapahtuman muokkaus ---------- */

function openEventSheet(match, e, commit) {
  if (e.legacy) {
    sheet('Vanha maalikirjaus', (body, close) => {
      add(body,
        h('p', { class: 'small muted', text: 'Tämä maali on kirjattu ennen otteluseurantaa, joten sen aikaa ei voi muuttaa.' }),
        pressable(h('button', { class: 'btn danger' }, 'Poista maali'), () => {
          commit((m) => removeResultEvent(m, e.id));
          close();
          toast('Maali poistettu');
        }));
    });
    return;
  }

  const subIds = pairedIds(match, e);
  sheet('Tapahtuma', (body, close) => {
    const minuteI = h('input', { type: 'number', value: Math.round(e.at / 60), min: '0', max: '200', inputmode: 'numeric' });
    add(body,
      h('p', { class: 'small muted' }, eventText(match, e)),
      h('label', { class: 'field' }, h('span', { text: 'Minuutti' }), minuteI),
      pressable(h('button', { class: 'btn primary' }, 'Tallenna aika'), () => {
        commit((m) => moveTimingEvents(m, subIds, (Number(minuteI.value) || 0) * 60));
        close();
        toast('Aika korjattu');
      }),
      pressable(h('button', { class: 'btn danger', style: 'margin-top:10px' }, 'Poista tapahtuma'), () => {
        commit((m) => removeTimingEvents(m, subIds));
        close();
        toast('Tapahtuma poistettu');
      }));
  });
}

/** Vaihto poistetaan parina, muut tapahtumat yksin. */
function pairedIds(match, e) {
  if (e.type !== 'in' && e.type !== 'out') return [e.id];
  const pair = (match.timing?.events || []).find((x) =>
    x.id !== e.id && x.at === e.at && (x.type === 'in' || x.type === 'out') && x.type !== e.type);
  return pair ? [e.id, pair.id] : [e.id];
}

/* ---------- Kauden yhteenveto ---------- */

/** Pelaajan kokonaispeliaika sekunteina pelatuista otteluista. */
export function seasonPlayingTime(matches, playerId) {
  let seconds = 0;
  for (const m of matches) {
    if (!m.timing) continue;
    seconds += playingTimes(m.timing, clockSeconds(m.timing)).get(playerId) || 0;
  }
  return seconds;
}
