// Build: bundle src/main.js with Bun, inline CSS + markup.
// Outputs: dist/index.html (standalone full document), dist/artifact.html (fragment for publishing)
// and ./index.html (no-build entry for GitHub Pages: ES modules + Three.js via import map + PWA tags).
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const res = await Bun.build({ entrypoints: ['./src/main.js'], minify: true, target: 'browser', format: 'esm' });
if (!res.success) { console.error(res.logs); process.exit(1); }
const js = (await res.outputs[0].text()).replace(/<\/script/gi, '<\\/script');
const css = readFileSync('./src/ui/style.css', 'utf8');
const markup = readFileSync('./src/ui/markup.html', 'utf8');
const fonts = '<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Unbounded:wght@600;700;800;900&family=Exo+2:wght@400;600;700&family=JetBrains+Mono:wght@400;700&display=swap">';
const fragment = `<title>Neon Rush</title>\n${fonts}\n<style>\n${css}\n</style>\n${markup}\n<script type="module">\n${js}\n</script>\n`;
mkdirSync('./dist', { recursive: true });
writeFileSync('./dist/artifact.html', fragment);
const VIEWPORT = '<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover">';
const MOBILE = '<meta name="theme-color" content="#07040f">\n<meta name="mobile-web-app-capable" content="yes">\n<meta name="apple-mobile-web-app-capable" content="yes">\n<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">\n<meta name="apple-mobile-web-app-title" content="Neon Rush">';
writeFileSync('./dist/index.html', `<!doctype html>\n<html lang="ru"><head><meta charset="utf-8">${VIEWPORT}\n${MOBILE}\n${fragment}</head><body></body></html>\n`);
const IMPORTMAP = JSON.stringify({ imports: { three: 'https://cdn.jsdelivr.net/npm/three@0.180.0/build/three.module.js', 'three/addons/': 'https://cdn.jsdelivr.net/npm/three@0.180.0/examples/jsm/' } }, null, 2);
writeFileSync('./index.html', `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
${VIEWPORT}
<title>Neon Rush</title>
<meta name="description" content="3D-аркадная неоновая гонка в браузере: дрифт-турбо, нитро, Гран-при, сплит-скрин. Работает на компьютере и телефоне.">
${MOBILE}
<link rel="manifest" href="manifest.webmanifest">
<link rel="icon" href="icons/icon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="icons/icon.svg">
${fonts.replace(/></g, '>\n<')}
<link rel="stylesheet" href="src/ui/style.css">
<!-- Запуск без сборки: Three.js подгружается с CDN через import map -->
<script type="importmap">
${IMPORTMAP}
</script>
</head>
<body>
${markup.trimEnd()}
<script type="module" src="src/main.js"></script>
</body>
</html>
`);
console.log('built', (fragment.length / 1024).toFixed(0) + ' KB');
