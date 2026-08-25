// Joukkueen tiedot, varmuuskopiot ja tietojen tyhjennys.
import { h, toast, confirmSheet } from '../ui.js';
import { getState, update, exportJSON, importJSON, resetAll } from '../store.js';

export function settingsView() {
  const st = getState();
  const body = h('div', { class: 'stack' });

  const nameI = h('input', { type: 'text', value: st.team.name || '', placeholder: 'Joukkueen nimi' });
  const seasonI = h('input', { type: 'text', value: st.team.season || '', placeholder: '2026' });

  body.append(h('div', { class: 'section-title', text: 'Joukkue' }));
  body.append(h('div', { class: 'card' },
    h('label', { class: 'field' }, h('span', { text: 'Nimi' }), nameI),
    h('label', { class: 'field' }, h('span', { text: 'Kausi' }), seasonI),
    h('button', {
      class: 'btn primary',
      onclick: () => {
        update((s) => { s.team.name = nameI.value.trim() || 'Oma joukkue'; s.team.season = seasonI.value.trim(); });
        toast('Tallennettu');
      },
    }, 'Tallenna')));

  body.append(h('div', { class: 'section-title', text: 'Varmuuskopio' }));
  body.append(h('div', { class: 'card stack' },
    h('p', { class: 'small muted', text: 'Kaikki tiedot tallentuvat vain tähän laitteeseen. Ota varmuuskopio ennen selaimen tietojen tyhjennystä tai kun vaihdat puhelinta.' }),
    h('button', { class: 'btn', onclick: doExport }, '⬇️ Vie tiedot tiedostoon'),
    h('button', { class: 'btn', onclick: doImport }, '⬆️ Tuo tiedot tiedostosta')));

  body.append(h('div', { class: 'section-title', text: 'Sovellus' }));
  body.append(h('div', { class: 'card stack' },
    h('div', { class: 'row between' },
      h('span', { class: 'small muted', text: 'Pelaajia' }), h('span', { class: 'bold', text: String(st.players.length) })),
    h('div', { class: 'row between' },
      h('span', { class: 'small muted', text: 'Tapahtumia' }), h('span', { class: 'bold', text: String(st.matches.length) })),
    h('div', { class: 'row between' },
      h('span', { class: 'small muted', text: 'Kokoonpanopohjia' }), h('span', { class: 'bold', text: String(st.lineups.length) })),
    h('div', { class: 'row between' },
      h('span', { class: 'small muted', text: 'Versio' }), h('span', { class: 'bold', text: '1.0.0' }))));

  body.append(h('button', {
    class: 'btn danger', style: 'margin-top:14px',
    onclick: async () => {
      if (await confirmSheet('Tyhjennä kaikki tiedot', 'Pelaajat, ottelut ja kokoonpanot poistetaan pysyvästi tästä laitteesta.', 'Tyhjennä')) {
        resetAll();
        toast('Tiedot tyhjennetty');
      }
    },
  }, 'Tyhjennä kaikki tiedot'));

  body.append(h('p', { class: 'tiny muted center', style: 'margin-top:18px', text: 'Pelikirja · kokoonpanot, pelipaikat ja ottelut yhdessä paikassa' }));

  return { title: 'Asetukset', body };
}

function doExport() {
  const blob = new Blob([exportJSON()], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `pelikirja-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast('Varmuuskopio viety');
}

function doImport() {
  const input = h('input', { type: 'file', accept: 'application/json,.json', style: 'display:none' });
  input.addEventListener('change', async () => {
    const file = input.files?.[0];
    if (!file) return;
    try {
      importJSON(await file.text());
      toast('Tiedot tuotu');
    } catch (e) {
      toast('Tuonti epäonnistui');
      console.warn(e);
    } finally {
      input.remove();
    }
  });
  document.body.append(input);
  input.click();
}
