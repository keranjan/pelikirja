// Kokoonpanoeditori: kenttäkuva, vaihtopenkki ja poissaolot.
import { h, sheet, toast, shortName, initials } from '../ui.js';
import { getFormation, formationsBySize, roleForPosition, POSITIONS } from '../formations.js';
import {
  getState, playerById, sortedPlayers, setFormation, assignToSlot,
  toggleBench, toggleUnavailable, lineupRole,
} from '../store.js';

const pitchLines = () => {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'lines');
  svg.setAttribute('viewBox', '0 0 68 95');
  svg.setAttribute('preserveAspectRatio', 'none');
  svg.innerHTML = `
    <rect x="2" y="2" width="64" height="91" />
    <line x1="2" y1="47.5" x2="66" y2="47.5" />
    <circle cx="34" cy="47.5" r="9" />
    <rect x="14" y="2" width="40" height="14" />
    <rect x="23" y="2" width="22" height="6" />
    <rect x="14" y="79" width="40" height="14" />
    <rect x="23" y="87" width="22" height="6" />`;
  return svg;
};

/**
 * @param {object} lineup   kokoonpano-olio (muokataan commitin sisällä)
 * @param {function} commit commit(fn) -> suorittaa muutoksen ja piirtää näkymän uudelleen
 */
export function renderLineupEditor(lineup, commit) {
  const formation = getFormation(lineup.formation);
  const wrap = h('div', { class: 'stack' });

  /* --- Systeemin valinta --- */
  const select = h('select', {
    onchange: (e) => commit(() => setFormation(lineup, e.target.value)),
  });
  for (const [size, list] of formationsBySize()) {
    const group = h('optgroup', { label: `${size} vs ${size}` });
    for (const f of list) {
      group.append(h('option', { value: f.id, selected: f.id === formation.id, text: f.name }));
    }
    select.append(group);
  }

  const filled = lineup.slots.filter(Boolean).length;
  wrap.append(h('div', { class: 'row' },
    h('div', { class: 'grow' },
      h('div', { class: 'tiny muted bold', text: 'PELISYSTEEMI' }), select),
    h('div', { class: 'center' },
      h('div', { class: 'tiny muted bold', text: 'KENTÄLLÄ' }),
      h('div', { class: 'bold', style: 'font-size:20px;padding-top:6px',
        text: `${filled}/${formation.slots.length}` }))));

  /* --- Kenttä --- */
  const pitch = h('div', { class: 'pitch' }, pitchLines());
  formation.slots.forEach((slot, i) => {
    const pid = lineup.slots[i];
    const p = pid ? playerById(pid) : null;
    pitch.append(h('button', {
      class: `slot${p ? '' : ' empty'}${slot.pos === 'MV' ? ' gk' : ''}`,
      style: `left:${slot.x}%;top:${slot.y}%`,
      title: POSITIONS[slot.pos] || slot.pos,
      onclick: () => openPicker(lineup, i, commit),
    },
      h('span', { class: 'disc', text: p ? (p.number ?? initials(p.name)) : slot.pos }),
      p ? h('span', { class: 'nm', text: shortName(p.name) }) : null,
      p ? h('span', { class: 'pos', text: slot.pos }) : null));
  });
  wrap.append(h('div', { class: 'pitch-wrap' }, pitch));

  wrap.append(h('div', { class: 'btn-row' },
    h('button', { class: 'btn sm', style: 'flex:1', onclick: () => commit(() => autoFill(lineup)) }, '✨ Täytä automaattisesti'),
    h('button', {
      class: 'btn sm ghost', style: 'flex:1',
      onclick: () => commit(() => { lineup.slots = lineup.slots.map(() => null); }),
    }, 'Tyhjennä kenttä')));

  /* --- Vaihtopenkki --- */
  wrap.append(h('div', { class: 'section-title', text: `Vaihtopenkki (${lineup.bench.length})` }));
  if (lineup.bench.length === 0) {
    wrap.append(h('div', { class: 'card small muted', text: 'Ei vaihtopelaajia. Lisää pelaajia alta.' }));
  } else {
    for (const pid of lineup.bench) {
      const p = playerById(pid);
      if (!p) continue;
      wrap.append(h('div', { class: 'card row' },
        h('span', { class: 'numchip', text: p.number ?? '–' }),
        h('span', { class: 'grow ellip', text: p.name }),
        h('button', { class: 'btn sm ghost', onclick: () => commit(() => toggleBench(lineup, pid)) }, 'Poista')));
    }
  }

  const unavailable = lineup.unavailable || [];
  if (unavailable.length) {
    wrap.append(h('div', { class: 'section-title', text: `Poissa (${unavailable.length})` }));
    for (const pid of unavailable) {
      const p = playerById(pid);
      if (!p) continue;
      wrap.append(h('div', { class: 'card row' },
        h('span', { class: 'numchip', text: p.number ?? '–' }),
        h('span', { class: 'grow ellip muted', text: p.name }),
        h('button', { class: 'btn sm ghost', onclick: () => commit(() => toggleUnavailable(lineup, pid)) }, 'Palauta')));
    }
  }

  wrap.append(h('button', {
    class: 'btn', style: 'margin-top:10px',
    onclick: () => openSquadSheet(lineup, commit),
  }, '👥 Hallitse ryhmää'));

  return wrap;
}

