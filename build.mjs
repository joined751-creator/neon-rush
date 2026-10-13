// Build: bundle src/main.js with Bun, inline CSS + markup.
// Outputs: dist/index.html (standalone full document) and dist/artifact.html (fragment for publishing).
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
writeFileSync('./dist/index.html', `<!doctype html>\n<html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n${fragment}</head><body></body></html>\n`);
console.log('built', (fragment.length / 1024).toFixed(0) + ' KB');
