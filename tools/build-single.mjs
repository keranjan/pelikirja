// Kokoaa sovelluksen yhdeksi HTML-tiedostoksi (dist/pelikirja.html).
// Yksi tiedosto on kätevä jakaa, avata suoraan puhelimessa tai laittaa mihin tahansa web-hotelliin.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const r = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

const MODULES = [
  'js/router.js', 'js/icons.js', 'js/formations.js', 'js/tactics.js', 'js/timing.js',
  'js/drills.js', 'js/store.js',
  'js/merge.js', 'js/sync.js', 'js/ui.js', 'js/lineup-image.js',
  'js/views/pitch.js', 'js/views/drills.js', 'js/views/tracking.js', 'js/views/players.js', 'js/views/matches.js', 'js/views/home.js',
  'js/views/match.js', 'js/views/lineups.js', 'js/views/stats.js',
  'js/views/settings.js', 'js/app.js',
];

const key = (file) => path.basename(file, '.js');

function transform(file) {
  const src = r(file);
  const exported = new Set();
  let out = src
    .replace(/^import\s+\{([^}]+)\}\s+from\s+['"]([^'"]+)['"];?\s*$/gm,
      (_, names, from) => `const {${names}} = __req('${key(from)}');`)
    .replace(/^export\s+(async\s+)?(const|let|var|function|class)\s+([A-Za-z0-9_$]+)/gm,
      (_, isAsync, kind, name) => { exported.add(name); return `${isAsync || ''}${kind} ${name}`; })
    // export { a, b };
    .replace(/^export\s*\{([^}]+)\}\s*;?\s*$/gm, (_, names) => {
      names.split(',').map((n) => n.trim().split(/\s+as\s+/)[0]).filter(Boolean).forEach((n) => exported.add(n));
      return '';
    });

  const missing = out.match(/^\s*(import|export)\s/m);
  if (missing) throw new Error(`Tuntematon moduulisyntaksi tiedostossa ${file}: ${missing[0]}`);

  return `__mods['${key(file)}'] = () => {\n${out}\nreturn { ${[...exported].join(', ')} };\n};`;
}

const bundle = `
window.__PELIKIRJA_YKSITIEDOSTO__ = true;   // yhden tiedoston versiossa ei ole erillistä service workeria
const __mods = {}, __cache = {};
const __req = (name) => (__cache[name] ??= __mods[name]());
${MODULES.map(transform).join('\n\n')}
__req('app');
`;

const css = r('css/fonts.css') + '\n' + r('css/styles.css');
const icon = r('icons/icon.svg');
const manifest = JSON.parse(r('manifest.webmanifest'));
manifest.start_url = './';
manifest.icons = [{ src: `data:image/svg+xml;base64,${Buffer.from(icon).toString('base64')}`, sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' }];

const html = r('index.html')
  .replace(/\s*<link rel="manifest"[^>]*>/, `\n<link rel="manifest" href="data:application/manifest+json;base64,${Buffer.from(JSON.stringify(manifest)).toString('base64')}">`)
  .replace(/\s*<link rel="icon"[^>]*>/, `\n<link rel="icon" href="data:image/svg+xml;base64,${Buffer.from(icon).toString('base64')}" type="image/svg+xml">`)
  .replace(/\s*<link rel="apple-touch-icon"[^>]*>/, '')
  // Kaikki tyylitiedostot yhdeksi upotetuksi lohkoksi.
  .replace(/\s*<link rel="stylesheet"[^>]*>/g, (() => {
    let inserted = false;
    return () => {
      if (inserted) return '';
      inserted = true;
      return `\n<style>\n${css}\n</style>`;
    };
  })())
  .replace(/\s*<script type="module"[^>]*><\/script>/, `\n<script type="module">\n${bundle}\n</script>`);

fs.mkdirSync(path.join(ROOT, 'dist'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'dist/pelikirja.html'), html);
console.log(`dist/pelikirja.html – ${(html.length / 1024).toFixed(0)} kt`);
