// Pelaajaluettelo ja pelaajakortin muokkaus.
import { icon } from '../icons.js';
import { h, add, sheet, toast, confirmSheet } from '../ui.js';
import { ROLES, ROLE_NAMES } from '../formations.js';
import { getState, sortedPlayers, addPlayer, updatePlayer, removePlayer } from '../store.js';

export function playersView() {
  const players = sortedPlayers(getState().players);
  const body = h('div', { class: 'stack' });

  if (!players.length) {
    body.append(h('div', { class: 'empty' },
      h('span', { class: 'big' }, icon('players', 30)),
      h('p', { text: 'Ei vielä pelaajia.' }),
      h('p', { class: 'small', text: 'Lisää joukkueesi pelaajat, niin voit rakentaa kokoonpanot.' }),
      h('button', { class: 'btn primary', style: 'margin-top:14px;max-width:260px', onclick: () => openPlayerSheet(null) }, '＋ Lisää ensimmäinen pelaaja')));
    return { title: 'Pelaajat', body };
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

  body.append(h('div', { class: 'section-title', text: `Ryhmä (${active.length})` }));
  active.forEach((p) => body.append(card(p)));

  if (inactive.length) {
    body.append(h('div', { class: 'section-title', text: `Ei käytettävissä (${inactive.length})` }));
    inactive.forEach((p) => body.append(card(p)));
  }

  return {
    title: 'Pelaajat',
    subtitle: `${active.length} pelaajaa`,
    actions: [{ icon: '＋', aria: 'Lisää pelaaja', onClick: () => openPlayerSheet(null) }],
    body,
  };
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
