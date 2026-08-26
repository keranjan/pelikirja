// Pelaajaluettelo ja pelaajakortin muokkaus.
import { icon } from '../icons.js';
import { h, add, sheet, toast, confirmSheet, initials } from '../ui.js';
import { ROLES, ROLE_NAMES } from '../formations.js';
import {
  getState, sortedPlayers, addPlayer, updatePlayer, removePlayer,
  sortedStaff, addStaff, updateStaff, removeStaff, STAFF_ROLES,
} from '../store.js';

export function playersView() {
  const players = sortedPlayers(getState().players);
  const body = h('div', { class: 'stack' });

  const staff = sortedStaff(getState().staff);

  if (!players.length && !staff.length) {
    body.append(h('div', { class: 'empty' },
      h('span', { class: 'big' }, icon('players', 30)),
      h('p', { text: 'Ei vielä pelaajia.' }),
      h('p', { class: 'small', text: 'Lisää joukkueesi pelaajat, niin voit rakentaa kokoonpanot.' }),
      h('button', { class: 'btn primary', style: 'margin-top:14px;max-width:260px', onclick: () => openPlayerSheet(null) }, '＋ Lisää ensimmäinen pelaaja')));
    return {
      title: 'Ryhmä',
      actions: [{ label: 'Valmentaja', aria: 'Lisää valmentaja', onClick: () => openStaffSheet(null) }],
      body,
    };
  }

  const active = players.filter((p) => p.active !== false);
  const inactive = players.filter((p) => p.active === false);

  const card = (p) => h('button', {
    class: 'card row', onclick: () => openPlayerSheet(p),
  },
    h('span', { class: 'numchip accent', text: p.number ?? '–' }),
    h('span', { class: 'grow' },
      h('div', { class: 'bold ellip', text: p.name }),
      h('div', { class: 'tiny muted ellip', text: (p.roles || []).map((r) => ROLE_NAMES[r] || r).join(' · ') || 'Ei pelipaikkoja' })),
    h('span', { class: 'muted', text: '›' }));

  body.append(h('div', { class: 'section-title', text: `Pelaajat (${active.length})` }));
  body.append(h('div', { class: 'cards' }, active.map(card)));

  if (inactive.length) {
    body.append(h('div', { class: 'section-title', text: `Ei käytettävissä (${inactive.length})` }));
    body.append(h('div', { class: 'cards' }, inactive.map(card)));
  }

  body.append(h('div', { class: 'section-title', text: `Valmentajat ja toimihenkilöt (${staff.length})` }));
  if (staff.length) {
    body.append(h('div', { class: 'cards' }, staff.map((person) =>
      h('button', { class: 'card row', onclick: () => openStaffSheet(person) },
        h('span', { class: 'numchip', style: 'width:auto;padding:0 10px;font-size:11px', text: initials(person.name) }),
        h('span', { class: 'grow' },
          h('div', { class: 'bold ellip', text: person.name }),
          h('div', { class: 'tiny muted ellip', text: STAFF_ROLES[person.role] || 'Toimihenkilö' })),
        h('span', { class: 'muted', text: '›' })))));
  } else {
    body.append(h('div', { class: 'card small muted', text: 'Ei valmentajia. Lisää heidät, niin voit merkitä kuka on mukana kussakin ottelussa.' }));
  }
  body.append(h('button', { class: 'btn', style: 'margin-top:4px', onclick: () => openStaffSheet(null) }, '＋ Lisää valmentaja'));

  return {
    title: 'Ryhmä',
    subtitle: `${active.length} pelaajaa · ${staff.length} valmentajaa`,
    actions: [{ icon: '＋', aria: 'Lisää pelaaja', onClick: () => openPlayerSheet(null) }],
    body,
  };
}

/* ---------- Valmentajat ja toimihenkilöt ---------- */

export function openStaffSheet(person) {
  const isNew = !person;

  sheet(isNew ? 'Uusi valmentaja' : 'Muokkaa valmentajaa', (body, close) => {
    const nameI = h('input', { type: 'text', value: person?.name || '', placeholder: 'Etunimi Sukunimi', autocomplete: 'off' });
    const roleSel = h('select', {}, ...Object.entries(STAFF_ROLES).map(([value, label]) =>
      h('option', { value, text: label, selected: (person?.role || 'apuvalmentaja') === value })));
    const phoneI = h('input', { type: 'text', value: person?.phone || '', placeholder: '040 123 4567', inputmode: 'tel', autocomplete: 'off' });
    const notesI = h('textarea', { placeholder: 'Muistiinpanot', text: person?.notes || '' });

    add(body,
      h('label', { class: 'field' }, h('span', { text: 'Nimi' }), nameI),
      h('label', { class: 'field' }, h('span', { text: 'Tehtävä' }), roleSel),
      h('label', { class: 'field' }, h('span', { text: 'Puhelin' }), phoneI),
      h('label', { class: 'field' }, h('span', { text: 'Muistiinpanot' }), notesI),
      h('button', {
        class: 'btn primary',
        onclick: () => {
          const name = nameI.value.trim();
          if (!name) { toast('Anna nimi'); nameI.focus(); return; }
          const data = { name, role: roleSel.value, phone: phoneI.value.trim(), notes: notesI.value.trim() };
          if (isNew) { addStaff(data); toast('Valmentaja lisätty'); }
          else { updateStaff(person.id, data); toast('Tallennettu'); }
          close();
        },
      }, isNew ? 'Lisää valmentaja' : 'Tallenna'),
      isNew ? null : h('button', {
        class: 'btn danger', style: 'margin-top:10px',
        onclick: async () => {
          if (await confirmSheet('Poista valmentaja', `Poistetaanko ${person.name}? Hän poistuu myös otteluiden kokoonpanoista.`)) {
            removeStaff(person.id);
            toast('Valmentaja poistettu');
          }
        },
      }, 'Poista valmentaja'));

    if (isNew) setTimeout(() => nameI.focus(), 60);
  });
}

