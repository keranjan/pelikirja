// Alkulämmittelyn suunnittelu: kenttäalue, merkit ja piirrokset.
import { icon } from '../icons.js';
import { h, add, sheet, toast, confirmSheet, pressable, fmtDate } from '../ui.js';
import {
  getState, sortedDrills, drillById, addDrill, updateDrill, removeDrill, update,
} from '../store.js';
import {
  AREAS, getArea, PLAYER_COLORS, playerColor, ITEMS, SHAPES, DRAW_COLORS, drawColor,
  STROKE_WIDTH, HALO_WIDTH, addItem, addStroke, undoLast, clearDrill, removeElement,
  boxOf, trianglePoints, penPath, hitElement,
} from '../drills.js';
import { blockBrowserGestures } from './pitch.js';
import { navigate } from '../router.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const el = (tag, attrs) => {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  return node;
};

// Valittu työkalu säilyy näkymän uudelleenpiirron yli. lastMark ja lastShape
// muistavat valikoiden valinnan, jotta painikkeet näyttävät sen myös silloin,
// kun käytössä on siirto tai poisto.
let tool = 'siirra';
let teamColor = 'vihrea';
let inkColor = 'musta';
let lastMark = 'pelaaja';
let lastShape = 'kyna';

const tapState = { lastTouchEnd: 0 };
const SHAPE_GLYPHS = { kyna: '✎', nelio: '▭', ympyra: '◯', kolmio: '△' };
const MARK_GLYPHS = { pallo: '⚽', totsa: '🔺', maali: '🥅' };

const isMarkTool = (t) => t === 'pelaaja' || !!ITEMS[t];

const markName = (kind, color) =>
  (kind === 'pelaaja' ? playerColor(color).name : (ITEMS[kind]?.name || 'Merkki'));

/** Painikkeen kuvake: pelaajalla värillinen pallero, muilla emoji. */
function markGlyph(kind, color) {
  if (kind === 'pelaaja') {
    return h('span', { class: 'dot', style: `background:${playerColor(color).fill}` });
  }
  return h('span', { class: 'gl', text: MARK_GLYPHS[kind] || '⚽' });
}

/** Kentälle lisättävät merkit yhden valikon takana. */
function openMarkPicker(drillId) {
  sheet('Lisättävä merkki', (body, close) => {
    const pick = (kind, color) => {
      tool = kind;
      lastMark = kind;
      if (color) teamColor = color;
      close();
      navigate(`#/harjoitus/${drillId}`);
    };
    const item = (kind, color, name, hint) => pressable(h('button', {
      class: `list-item${tool === kind && (!color || teamColor === color) ? ' sel' : ''}`,
    },
      h('span', { class: 'markicon' }, markGlyph(kind, color)),
      h('span', { class: 'grow' },
        h('div', { class: 'bold ellip', text: name }),
        h('div', { class: 'tiny muted', text: hint }))), () => pick(kind, color));

    body.append(h('p', { class: 'tiny muted', text: 'Valitse merkki ja napauta sitten kenttää.' }));
    for (const c of Object.values(PLAYER_COLORS)) {
      body.append(item('pelaaja', c.id, `Pelaaja – ${c.name.toLowerCase()}`, 'Merkit numeroituvat väreittäin'));
    }
    body.append(item('pallo', null, ITEMS.pallo.name, 'Pallo kentälle'));
    body.append(item('totsa', null, ITEMS.totsa.name, 'Merkkikartio rajaamaan aluetta'));
    body.append(item('maali', null, ITEMS.maali.name, 'Maali kentälle'));
  });
}

