// Sovelluksen käynnistys ja reititys.
import { h, clear } from './ui.js';
import { icon } from './icons.js';
import { getState, subscribe, applyTheme } from './store.js';
import { setRenderer } from './router.js';
import { homeView } from './views/home.js';
import { matchesView } from './views/matches.js';
import { matchView } from './views/match.js';
import { lineupsView, lineupView } from './views/lineups.js';
import { playersView } from './views/players.js';
import { statsView } from './views/stats.js';
import { settingsView } from './views/settings.js';
import { navigate } from './router.js';
import { startAutoSync } from './sync.js';

const TABS = [
  { href: '#/ottelupaiva', ic: 'ball', label: 'Ottelupäivä' },
  { href: '#/ottelut', ic: 'calendar', label: 'Ottelut' },
  { href: '#/kokoonpanot', ic: 'lineup', label: 'Kokoonpanot' },
  { href: '#/pelaajat', ic: 'players', label: 'Pelaajat' },
  { href: '#/tilastot', ic: 'chart', label: 'Tilastot' },
];

const ROUTES = [
  { re: /^#?\/?$/,                 view: () => homeView(),            tab: '#/ottelupaiva' },
  { re: /^#\/ottelupaiva$/,        view: () => homeView(),            tab: '#/ottelupaiva' },
  { re: /^#\/ottelut$/,            view: () => matchesView(),         tab: '#/ottelut' },
  { re: /^#\/ottelu\/([\w-]+)$/,   view: (m) => matchView(m[1]),      tab: '#/ottelut' },
  { re: /^#\/kokoonpanot$/,        view: () => lineupsView(),         tab: '#/kokoonpanot' },
  { re: /^#\/kokoonpano\/([\w-]+)$/, view: (m) => lineupView(m[1]),   tab: '#/kokoonpanot' },
  { re: /^#\/pelaajat$/,           view: () => playersView(),         tab: '#/pelaajat' },
  { re: /^#\/tilastot$/,           view: () => statsView(),           tab: '#/tilastot' },
  { re: /^#\/asetukset$/,          view: () => settingsView(),        tab: '#/ottelupaiva' },
];

function resolve() {
  const hash = location.hash || '#/ottelupaiva';
  for (const r of ROUTES) {
    const m = hash.match(r.re);
    if (m) return { spec: r, params: m };
  }
  return { spec: ROUTES[1], params: null };
}

let currentTab = '#/ottelupaiva';

function renderTabs() {
  const nav = clear(document.getElementById('tabbar'));
  for (const t of TABS) {
    nav.append(h('a', { href: t.href, class: t.href === currentTab ? 'active' : '' },
      h('span', { class: 'ic' }, icon(t.ic, 21)), h('span', { text: t.label })));
  }
}

function render() {
  applyTheme();
  const { spec, params } = resolve();
  currentTab = spec.tab;

  let page;
  try {
    page = spec.view(params);
  } catch (err) {
    console.error(err);
    page = { title: 'Virhe', body: h('div', { class: 'empty' }, String(err.message || err)) };
  }

  const bar = clear(document.getElementById('topbar'));
  if (page.back) {
    bar.append(h('button', { class: 'iconbtn', 'aria-label': 'Takaisin', onclick: () => navigate(page.back) }, icon('back', 22)));
  }
  bar.append(h('h1', {},
    page.title,
    page.subtitle ? h('span', { class: 'sub', text: page.subtitle }) : null));
  for (const a of page.actions || []) {
    bar.append(h('button', {
      class: a.label ? 'iconbtn wide' : 'iconbtn',
      'aria-label': a.aria || a.label || 'toiminto',
      onclick: a.onClick,
    }, a.icon || '', a.label || ''));
  }

  const view = clear(document.getElementById('view'));
  view.append(page.body);
  view.scrollTop = 0;
  renderTabs();
  document.title = `${page.title} · Pelikirja`;
}

setRenderer(render);
startAutoSync();
window.addEventListener('hashchange', render);
subscribe(() => render());

// Ensimmäinen piirto
if (!location.hash) location.hash = '#/ottelupaiva';
render();

// Näytä joukkueen nimi dokumentin otsikossa heti alussa
void getState;

// Service worker (offline-tuki)
if ('serviceWorker' in navigator && location.protocol.startsWith('http') && !window.__PELIKIRJA_YKSITIEDOSTO__) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch((e) => console.warn('SW:', e));
  });
}
