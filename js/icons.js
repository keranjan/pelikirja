// Viivakuvakkeet käyttöliittymään. Piirretään currentColor-värillä, joten ne
// seuraavat tekstin väriä sekä vaaleassa että tummassa ulkoasussa.

const NS = 'http://www.w3.org/2000/svg';

const PATHS = {
  ball: '<circle cx="12" cy="12" r="8.6"/><path d="M12 7.4l4 2.9-1.5 4.7h-5L8 10.3z"/><path d="M12 3.4v4M19.8 9.6l-3.8 2.8M16.5 20.2L15 15M7.5 20.2L9 15M4.2 9.6l3.8 2.8"/>',
  calendar: '<rect x="3.4" y="5.2" width="17.2" height="15.4" rx="2.6"/><path d="M3.4 9.8h17.2M8 3.2v4M16 3.2v4"/>',
  lineup: '<rect x="4.4" y="4.4" width="15.2" height="16.2" rx="2.6"/><path d="M9 4.4V3.1h6v1.3"/><circle cx="8.8" cy="11" r="1.15"/><circle cx="15.2" cy="11" r="1.15"/><circle cx="12" cy="16.2" r="1.15"/>',
  players: '<circle cx="9.2" cy="8.4" r="3.1"/><path d="M3.4 19.8c0-3.1 2.6-5.2 5.8-5.2s5.8 2.1 5.8 5.2"/><circle cx="17.4" cy="9.6" r="2.3"/><path d="M16 15.1c2.7-.5 4.9 1.4 4.9 4.7"/>',
  chart: '<path d="M5.2 20.2v-8.4M12 20.2V4.8M18.8 20.2v-5.6"/>',
  settings: '<path d="M4 7.5h9M17.5 7.5h2.5M4 16.5h2.5M11 16.5h9"/><circle cx="15" cy="7.5" r="2.3"/><circle cx="8.8" cy="16.5" r="2.3"/>',
  back: '<path d="M14.5 5.5L8 12l6.5 6.5"/>',
  note: '<path d="M6 3.6h8.5L19 8.1v12.3H6z"/><path d="M14.2 3.8v4.4h4.4M9 12.5h6M9 16h4"/>',
  trophy: '<path d="M7.5 4h9v4.5a4.5 4.5 0 01-9 0z"/><path d="M7.5 5.5H5a2.5 2.5 0 002.5 2.5M16.5 5.5H19a2.5 2.5 0 01-2.5 2.5M12 13v3.5M8.5 20h7M9.5 20v-1.4c0-1.2 1-2.1 2.5-2.1s2.5.9 2.5 2.1V20"/>',
  play: '<path d="M8.5 5.5l9 6.5-9 6.5z"/>',
};

export function icon(name, size = 22) {
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', size);
  svg.setAttribute('height', size);
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', name === 'chart' ? '2.2' : '1.7');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  svg.innerHTML = PATHS[name] || '';
  return svg;
}