/** Piirtotyökalut ja värit yhden valikon takana. */
function openDrawPicker(drillId) {
  sheet('Piirtotyökalu', (body, close) => {
    const draw = () => {
      body.replaceChildren();
      body.append(h('p', { class: 'tiny muted', text: 'Valitse ensin väri, sitten työkalu.' }));
      body.append(h('div', { class: 'swatches' },
        ...Object.values(DRAW_COLORS).map((c) => pressable(h('button', {
          class: `swatch${inkColor === c.id ? ' on' : ''}`,
          style: `background:${c.value}`, 'aria-label': c.name,
        }), () => { inkColor = c.id; draw(); }))));
      for (const shape of Object.values(SHAPES)) {
        body.append(pressable(h('button', { class: `list-item${tool === shape.id ? ' sel' : ''}` },
          h('span', { class: 'markicon', style: `color:${drawColor(inkColor).value}` },
            h('span', { class: 'gl', text: SHAPE_GLYPHS[shape.id] })),
          h('span', { class: 'grow' },
            h('div', { class: 'bold ellip', text: shape.name }),
            h('div', { class: 'tiny muted', text: shape.free ? 'Vapaa veto sormella' : 'Vedä nurkasta nurkkaan' }))),
        () => {
          tool = shape.id;
          lastShape = shape.id;
          close();
          navigate(`#/harjoitus/${drillId}`);
        }));
      }
    };
    draw();
  });
}

/* ---------- Luettelo ---------- */

export function drillsView() {
  const drills = sortedDrills();
  const body = h('div', { class: 'stack' });

  if (!drills.length) {
    body.append(h('div', { class: 'empty' },
      h('span', { class: 'big' }, icon('cone', 30)),
      h('p', { text: 'Ei suunniteltuja harjoituksia.' }),
      h('p', { class: 'small', text: 'Piirrä alkulämmittely kentälle: pelaajat, pallot, tötsät ja maalit.' }),
      h('button', { class: 'btn primary', style: 'margin-top:14px;max-width:260px', onclick: openNewDrill },
        '＋ Uusi harjoitus')));
    return { title: 'Lämmittely', body };
  }

  const grid = h('div', { class: 'cards tight' });
  body.append(grid);
  for (const d of drills) {
    const area = getArea(d.area);
    const players = d.elements.filter((e) => e.kind === 'pelaaja').length;
    grid.append(h('button', { class: 'card row compact', onclick: () => navigate(`#/harjoitus/${d.id}`) },
      h('span', { class: 'numchip sm accent' }, icon('cone', 17)),
      h('span', { class: 'grow' },
        h('div', { class: 'bold ellip', text: d.name }),
        h('div', { class: 'tiny muted ellip', text: `${area.name} · ${players} pelaajaa · ${d.elements.length} merkintää` })),
      h('span', { class: 'muted', text: '›' })));
  }

  return {
    title: 'Lämmittely',
    subtitle: `${drills.length} harjoitusta`,
    actions: [{ icon: '＋', aria: 'Uusi harjoitus', onClick: openNewDrill }],
    body,
  };
}

function openNewDrill() {
  sheet('Uusi harjoitus', (body, close) => {
    const nameI = h('input', { type: 'text', placeholder: 'esim. Lämmittely – syöttöruudut' });
    add(body,
      h('label', { class: 'field' }, h('span', { text: 'Nimi' }), nameI),
      h('button', {
        class: 'btn primary',
        onclick: () => {
          const d = addDrill(nameI.value.trim() || 'Alkulämmittely');
          close();
          navigate(`#/harjoitus/${d.id}`);
        },
      }, 'Luo harjoitus'));
    setTimeout(() => nameI.focus(), 60);
  });
}

/* ---------- Harjoituksen suunnittelu ---------- */

