// Kokoonpanoeditori: kenttäkuva, vaihtopenkki ja ryhmän valinta.
import { h, sheet, toast, shortName, initials, pressable } from '../ui.js';
import { icon } from '../icons.js';
import { getFormation, formationsBySize, roleForPosition, POSITIONS } from '../formations.js';
import {
  getState, playerById, sortedPlayers, setFormation, assignToSlot, clearSlots,
  toggleSquad, inSquad, lineupRole,
  addStroke, undoStroke, clearDrawings, movePlayer, resetPositions, update,
  sortedStaff, staffById, toggleLineupStaff, STAFF_ROLES,
} from '../store.js';
import {
  TOOLS, COLORS, toolOf, colorOf, strokePath, arrowHead, normalize,
  PITCH_W, PITCH_H, ARROW_SIZE,
} from '../tactics.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const el = (tag, attrs) => {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  return node;
};

// Piirtotila säilyy näkymän uudelleenpiirron yli.
let mode = 'kokoonpano';
let tool = 'pass';
let color = 'black';

/** Piirtää yhden vedon: ensin haaleampi reunus, sitten itse viiva. */
function renderStroke(group, stroke) {
  const t = toolOf(stroke.tool);
  const c = colorOf(stroke.color);
  // Nuolellisessa vedossa viiva katkaistaan kärjen tyveen, jottei pyöreä
  // viivanpää näy kärjen ohi.
  const d = strokePath(stroke.points, t.arrow ? ARROW_SIZE - 0.5 : 0);
  if (!d) return;

  const base = { fill: 'none', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' };
  group.append(el('path', {
    ...base, d, stroke: c.halo, 'stroke-width': t.width + 0.55,
    ...(t.dash ? { 'stroke-dasharray': t.dash } : {}),
  }));
  group.append(el('path', {
    ...base, d, stroke: c.value, 'stroke-width': t.width,
    ...(t.dash ? { 'stroke-dasharray': t.dash } : {}),
  }));

  if (t.arrow) {
    const head = arrowHead(stroke.points);
    if (head) {
      group.append(el('polygon', { points: head, fill: c.halo, stroke: c.halo, 'stroke-width': 0.55, 'stroke-linejoin': 'round' }));
      group.append(el('polygon', { points: head, fill: c.value }));
    }
  }
}

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
  const wrap = h('div', { class: 'stack lineup-editor' });

  /* --- Tila: kokoonpano vai taktiikka --- */
  const setMode = (value) => { mode = value; commit(() => {}); };
  wrap.append(h('div', { class: 'segmented mode-switch' },
    h('button', { class: mode === 'kokoonpano' ? 'on' : '', onclick: () => setMode('kokoonpano') }, 'Kokoonpano'),
    h('button', { class: mode === 'taktiikka' ? 'on' : '', onclick: () => setMode('taktiikka') }, 'Taktiikka')));

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
  if (mode === 'kokoonpano') {
    wrap.append(h('div', { class: 'row' },
      h('div', { class: 'grow' },
        h('div', { class: 'tiny muted bold', text: 'PELISYSTEEMI' }), select),
      h('div', { class: 'center' },
        h('div', { class: 'tiny muted bold', text: 'KENTÄLLÄ' }),
        h('div', { class: 'bold', style: 'font-size:20px;padding-top:6px',
          text: `${filled}/${formation.slots.length}` }))));
  }

  /* --- Kenttä --- */
  const drawing = mode === 'taktiikka';
  const pitch = buildPitch(lineup, commit, { drawing });
  wrap.append(h('div', { class: 'pitch-wrap' }, pitch));

  if (drawing) {
    wrap.append(tacticsControls(lineup, commit, { onFullscreen: () => openBoard(lineup) }));
    return wrap;
  }

  wrap.append(h('div', { class: 'btn-row' },
    h('button', { class: 'btn sm', style: 'flex:1', onclick: () => commit(() => autoFill(lineup)) }, 'Automaattitäyttö'),
    h('button', {
      class: 'btn sm ghost', style: 'flex:1',
      onclick: () => commit(() => clearSlots(lineup)),
    }, 'Tyhjennä')));

  /* --- Vaihtopenkki: ryhmään valitut, jotka eivät ole kentällä --- */
  wrap.append(h('div', { class: 'section-title', text: `Vaihtopenkki (${lineup.bench.length})` }));
  if (lineup.bench.length === 0) {
    wrap.append(h('div', { class: 'card small muted compact', text: 'Ei vaihtopelaajia. Merkitse pelaajat mukaan Hallitse ryhmää -painikkeesta.' }));
  } else {
    for (const pid of lineup.bench) {
      const p = playerById(pid);
      wrap.append(h('div', { class: 'card row compact' },
        h('span', { class: 'numchip sm', text: p ? (p.number ?? '–') : '?' }),
        h('span', { class: `grow ellip${p ? '' : ' muted'}`, text: p ? p.name : 'Poistettu pelaaja' }),
        h('button', { class: 'btn sm ghost', onclick: () => commit(() => toggleSquad(lineup, pid)) }, 'Poista')));
    }
  }

  /* --- Valmentajat --- */
  const staffIds = lineup.staff || [];
  wrap.append(h('div', { class: 'section-title', text: `Valmentajat (${staffIds.length})` }));
  if (!staffIds.length) {
    wrap.append(h('div', { class: 'card small muted', text: 'Ei valmentajia merkittynä otteluun.' }));
  } else {
    for (const id of staffIds) {
      const person = staffById(id);
      // Jos henkilöä ei löydy (esim. poistettu toisella laitteella), rivi
      // näytetään silti – muuten lukumäärä ja lista eivät täsmäisi.
      wrap.append(h('div', { class: 'card row' },
        h('span', { class: 'numchip', style: 'width:auto;padding:0 10px;font-size:11px',
          text: person ? initials(person.name) : '?' }),
        h('span', { class: 'grow' },
          h('div', { class: `bold ellip${person ? '' : ' muted'}`,
            text: person ? person.name : 'Poistettu valmentaja' }),
          h('div', { class: 'tiny muted', text: person
            ? (STAFF_ROLES[person.role] || 'Toimihenkilö')
            : 'Henkilöä ei löydy ryhmästä' })),
        h('button', {
          class: 'btn sm ghost',
          onclick: () => commit(() => toggleLineupStaff(lineup, id)),
        }, 'Poista')));
    }
  }

  wrap.append(h('div', { class: 'btn-row', style: 'margin-top:10px' },
    h('button', { class: 'btn', onclick: () => openSquadSheet(lineup, commit) }, 'Hallitse ryhmää'),
    h('button', { class: 'btn', onclick: () => openStaffPicker(lineup, commit) }, 'Valmentajat')));

  return wrap;
}

