// Peliaika: ottelukello, vaihdot ja pelaajakohtainen peliaika.
import { h, add, sheet, toast, confirmSheet } from '../ui.js';
import {
  getState, matchById, update, playerById, sortedPlayers,
  startTiming, pauseTiming, endTiming, resetTiming, substitute,
  removeTimingEvents, moveTimingEvents, ensureTiming,
} from '../store.js';
import {
  clockSeconds, playingTimes, onField, substitutions, periodOf, totalSeconds,
  fmtClock, fmtMinutes,
} from '../timing.js';

// Kello päivittyy sekunnin välein ilman koko näkymän uudelleenpiirtoa.
let ticker = null;

export function playtimeTab(match) {
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

  wrap.append(h('div', { class: 'card center stack', style: 'gap:10px' },
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

  /* --- Kentällä ja penkillä --- */
  const field = onField(timing, at());
  const squad = [...match.lineup.slots.filter(Boolean), ...match.lineup.bench];
  const times = playingTimes(timing, at());
  const bench = squad.filter((id) => !field.has(id));
  const leastPlayed = [...bench].sort((a, b) => (times.get(a) || 0) - (times.get(b) || 0))[0];

  const row = (playerId, isOn) => {
    const p = playerById(playerId);
    if (!p) return null;
    const timeEl = h('span', { class: 'tnum bold', text: fmtMinutes(times.get(playerId) || 0) });
    live.push({ el: timeEl, playerId });
    return h('div', { class: 'card row' },
      h('span', { class: `numchip${isOn ? ' accent' : ''}`, text: p.number ?? '–' }),
      h('span', { class: 'grow' },
        h('div', { class: 'bold ellip', text: p.name }),
        !isOn && playerId === leastPlayed
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
      .sort((a, b) => (times.get(a) || 0) - (times.get(b) || 0))
      .forEach((id) => add(wrap, row(id, false)));
  }

  /* --- Vaihtoloki --- */
  const subs = substitutions(timing);
  wrap.append(h('div', { class: 'section-title', text: `Vaihdot (${subs.length})` }));
  if (!subs.length) {
    wrap.append(h('div', { class: 'card small muted', text: 'Ei vielä vaihtoja.' }));
  } else {
    for (const s of subs) {
      wrap.append(h('button', {
        class: 'card row', onclick: () => openEditSub(match, s, commit),
      },
        h('span', { class: 'numchip tnum', style: 'width:auto;padding:0 8px', text: fmtClock(s.at) }),
        h('span', { class: 'grow small' },
          s.inId ? h('div', { class: 'ellip', text: `▲ ${playerById(s.inId)?.name || '–'}` }) : null,
          s.outId ? h('div', { class: 'ellip muted', text: `▼ ${playerById(s.outId)?.name || '–'}` }) : null),
        h('span', { class: 'muted', text: '›' })));
    }
  }

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

export { fmtMinutes };
void getState;
void sortedPlayers;