export function drillView(id) {
  const drill = drillById(id);
  if (!drill) return { title: 'Harjoitus', body: h('p', { class: 'muted', text: 'Harjoitusta ei löydy.' }), back: '#/lammittely' };

  const body = h('div', { class: 'stack' });
  const commit = (fn) => update(() => fn(drillById(id)));
  const area = getArea(drill.area);

  /* --- Kenttäalue --- */
  body.append(h('div', { class: 'segmented' },
    ...Object.values(AREAS).map((a) => h('button', {
      class: drill.area === a.id ? 'on' : '',
      onclick: () => commit((d) => { d.area = a.id; }),
    }, a.name))));

  body.append(buildSurface(drill, commit));

  /* --- Työkalut: neljä painiketta, valinnat valikoiden takana --- */
  const markLabel = markName(isMarkTool(tool) ? tool : lastMark, teamColor);
  const shapeLabel = SHAPES[tool] ? SHAPES[tool].name : SHAPES[lastShape].name;

  const tools = h('div', { class: 'toolgrid' },
    pressable(h('button', { class: `toolbtn${tool === 'siirra' ? ' on' : ''}`, 'aria-label': 'Siirrä merkkejä' },
      h('span', { class: 'gl', text: '✥' }), h('span', { class: 'tl', text: 'Siirrä' })),
    () => { tool = 'siirra'; navigate(`#/harjoitus/${id}`); }),

    pressable(h('button', {
      class: `toolbtn${isMarkTool(tool) ? ' on' : ''}`, 'aria-label': 'Valitse lisättävä merkki',
    }, markGlyph(isMarkTool(tool) ? tool : lastMark, teamColor),
       h('span', { class: 'tl', text: `${markLabel} ▾` })),
    () => openMarkPicker(id)),

    pressable(h('button', {
      class: `toolbtn${SHAPES[tool] ? ' on' : ''}`, 'aria-label': 'Valitse piirtotyökalu',
    }, h('span', { class: 'gl', style: `color:${drawColor(inkColor).value}`,
        text: SHAPE_GLYPHS[SHAPES[tool] ? tool : lastShape] }),
       h('span', { class: 'tl', text: `${shapeLabel} ▾` })),
    () => openDrawPicker(id)),

    pressable(h('button', { class: `toolbtn${tool === 'poista' ? ' on' : ''}`, 'aria-label': 'Poista merkkejä' },
      h('span', { class: 'gl', text: '⌫' }), h('span', { class: 'tl', text: 'Poista' })),
    () => { tool = 'poista'; navigate(`#/harjoitus/${id}`); }));
  body.append(tools);

  body.append(h('div', { class: 'btn-row', style: 'margin-top:10px' },
    pressable(h('button', { class: 'btn sm', style: 'flex:1' }, 'Kumoa'), () => {
      if (!drillById(id).elements.length) { toast('Ei kumottavaa'); return; }
      commit(undoLast);
      toast('Kumottu');
    }),
    pressable(h('button', { class: 'btn sm ghost', style: 'flex:1' }, 'Tyhjennä'), async () => {
      if (!drillById(id).elements.length) return;
      if (await confirmSheet('Tyhjennä kenttä', 'Kaikki merkit ja piirrokset poistetaan.', 'Tyhjennä')) {
        commit(clearDrill);
        toast('Kenttä tyhjennetty');
      }
    })));

  /* --- Muistiinpanot --- */
  const notesI = h('textarea', {
    rows: 4, placeholder: 'Ohjeet: kesto, kierrokset, painopisteet.', text: drill.notes || '',
  });
  notesI.addEventListener('change', () => updateDrill(id, { notes: notesI.value }, { silent: true }));
  body.append(h('label', { class: 'field', style: 'margin-top:14px' },
    h('span', { text: 'Muistiinpanot' }), notesI));

  body.append(h('button', {
    class: 'btn danger',
    onclick: async () => {
      if (await confirmSheet('Poista harjoitus', 'Harjoitus ja sen piirrokset poistetaan pysyvästi.')) {
        removeDrill(id);
        toast('Harjoitus poistettu');
        navigate('#/lammittely');
      }
    },
  }, 'Poista harjoitus'));

  // Sama tuplanapautuksen ja nipistyksen esto kuin taktiikkataululla, mutta
  // koko näkymälle. Ajastus on jaettu moduulitasolla, jotta se toimii myös
  // uudelleenpiirron yli – merkin lisäys piirtää näkymän aina uudelleen.
  blockBrowserGestures(body, tapState);

  return {
    title: drill.name,
    subtitle: `${area.name} · ${drill.elements.length} merkintää`,
    back: '#/lammittely',
    actions: [{ icon: '✎', aria: 'Muokkaa nimeä', onClick: () => openRename(drill) }],
    body,
  };
}