/* ---------- Kenttäkuvan rakentaminen ---------- */

/**
 * @param {object}  lineup
 * @param {function} commit
 * @param {boolean} opts.drawing  taktiikkatila: piirto ja pelaajien siirto käytössä
 */
export function buildPitch(lineup, commit, { drawing = false } = {}) {
  const formation = getFormation(lineup.formation);
  const moving = drawing && tool === 'move';
  const pitch = h('div', {
    class: `pitch${drawing ? ' drawing' : ''}${moving ? ' moving' : ''}`,
  }, pitchLines());

  // Taktiikkakerros kentän viivojen päälle, pelaajien alle.
  const layer = el('svg', {
    class: 'tactics-layer',
    viewBox: `0 0 ${PITCH_W} ${PITCH_H}`,
    preserveAspectRatio: 'none',
  });
  const strokes = el('g', {});
  const live = el('g', {});
  layer.append(strokes, live);
  (lineup.drawings || []).forEach((stroke) => renderStroke(strokes, stroke));
  pitch.append(layer);

  const posOf = (i) => (lineup.positions || {})[i] || formation.slots[i];

  formation.slots.forEach((slot, i) => {
    const pid = lineup.slots[i];
    const p = pid ? playerById(pid) : null;
    const at = posOf(i);
    const token = h('button', {
      class: `slot${p ? '' : ' empty'}${slot.pos === 'MV' ? ' gk' : ''}`,
      style: `left:${at.x}%;top:${at.y}%`,
      title: POSITIONS[slot.pos] || slot.pos,
      onclick: drawing ? null : () => openPicker(lineup, i, commit),
    },
      h('span', { class: 'disc', text: p ? (p.number ?? initials(p.name)) : slot.pos }),
      p ? h('span', { class: 'nm', text: shortName(p.name) }) : null,
      p ? h('span', { class: 'pos', text: slot.pos }) : null);

    if (moving) dragToken(token, pitch, lineup, i, commit);
    pitch.append(token);
  });

  if (drawing) blockBrowserGestures(pitch);
  if (drawing && !moving) drawOnPitch(pitch, live, lineup, commit);
  return pitch;
}