export function openPlayerSheet(player) {
  const isNew = !player;
  const draft = {
    name: player?.name || '',
    number: player?.number ?? '',
    roles: [...(player?.roles || [])],
    foot: player?.foot || '',
    notes: player?.notes || '',
    active: player ? player.active !== false : true,
  };

  sheet(isNew ? 'Uusi pelaaja' : 'Muokkaa pelaajaa', (body, close) => {
    const nameInput = h('input', { type: 'text', value: draft.name, placeholder: 'Etunimi Sukunimi', autocomplete: 'off' });
    const numInput = h('input', { type: 'number', value: draft.number, placeholder: '9', inputmode: 'numeric', min: '0', max: '99' });
    const footSel = h('select', {},
      h('option', { value: '', text: 'Ei valittu', selected: !draft.foot }),
      h('option', { value: 'oikea', text: 'Oikea', selected: draft.foot === 'oikea' }),
      h('option', { value: 'vasen', text: 'Vasen', selected: draft.foot === 'vasen' }),
      h('option', { value: 'molemmat', text: 'Molemmat', selected: draft.foot === 'molemmat' }));
    const notesInput = h('textarea', { placeholder: 'Muistiinpanot valmentajalle', text: draft.notes });

    const chips = h('div', { class: 'chips' });
    for (const r of ROLES) {
      const chip = h('button', {
        class: `chip${draft.roles.includes(r) ? ' on' : ''}`,
        type: 'button',
        onclick: () => {
          if (draft.roles.includes(r)) draft.roles = draft.roles.filter((x) => x !== r);
          else draft.roles.push(r);
          chip.classList.toggle('on');
        },
      }, `${r} · ${ROLE_NAMES[r]}`);
      chips.append(chip);
    }

    const availToggle = h('div', { class: 'segmented' },
      h('button', { class: draft.active ? 'on' : '', type: 'button', onclick: (e) => setAvail(true, e) }, 'Käytettävissä'),
      h('button', { class: !draft.active ? 'on' : '', type: 'button', onclick: (e) => setAvail(false, e) }, 'Ei käytettävissä'));
    function setAvail(v, e) {
      draft.active = v;
      [...availToggle.children].forEach((b) => b.classList.remove('on'));
      e.currentTarget.classList.add('on');
    }

    add(body,
      h('label', { class: 'field' }, h('span', { text: 'Nimi' }), nameInput),
      h('div', { class: 'field-row' },
        h('label', { class: 'field', style: 'flex:1' }, h('span', { text: 'Pelinumero' }), numInput),
        h('label', { class: 'field', style: 'flex:1' }, h('span', { text: 'Vahvempi jalka' }), footSel)),
      h('label', { class: 'field' }, h('span', { text: 'Pelipaikat' }), chips),
      h('label', { class: 'field', style: 'margin-top:12px' }, h('span', { text: 'Tilanne' }), availToggle),
      h('label', { class: 'field' }, h('span', { text: 'Muistiinpanot' }), notesInput),
      h('button', {
        class: 'btn primary',
        onclick: () => {
          const name = nameInput.value.trim();
          if (!name) { toast('Anna pelaajan nimi'); nameInput.focus(); return; }
          const data = {
            name,
            number: numInput.value === '' ? null : Number(numInput.value),
            roles: draft.roles,
            foot: footSel.value,
            notes: notesInput.value.trim(),
            active: draft.active,
          };
          if (isNew) { addPlayer(data); toast('Pelaaja lisätty'); }
          else { updatePlayer(player.id, data); toast('Tallennettu'); }
          close();
        },
      }, isNew ? 'Lisää pelaaja' : 'Tallenna'),
      isNew ? null : h('button', {
        class: 'btn danger', style: 'margin-top:10px',
        onclick: async () => {
          if (await confirmSheet('Poista pelaaja', `Poistetaanko ${player.name}? Pelaaja poistuu myös kokoonpanoista ja tilastoista.`)) {
            removePlayer(player.id);
            toast('Pelaaja poistettu');
          }
        },
      }, 'Poista pelaaja'));

    if (isNew) setTimeout(() => nameInput.focus(), 60);
  });
}