function openRename(drill) {
  sheet('Harjoituksen nimi', (body, close) => {
    const nameI = h('input', { type: 'text', value: drill.name });
    add(body,
      h('label', { class: 'field' }, h('span', { text: 'Nimi' }), nameI),
      h('button', {
        class: 'btn primary',
        onclick: () => {
          updateDrill(drill.id, { name: nameI.value.trim() || drill.name });
          close();
        },
      }, 'Tallenna'));
  });
}

/* ---------- Kenttäalueen piirto ---------- */

function buildSurface(drill, commit) {
  const area = getArea(drill.area);
  // Kenttä käyttää käytettävissä olevan korkeuden: leveys rajataan
  // korkeusbudjetista alueen mittasuhteiden mukaan.
  const surface = h('div', {
    class: 'drill-surface',
    style: `aspect-ratio:${area.w} / ${area.h};max-width:min(100%, calc(64dvh * ${area.w} / ${area.h}))`,
  });

  // Kentän viivat: sama mittakaava kuin kokoonpanokentässä, rajattuna alueeseen.
  const lines = el('svg', { class: 'lines', viewBox: `0 0 ${area.w} ${area.h}`, preserveAspectRatio: 'none' });
  lines.innerHTML = `
    <rect x="2" y="2" width="64" height="91" />
    <line x1="2" y1="47.5" x2="66" y2="47.5" />
    <circle cx="34" cy="47.5" r="9" />
    <rect x="14" y="2" width="40" height="14" />
    <rect x="23" y="2" width="22" height="6" />`;
  surface.append(lines);

  const layer = el('svg', { class: 'ink', viewBox: `0 0 ${area.w} ${area.h}`, preserveAspectRatio: 'none' });
  const drawn = el('g', {});
  const live = el('g', {});
  layer.append(drawn, live);
  surface.append(layer);

  for (const e of drill.elements) {
    if (e.kind === 'stroke') renderStroke(drawn, e, area);
    else surface.append(itemToken(e, drill, commit, surface));
  }

  bindSurface(surface, live, drill, commit, area);
  return h('div', { class: 'drill-wrap' }, surface);
}