/* ---------- Koko ruudun taktiikkataulu ---------- */

let boardRoot = null;
let savedViewport = null;

/**
 * Koko ruudun taulussa piirretään ja vain piirretään, joten zoomaus kytketään
 * pois koko sivulta taulun ajaksi. Muualla nipistyszoomaus säilyy.
 */
function lockZoom() {
  const meta = document.querySelector('meta[name="viewport"]');
  if (!meta || savedViewport !== null) return;
  savedViewport = meta.getAttribute('content');
  meta.setAttribute('content', `${savedViewport}, maximum-scale=1, user-scalable=no`);
}

function unlockZoom() {
  const meta = document.querySelector('meta[name="viewport"]');
  if (!meta || savedViewport === null) return;
  meta.setAttribute('content', savedViewport);
  savedViewport = null;
}

/** Avaa kentän koko ruudun kokoiseksi piirtoalustaksi. */
export function openBoard(lineup) {
  closeBoard();
  boardRoot = h('div', { class: 'board', role: 'dialog', 'aria-label': 'Taktiikkataulu' });
  document.body.append(boardRoot);
  document.documentElement.classList.add('board-open');

  const commit = (fn) => { update(fn); draw(); };

  function draw() {
    const area = h('div', { class: 'board-pitch' },
      buildPitch(lineup, commit, { drawing: true }),
      h('button', { class: 'iconbtn board-close', 'aria-label': 'Sulje', onclick: closeBoard }, icon('close', 20)));
    blockBrowserGestures(area);
    boardRoot.replaceChildren(
      area,
      h('div', { class: 'board-tools' }, tacticsControls(lineup, commit)));
  }

  draw();
  lockZoom();
  window.addEventListener('hashchange', closeBoard);
  document.addEventListener('keydown', onKey);
  // Androidilla saadaan selainpalkitkin pois; iOS jättää tämän huomiotta.
  document.documentElement.requestFullscreen?.().catch(() => {});
}

export function closeBoard() {
  if (!boardRoot) return;
  boardRoot.remove();
  boardRoot = null;
  unlockZoom();
  document.documentElement.classList.remove('board-open');
  window.removeEventListener('hashchange', closeBoard);
  document.removeEventListener('keydown', onKey);
  if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
}

const onKey = (e) => { if (e.key === 'Escape') closeBoard(); };

/* ---------- Taktiikkatyökalut ---------- */

