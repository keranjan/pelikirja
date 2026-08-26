// Joukkueen tiedot, varmuuskopiot ja tietojen tyhjennys.
import { h, sheet, toast, confirmSheet } from '../ui.js';
import { getState, update, exportJSON, importJSON, resetAll, applyTheme } from '../store.js';

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

  body.append(h('div', { class: 'section-title', text: 'Ulkoasu' }));
  const theme = st.team.theme || 'system';
  const themeSeg = h('div', { class: 'segmented' },
    ...[['system', 'Järjestelmä'], ['light', 'Vaalea'], ['dark', 'Tumma']].map(([value, label]) =>
      h('button', {
        class: theme === value ? 'on' : '',
        onclick: () => {
          update((s) => { s.team.theme = value; });
          applyTheme(value);
        },
      }, label)));
  body.append(h('div', { class: 'card stack' },
    themeSeg,
    h('p', { class: 'tiny muted', text: 'Vaalea ulkoasu erottuu parhaiten auringossa, tumma iltapeleissä. Järjestelmä seuraa puhelimen asetusta.' })));

  body.append(h('div', { class: 'section-title', text: 'Varmuuskopio' }));
  body.append(h('div', { class: 'card stack' },
    h('p', { class: 'small muted', text: 'Kaikki tiedot tallentuvat vain tähän laitteeseen. Ota varmuuskopio ennen selaimen tietojen tyhjennystä tai kun vaihdat puhelinta.' }),
    h('button', { class: 'btn', onclick: doExport }, 'Vie tiedot'),
    h('button', { class: 'btn', onclick: doImport }, 'Tuo tiedot')));

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

  return { title: 'Asetukset', back: '#/ottelupaiva', body };
}

function doExport() {
  const json = exportJSON();
  const name = `pelikirja-${new Date().toISOString().slice(0, 10)}.json`;

  sheet('Vie tiedot', (body) => {
    body.append(
      h('p', { class: 'small muted', text: 'Tallenna varmuuskopio tiedostoksi tai kopioi se talteen esimerkiksi muistiinpanoihin. Tuo se myöhemmin takaisin Tuo tiedot -painikkeella.' }),
      h('button', {
        class: 'btn primary', style: 'margin-bottom:10px',
        onclick: () => {
          const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
          const a = h('a', { href: url, download: name, style: 'display:none' });
          document.body.append(a);
          a.click();
          a.remove();
          setTimeout(() => URL.revokeObjectURL(url), 1000);
          toast('Tiedosto tallennettu');
        },
      }, 'Lataa varmuuskopio'),
      h('button', {
        class: 'btn', style: 'margin-bottom:14px',
        onclick: async () => {
          try {
            await navigator.clipboard.writeText(json);
            toast('Varmuuskopio kopioitu');
          } catch {
            ta.focus();
            ta.select();
            toast('Kopioi teksti alta');
          }
        },
      }, 'Kopioi leikepöydälle'));
    const ta = h('textarea', { style: 'min-height:160px;font-family:ui-monospace,monospace;font-size:12px', text: json });
    body.append(ta);
  });
}

function doImport() {
  sheet('Tuo tiedot', (body, close) => {
    const ta = h('textarea', {
      style: 'min-height:160px;font-family:ui-monospace,monospace;font-size:12px',
      placeholder: 'Liitä varmuuskopion sisältö tähän',
    });

    const load = (text) => {
      try {
        importJSON(text);
        close();
        toast('Tiedot tuotu');
      } catch (e) {
        toast('Sisältö ei kelpaa varmuuskopioksi');
        console.warn(e);
      }
    };

    const file = h('input', { type: 'file', accept: 'application/json,.json', style: 'display:none' });
    file.addEventListener('change', async () => {
      if (file.files?.[0]) load(await file.files[0].text());
    });

    body.append(
      h('p', { class: 'small muted', text: 'Nykyiset tiedot korvautuvat varmuuskopion sisällöllä.' }),
      file,
      h('button', { class: 'btn primary', style: 'margin-bottom:10px', onclick: () => file.click() }, 'Valitse tiedosto'),
      h('div', { class: 'section-title', text: 'Tai liitä teksti' }),
      ta,
      h('button', { class: 'btn', style: 'margin-top:10px', onclick: () => load(ta.value) }, 'Tuo liitetty teksti'));
  });
}