/** Piirtää yhden vedon: ensin reunus, sitten väri. */
function renderStroke(group, stroke, area) {
  const c = drawColor(stroke.color);
  const sx = (v) => (v / 100) * area.w;
  const sy = (v) => (v / 100) * area.h;
  const shapes = [];

  if (stroke.shape === 'kyna') {
    shapes.push(['path', { d: penPath(stroke.points, area) }]);
  } else if (stroke.shape === 'nelio') {
    const b = boxOf(stroke.points);
    shapes.push(['rect', { x: sx(b.x), y: sy(b.y), width: sx(b.w), height: sy(b.h), rx: 0.6 }]);
  } else if (stroke.shape === 'ympyra') {
    const b = boxOf(stroke.points);
    shapes.push(['ellipse', {
      cx: sx(b.x + b.w / 2), cy: sy(b.y + b.h / 2),
      rx: Math.max(0.4, sx(b.w) / 2), ry: Math.max(0.4, sy(b.h) / 2),
    }]);
  } else {
    shapes.push(['polygon', {
      points: trianglePoints(stroke.points).map(([x, y]) => `${sx(x)},${sy(y)}`).join(' '),
    }]);
  }

  for (const [tag, attrs] of shapes) {
    const base = { fill: 'none', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', ...attrs };
    group.append(el(tag, { ...base, stroke: c.halo, 'stroke-width': HALO_WIDTH }));
    group.append(el(tag, { ...base, stroke: c.value, 'stroke-width': STROKE_WIDTH }));
  }
}

/** Kentälle asetettu merkki: pelaaja, pallo, tötsä tai maali. */
function itemToken(item, drill, commit, surface) {
  const style = `left:${item.x}%;top:${item.y}%`;
  let inner;
  if (item.kind === 'pelaaja') {
    const c = playerColor(item.color);
    inner = h('span', {
      class: 'disc', style: `background:${c.fill};color:${c.ink}`, text: item.label || '',
    });
  } else if (item.kind === 'pallo') {
    inner = h('span', { class: 'ball' });
  } else if (item.kind === 'totsa') {
    inner = h('span', { class: 'cone' });
  } else {
    inner = h('span', { class: 'goal' });
  }

  const token = h('div', { class: `mark ${item.kind}`, style }, inner);
  token.addEventListener('pointerdown', (ev) => {
    if (tool === 'poista') {
      ev.preventDefault();
      ev.stopPropagation();
      commit((d) => removeElement(d, item.id));
      return;
    }
    if (tool !== 'siirra') return;    // muut työkalut lisäävät uuden merkin
    ev.preventDefault();
    ev.stopPropagation();
    dragToken(ev, token, surface, item, commit);
  });
  return token;
}

/** Merkin raahaus kentällä. */
function dragToken(startEv, token, surface, item, commit) {
  token.setPointerCapture(startEv.pointerId);
  token.classList.add('dragging');
  let last = { x: item.x, y: item.y };

  const move = (ev) => {
    const r = surface.getBoundingClientRect();
    last = {
      x: Math.min(100, Math.max(0, ((ev.clientX - r.left) / r.width) * 100)),
      y: Math.min(100, Math.max(0, ((ev.clientY - r.top) / r.height) * 100)),
    };
    token.style.left = `${last.x}%`;
    token.style.top = `${last.y}%`;
  };
  const end = () => {
    token.removeEventListener('pointermove', move);
    token.removeEventListener('pointerup', end);
    token.removeEventListener('pointercancel', end);
    token.classList.remove('dragging');
    commit((d) => {
      const target = d.elements.find((e) => e.id === item.id);
      if (target) { target.x = last.x; target.y = last.y; }
    });
  };
  token.addEventListener('pointermove', move);
  token.addEventListener('pointerup', end);
  token.addEventListener('pointercancel', end);
}

/** Kentän oma kosketuslogiikka: merkin lisäys, piirto ja poisto. */
function bindSurface(surface, live, drill, commit, area) {
  const pointOf = (ev) => {
    const r = surface.getBoundingClientRect();
    return [
      Math.min(100, Math.max(0, ((ev.clientX - r.left) / r.width) * 100)),
      Math.min(100, Math.max(0, ((ev.clientY - r.top) / r.height) * 100)),
    ];
  };

  surface.addEventListener('pointerdown', (ev) => {
    if (ev.button > 0) return;
    const at = pointOf(ev);

    if (tool === 'poista') {
      const hit = hitElement(drill, at[0], at[1]);
      if (hit) commit((d) => removeElement(d, hit.id));
      return;
    }
    if (tool === 'siirra') return;

    if (ITEMS[tool] || tool === 'pelaaja') {
      ev.preventDefault();
      commit((d) => addItem(d, { id: uid(), kind: tool, color: teamColor, x: at[0], y: at[1] }));
      return;
    }
    if (!SHAPES[tool]) return;

    // Piirtoveto: seurataan sormea ja piirretään esikatselu.
    ev.preventDefault();
    surface.setPointerCapture(ev.pointerId);
    const points = [at];
    const shape = tool;
    const color = inkColor;

    const draw = () => {
      live.replaceChildren();
      const preview = { kind: 'stroke', shape, color, points: SHAPES[shape].free ? points : [points[0], points[points.length - 1]] };
      if (points.length > 1) renderStroke(live, preview, area);
    };
    const move = (e2) => {
      points.push(pointOf(e2));
      draw();
    };
    const end = () => {
      surface.removeEventListener('pointermove', move);
      surface.removeEventListener('pointerup', end);
      surface.removeEventListener('pointercancel', end);
      live.replaceChildren();
      if (points.length > 1) {
        commit((d) => addStroke(d, { id: uid(), shape, color, points }));
      }
    };
    surface.addEventListener('pointermove', move);
    surface.addEventListener('pointerup', end);
    surface.addEventListener('pointercancel', end);
  });
}

const uid = () => Date.now().toString(36).slice(-5) + Math.random().toString(36).slice(2, 7);