export function tacticsControls(lineup, commit, { onFullscreen, onClose } = {}) {
  const bar = h('div', { class: 'stack', style: 'gap:8px' });

  /** Painike, joka reagoi jo sormen osuessa eikä vasta click-tapahtumasta. */
  const btn = ({ onclick, ...props }, ...children) =>
    pressable(h('button', props, ...children), onclick);

  const tools = h('div', { class: 'toolrow' });
  const toolButton = (id, label, sample) => btn({
    class: `toolbtn${tool === id ? ' on' : ''}`,
    'aria-pressed': tool === id ? 'true' : 'false',
    onclick: () => { tool = id; commit(() => {}); },
  }, h('span', { class: 'sample' }, sample), h('span', { class: 'tiny bold', text: label }));

  for (const [id, t] of Object.entries(TOOLS)) tools.append(toolButton(id, t.name, toolSample(id)));
  tools.append(toolButton('move', 'Siirrä', icon('move', 18)));
  bar.append(tools);

  const colors = h('div', { class: 'row', style: 'gap:10px;flex-wrap:wrap' });
  for (const [id, c] of Object.entries(COLORS)) {
    colors.append(btn({
      class: `swatch${color === id ? ' on' : ''}`,
      style: `--swatch:${c.value}`,
      'aria-label': c.name,
      'aria-pressed': color === id ? 'true' : 'false',
      title: c.name,
      disabled: tool === 'move',
      onclick: () => { color = id; commit(() => {}); },
    }));
  }
  colors.append(h('span', { class: 'grow' }));
  colors.append(btn({
    class: 'btn sm action',
    onclick: () => {
      if (!(lineup.drawings || []).length) { toast('Ei kumottavaa'); return; }
      commit(() => undoStroke(lineup));
      toast('Viimeisin veto kumottu');
    },
  }, 'Kumoa'));
  bar.append(colors);

  bar.append(h('p', { class: 'tiny muted', style: 'margin:0' , text: tool === 'move'
    ? 'Siirrä pelaajia vetämällä. Vaihda työkalua, kun haluat piirtää.'
    : 'Piirrä sormella kentälle – myös pelaajien yli.' }));

  bar.append(h('div', { class: 'btn-row' },
    btn({
      class: 'btn sm action', style: 'flex:1',
      onclick: () => {
        if (!(lineup.drawings || []).length) { toast('Ei piirroksia'); return; }
        commit(() => clearDrawings(lineup));
        toast('Piirrokset tyhjennetty');
      },
    }, 'Tyhjennä'),
    btn({
      class: 'btn sm action', style: 'flex:1',
      onclick: () => {
        if (!Object.keys(lineup.positions || {}).length) { toast('Paikat ovat jo ennallaan'); return; }
        commit(() => resetPositions(lineup));
        toast('Paikat palautettu');
      },
    }, 'Palauta paikat')));

  if (onFullscreen) {
    bar.append(btn({ class: 'btn sm', style: 'width:100%', onclick: onFullscreen },
      icon('expand', 17), 'Koko ruutu'));
  }
  if (onClose) {
    bar.append(btn({ class: 'btn sm', style: 'width:100%', onclick: onClose }, 'Sulje taulu'));
  }

  return bar;
}

/** Pieni esimerkkiviiva työkalupainikkeeseen. */
function toolSample(id) {
  const t = toolOf(id);
  const svg = el('svg', { viewBox: '0 0 34 12', width: '34', height: '12' });
  const line = el('path', {
    d: t.arrow ? 'M2 6 H23' : 'M2 6 H31',
    stroke: 'currentColor', 'stroke-width': t.arrow ? 3 : 1.8,
    'stroke-linecap': 'round', fill: 'none',
  });
  if (t.dash) line.setAttribute('stroke-dasharray', '5 3.5');
  svg.append(line);
  if (t.arrow) svg.append(el('polygon', { points: '32,6 22,11 22,1', fill: 'currentColor' }));
  return svg;
}

/* ---------- Selaimen eleiden estäminen piirtoalustalla ---------- */

/**
 * touch-action ei yksin riitä: iOS:n Safari zoomaa kaksoisnapautuksesta
 * siitä huolimatta. Toinen napautus estetään siksi tapahtumatasolla, ja
 * samalla Safarin omat nipistyseleet piirtoalustan päällä.
 */
