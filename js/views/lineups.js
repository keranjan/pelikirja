// Tallennetut kokoonpanopohjat.
import { icon } from '../icons.js';
import { h, sheet, toast, confirmSheet } from '../ui.js';
import { getState, lineupById, addLineup, removeLineup, update } from '../store.js';
import { getFormation, formationsBySize } from '../formations.js';
import { renderLineupEditor } from './pitch.js';
import { navigate } from '../router.js';

export function lineupsView() {
  const lineups = getState().lineups;
  const body = h('div', { class: 'stack' });

  if (!lineups.length) {
    body.append(h('div', { class: 'empty' },
      h('span', { class: 'big' }, icon('lineup', 30)),
      h('p', { text: 'Ei tallennettuja kokoonpanoja.' }),
      h('p', { class: 'small', text: 'Tee valmiita pohjia eri pelisysteemeille ja hae ne otteluun yhdellä napautuksella.' }),
      h('button', { class: 'btn primary', style: 'margin-top:14px;max-width:260px', onclick: openNewLineup }, '＋ Uusi kokoonpano')));
    return { title: 'Kokoonpanot', body };
  }

  for (const l of lineups) {
    const f = getFormation(l.lineup.formation);
    const filled = l.lineup.slots.filter(Boolean).length;
    body.append(h('button', { class: 'card row', onclick: () => navigate(`#/kokoonpano/${l.id}`) },
      h('span', { class: 'numchip accent', style: 'width:auto;padding:0 8px', text: f.name }),
      h('span', { class: 'grow' },
        h('div', { class: 'bold ellip', text: l.name }),
        h('div', { class: 'tiny muted', text: `${filled}/${f.slots.length} pelaajaa · ${f.size} vs ${f.size}` })),
      h('span', { class: 'muted', text: '›' })));
  }

  return {
    title: 'Kokoonpanot',
    subtitle: `${lineups.length} pohjaa`,
    actions: [{ icon: '＋', aria: 'Uusi kokoonpano', onClick: openNewLineup }],
    body,
  };
}

function openNewLineup() {
  sheet('Uusi kokoonpano', (body, close) => {
    const nameI = h('input', { type: 'text', placeholder: 'esim. Perusasetelma 4-4-2' });
    const sel = h('select');
    for (const [size, list] of formationsBySize()) {
      const group = h('optgroup', { label: `${size} vs ${size}` });
      list.forEach((f) => group.append(h('option', { value: f.id, text: f.name })));
      sel.append(group);
    }
    body.append(
      h('label', { class: 'field' }, h('span', { text: 'Nimi' }), nameI),
      h('label', { class: 'field' }, h('span', { text: 'Pelisysteemi' }), sel),
      h('button', {
        class: 'btn primary',
        onclick: () => {
          const l = addLineup(nameI.value.trim() || getFormation(sel.value).name, sel.value);
          close();
          navigate(`#/kokoonpano/${l.id}`);
        },
      }, 'Luo kokoonpano'));
    setTimeout(() => nameI.focus(), 60);
  });
}

export function lineupView(id) {
  const l = lineupById(id);
  if (!l) {
    return { title: 'Kokoonpanoa ei löydy', back: '#/kokoonpanot', body: h('div', { class: 'empty' }, 'Pohja on poistettu.') };
  }

  const body = h('div', { class: 'stack' });
  body.append(renderLineupEditor(l.lineup, (fn) => update(fn)));
  body.append(h('hr', { class: 'sep' }));
  body.append(h('button', {
    class: 'btn danger',
    onclick: async () => {
      if (await confirmSheet('Poista kokoonpano', `Poistetaanko pohja "${l.name}"?`)) {
        removeLineup(l.id);
        toast('Pohja poistettu');
        navigate('#/kokoonpanot');
      }
    },
  }, 'Poista kokoonpano'));

  return {
    title: l.name,
    subtitle: getFormation(l.lineup.formation).name,
    back: '#/kokoonpanot',
    actions: [{ label: 'Nimeä', aria: 'Nimeä uudelleen', onClick: () => renameLineup(l) }],
    body,
  };
}

function renameLineup(l) {
  sheet('Nimeä uudelleen', (body, close) => {
    const nameI = h('input', { type: 'text', value: l.name });
    body.append(
      h('label', { class: 'field' }, h('span', { text: 'Nimi' }), nameI),
      h('button', {
        class: 'btn primary',
        onclick: () => {
          const name = nameI.value.trim();
          if (!name) return;
          update((st) => { const t = st.lineups.find((x) => x.id === l.id); if (t) t.name = name; });
          close();
        },
      }, 'Tallenna'));
  });
}