/* ---------- Pelaajan valinta paikkaan ---------- */

function openPicker(lineup, slotIndex, commit) {
  const formation = getFormation(lineup.formation);
  const slot = formation.slots[slotIndex];
  const wanted = roleForPosition(slot.pos);
  const current = lineup.slots[slotIndex];

  sheet(`${POSITIONS[slot.pos] || slot.pos}`, (body, close) => {
    const players = sortedPlayers(getState().players.filter((p) => p.active !== false));
    const fits = players.filter((p) => (p.roles || []).includes(wanted));
    const rest = players.filter((p) => !fits.includes(p));

    if (current) {
      body.append(h('button', {
        class: 'btn danger', style: 'margin-bottom:12px',
        onclick: () => { commit(() => assignToSlot(lineup, slotIndex, null)); close(); },
      }, 'Tyhjennä paikka'));
    }
    if (!players.length) {
      body.append(h('p', { class: 'muted', text: 'Lisää ensin pelaajia Pelaajat-välilehdellä.' }));
      return;
    }

    const item = (p) => {
      const role = lineupRole(lineup, p.id);
      return h('button', {
        class: `list-item${p.id === current ? ' sel' : ''}${role === 'poissa' ? ' off' : ''}`,
        onclick: () => { commit(() => assignToSlot(lineup, slotIndex, p.id)); close(); },
      },
        h('span', { class: `numchip${p.id === current ? ' accent' : ''}`, text: p.number ?? '–' }),
        h('span', { class: 'grow' },
          h('div', { class: 'bold ellip', text: p.name }),
          h('div', { class: 'tiny muted', text: (p.roles || []).join(' · ') || 'ei pelipaikkoja' })),
        role && role !== 'poissa'
          ? h('span', { class: 'badge', text: role === 'aloittava' ? 'kentällä' : 'penkki' })
          : role === 'poissa' ? h('span', { class: 'badge', text: 'poissa' }) : null);
    };

    if (fits.length) {
      body.append(h('div', { class: 'section-title', text: `Sopivat pelipaikalle (${wanted})` }));
      fits.forEach((p) => body.append(item(p)));
    }
    if (rest.length) {
      body.append(h('div', { class: 'section-title', text: 'Muut pelaajat' }));
      rest.forEach((p) => body.append(item(p)));
    }
  });
}

/* ---------- Koko ryhmän hallinta ---------- */

function openSquadSheet(lineup, commit) {
  sheet('Ryhmä', (body) => {
    const draw = () => {
      body.replaceChildren();
      const players = sortedPlayers(getState().players.filter((p) => p.active !== false));
      if (!players.length) {
        body.append(h('p', { class: 'muted', text: 'Lisää ensin pelaajia Pelaajat-välilehdellä.' }));
        return;
      }
      body.append(h('p', { class: 'tiny muted', text: 'Valitse jokaiselle pelaajalle rooli tähän otteluun.' }));
      for (const p of players) {
        const role = lineupRole(lineup, p.id);
        body.append(h('div', { class: 'card', style: 'margin-bottom:8px' },
          h('div', { class: 'row', style: 'margin-bottom:8px' },
            h('span', { class: 'numchip', text: p.number ?? '–' }),
            h('span', { class: 'grow ellip bold', text: p.name }),
            role === 'aloittava' ? h('span', { class: 'badge accent', text: 'kentällä' }) : null),
          h('div', { class: 'segmented' },
            h('button', {
              class: lineup.bench.includes(p.id) ? 'on' : '',
              onclick: () => { commit(() => toggleBench(lineup, p.id)); draw(); },
            }, 'Vaihtopenkki'),
            h('button', {
              class: (lineup.unavailable || []).includes(p.id) ? 'on' : '',
              onclick: () => { commit(() => toggleUnavailable(lineup, p.id)); draw(); },
            }, 'Poissa'))));
      }
    };
    draw();
  });
}

/* ---------- Automaattitäyttö ---------- */

function autoFill(lineup) {
  const formation = getFormation(lineup.formation);
  const used = new Set(lineup.slots.filter(Boolean));
  const unavailable = new Set(lineup.unavailable || []);
  const pool = sortedPlayers(getState().players.filter(
    (p) => p.active !== false && !used.has(p.id) && !unavailable.has(p.id)));

  formation.slots.forEach((slot, i) => {
    if (lineup.slots[i]) return;
    const wanted = roleForPosition(slot.pos);
    let idx = pool.findIndex((p) => (p.roles || []).includes(wanted));
    if (idx < 0) idx = pool.findIndex((p) => !(p.roles || []).includes('MV'));
    if (idx < 0) return;
    const [p] = pool.splice(idx, 1);
    lineup.slots[i] = p.id;
    lineup.bench = lineup.bench.filter((v) => v !== p.id);
  });

  const empties = lineup.slots.filter((v) => !v).length;
  toast(empties ? `${empties} paikkaa jäi tyhjäksi` : 'Kokoonpano täytetty');
}