export function blockBrowserGestures(el) {
  let lastTouchEnd = 0;

  el.addEventListener('touchend', (e) => {
    const now = Date.now();
    if (now - lastTouchEnd < 400) e.preventDefault();
    lastTouchEnd = now;
  }, { passive: false });

  // Piirtäessä ei myöskään haluta tekstin valintaa tai suurennuslasia.
  el.addEventListener('touchstart', (e) => {
    if (e.touches.length > 1) e.preventDefault();
  }, { passive: false });

  el.addEventListener('dblclick', (e) => e.preventDefault());

  // Safarin epästandardit nipistyseleet.
  for (const type of ['gesturestart', 'gesturechange', 'gestureend']) {
    el.addEventListener(type, (e) => e.preventDefault());
  }
}

/* ---------- Piirtäminen ---------- */

function drawOnPitch(pitch, liveGroup, lineup, commit) {
  let points = null;

  const redraw = () => {
    liveGroup.replaceChildren();
    if (points && points.length) renderStroke(liveGroup, { tool, color, points });
  };

  pitch.addEventListener('pointerdown', (e) => {
    if (e.target.closest('.slot')) return;      // pelaajan veto hoituu erikseen
    e.preventDefault();
    pitch.setPointerCapture(e.pointerId);
    points = [normalize(e, pitch)];
    redraw();
  });

  pitch.addEventListener('pointermove', (e) => {
    if (!points) return;
    const next = normalize(e, pitch);
    const last = points[points.length - 1];
    if (Math.hypot(next[0] - last[0], next[1] - last[1]) < 0.7) return;
    points.push(next);
    redraw();
  });

  const finish = () => {
    if (!points) return;
    const drawn = points;
    points = null;
    liveGroup.replaceChildren();
    // Yksittäinen napautus ei jätä jälkeä.
    if (drawn.length < 2) return;
    commit(() => addStroke(lineup, { tool, color, points: drawn }));
  };

  pitch.addEventListener('pointerup', finish);
  pitch.addEventListener('pointercancel', () => { points = null; liveGroup.replaceChildren(); });
}

/* ---------- Pelaajan siirto ---------- */

function dragToken(token, pitch, lineup, slotIndex, commit) {
  let dragging = false;

  token.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    e.stopPropagation();
    dragging = true;
    token.setPointerCapture(e.pointerId);
    token.classList.add('dragging');
  });

  token.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const [x, y] = normalize(e, pitch);
    token.style.left = `${x}%`;
    token.style.top = `${y}%`;
  });

  const drop = (e) => {
    if (!dragging) return;
    dragging = false;
    token.classList.remove('dragging');
    const [x, y] = normalize(e, pitch);
    commit(() => movePlayer(lineup, slotIndex, x, y));
  };

  token.addEventListener('pointerup', drop);
  token.addEventListener('pointercancel', () => { dragging = false; token.classList.remove('dragging'); });
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
        class: `list-item${p.id === current ? ' sel' : ''}`,
        onclick: () => { commit(() => assignToSlot(lineup, slotIndex, p.id)); close(); },
      },
        h('span', { class: `numchip${p.id === current ? ' accent' : ''}`, text: p.number ?? '–' }),
        h('span', { class: 'grow' },
          h('div', { class: 'bold ellip', text: p.name }),
          h('div', { class: 'tiny muted', text: (p.roles || []).join(' · ') || 'ei pelipaikkoja' })),
        role !== 'poissa'
          ? h('span', { class: 'badge', text: role === 'aloittava' ? 'kentällä' : 'penkki' })
          : null);
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

/**
 * Ryhmän valinta: pelaajaa napautetaan vihreäksi, jolloin hän on mukana
 * ottelussa. Tilat kentällä / penkillä / poissa syntyvät valinnasta ja
 * kenttäkokoonpanosta, joten erillistä penkki- tai poissa-valintaa ei ole.
 */
function openSquadSheet(lineup, commit) {
  sheet('Hallitse ryhmää', (body) => {
    const draw = () => {
      body.replaceChildren();
      const players = sortedPlayers(getState().players.filter((p) => p.active !== false));
      if (!players.length) {
        body.append(h('p', { class: 'muted', text: 'Lisää ensin pelaajia Ryhmä-välilehdellä.' }));
        return;
      }
      const picked = players.filter((p) => inSquad(lineup, p.id)).length;
      body.append(h('p', { class: 'tiny muted', text: 'Napauta pelaaja vihreäksi, niin hän on mukana ottelussa. Vihreistä ne, jotka eivät ole kentällä, ovat vaihtopenkillä – muut ovat poissa.' }));
      body.append(h('div', { class: 'btn-row', style: 'margin-bottom:10px' },
        h('button', {
          class: 'btn sm', style: 'flex:1',
          onclick: () => { commit(() => players.forEach((p) => { if (!inSquad(lineup, p.id)) toggleSquad(lineup, p.id); })); draw(); },
        }, 'Kaikki mukaan'),
        h('button', {
          class: 'btn sm ghost', style: 'flex:1',
          onclick: () => { commit(() => players.forEach((p) => { if (inSquad(lineup, p.id)) toggleSquad(lineup, p.id); })); draw(); },
        }, 'Tyhjennä')));
      body.append(h('div', { class: 'tiny muted bold', style: 'margin-bottom:6px', text: `MUKANA ${picked}/${players.length}` }));

      const list = h('div', { class: 'cards tight' });
      for (const p of players) {
        const role = lineupRole(lineup, p.id);
        const on = role !== 'poissa';
        list.append(h('button', {
          class: `card row compact pick${on ? ' on' : ''}`,
          'aria-pressed': on ? 'true' : 'false',
          onclick: () => { commit(() => toggleSquad(lineup, p.id)); draw(); },
        },
          h('span', { class: `numchip sm${on ? ' accent' : ''}`, text: p.number ?? '–' }),
          h('span', { class: 'grow' },
            h('div', { class: 'bold ellip', text: p.name }),
            h('div', { class: 'tiny muted ellip', text: (p.roles || []).join(' · ') || 'ei pelipaikkoja' })),
          h('span', { class: `badge${role === 'aloittava' ? ' accent' : ''}`, text: STATE_LABEL[role] })));
      }
      body.append(list);
    };
    draw();
  });
}

const STATE_LABEL = { aloittava: 'kentällä', vaihto: 'penkillä', poissa: 'poissa' };

/* ---------- Valmentajien valinta otteluun ---------- */

function openStaffPicker(lineup, commit) {
  sheet('Valmentajat', (body) => {
    const draw = () => {
      body.replaceChildren();
      const staff = sortedStaff(getState().staff);
      if (!staff.length) {
        body.append(h('p', { class: 'muted', text: 'Lisää valmentajat ensin Ryhmä-välilehdellä.' }));
        return;
      }
      body.append(h('p', { class: 'tiny muted', text: 'Valitse ketkä ovat mukana tässä ottelussa.' }));
      for (const person of staff) {
        const on = (lineup.staff || []).includes(person.id);
        body.append(h('button', {
          class: `list-item${on ? ' sel' : ''}`,
          onclick: () => { commit(() => toggleLineupStaff(lineup, person.id)); draw(); },
        },
          h('span', { class: `numchip${on ? ' accent' : ''}`, style: 'width:auto;padding:0 10px;font-size:11px', text: initials(person.name) }),
          h('span', { class: 'grow' },
            h('div', { class: 'bold ellip', text: person.name }),
            h('div', { class: 'tiny muted', text: STAFF_ROLES[person.role] || 'Toimihenkilö' })),
          h('span', { class: on ? 'badge accent' : 'badge', text: on ? 'mukana' : 'ei' })));
      }
    };
    draw();
  });
}

/* ---------- Automaattitäyttö ---------- */

function autoFill(lineup) {
  const formation = getFormation(lineup.formation);
  const used = new Set(lineup.slots.filter(Boolean));
  const free = getState().players.filter((p) => p.active !== false && !used.has(p.id));
  // Ryhmään merkityt täytetään ensin; jos heitä ei riitä, otetaan muita mukaan.
  const pool = [
    ...sortedPlayers(free.filter((p) => inSquad(lineup, p.id))),
    ...sortedPlayers(free.filter((p) => !inSquad(lineup, p.id))),
  ];

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
