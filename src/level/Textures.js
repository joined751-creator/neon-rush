import * as THREE from 'three';

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d')];
}

function tex(c, { repeat = false, srgb = true, aniso = 8 } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; }
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = aniso;
  return t;
}

const hex = (n) => '#' + new THREE.Color(n).getHexString();

/** Asphalt colour map (u across road, v along). */
export function roadTexture() {
  const [c, g] = canvas(256, 512);
  g.fillStyle = '#17141f';
  g.fillRect(0, 0, 256, 512);
  const img = g.getImageData(0, 0, 256, 512);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (Math.random() * 22) | 0;
    img.data[i] += n; img.data[i + 1] += n; img.data[i + 2] += n + 4;
  }
  g.putImageData(img, 0, 0);
  // subtle tyre wear lanes
  g.fillStyle = 'rgba(0,0,0,0.18)';
  for (const u of [0.28, 0.38, 0.62, 0.72]) g.fillRect(u * 256 - 6, 0, 12, 512);
  // painted lines (dim base; glow comes from emissive map)
  g.fillStyle = '#c8c8d8';
  g.fillRect(13, 0, 8, 512); g.fillRect(235, 0, 8, 512);
  g.fillRect(124, 0, 8, 220);
  g.fillStyle = 'rgba(200,200,220,0.35)';
  g.fillRect(84, 0, 2, 160); g.fillRect(170, 0, 2, 160);
  return tex(c, { repeat: true });
}

/** Emissive lines for the road: edges + centre dashes. */
export function roadEmissiveTexture() {
  const [c, g] = canvas(256, 512);
  g.fillStyle = '#000';
  g.fillRect(0, 0, 256, 512);
  g.shadowColor = '#fff';
  g.shadowBlur = 6;
  g.fillStyle = '#fff';
  g.fillRect(14, 0, 6, 512); g.fillRect(236, 0, 6, 512);
  g.fillStyle = '#aaa';
  g.fillRect(125, 0, 6, 220);
  g.fillStyle = '#555';
  g.fillRect(84, 0, 3, 120); g.fillRect(169, 0, 3, 120);
  return tex(c, { repeat: true, srgb: false });
}

/** Barrier: bright neon band on top, chevrons below. */
export function wallEmissiveTexture() {
  const [c, g] = canvas(128, 128);
  g.fillStyle = '#000';
  g.fillRect(0, 0, 128, 128);
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, 128, 14);
  g.fillStyle = 'rgba(255,255,255,0.22)';
  for (let x = -128; x < 256; x += 32) {
    g.beginPath();
    g.moveTo(x, 30); g.lineTo(x + 16, 30); g.lineTo(x + 34, 79); g.lineTo(x + 16, 128); g.lineTo(x, 128); g.lineTo(x + 18, 79);
    g.closePath(); g.fill();
  }
  g.fillStyle = 'rgba(255,255,255,0.5)';
  g.fillRect(0, 120, 128, 8);
  return tex(c, { repeat: true, srgb: false });
}

export function checkerTexture() {
  const [c, g] = canvas(256, 64);
  for (let y = 0; y < 4; y++) for (let x = 0; x < 16; x++) {
    g.fillStyle = (x + y) % 2 ? '#111' : '#f4f4f4';
    g.fillRect(x * 16, y * 16, 16, 16);
  }
  return tex(c);
}

export function boostPadTexture() {
  const [c, g] = canvas(128, 256);
  g.fillStyle = '#000';
  g.fillRect(0, 0, 128, 256);
  g.fillStyle = '#fff';
  for (let y = 0; y < 256; y += 64) {
    g.beginPath();
    g.moveTo(14, y + 52); g.lineTo(64, y + 14); g.lineTo(114, y + 52);
    g.lineTo(114, y + 34 + 18); g.lineTo(96, y + 52); g.lineTo(64, y + 32); g.lineTo(32, y + 52);
    g.closePath(); g.fill();
  }
  return tex(c, { repeat: true, srgb: false });
}

export function radialTexture(inner = 'rgba(255,255,255,1)', outer = 'rgba(255,255,255,0)') {
  const [c, g] = canvas(128, 128);
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, inner);
  gr.addColorStop(1, outer);
  g.fillStyle = gr;
  g.fillRect(0, 0, 128, 128);
  return tex(c, { srgb: false });
}

export function bannerTexture(text, color, sub = '') {
  const [c, g] = canvas(1024, 160);
  g.fillStyle = '#06030c';
  g.fillRect(0, 0, 1024, 160);
  g.strokeStyle = hex(color);
  g.lineWidth = 6;
  g.strokeRect(8, 8, 1008, 144);
  g.font = '900 92px "Unbounded", "Arial Black", sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.shadowColor = hex(color);
  g.shadowBlur = 24;
  g.fillStyle = '#ffffff';
  g.fillText(text, 512, sub ? 70 : 82);
  if (sub) {
    g.font = '600 30px "IBM Plex Mono", monospace';
    g.fillStyle = hex(color);
    g.fillText(sub, 512, 130);
  }
  return tex(c);
}

export function windowsTexture() {
  const [c, g] = canvas(128, 256);
  g.fillStyle = '#000';
  g.fillRect(0, 0, 128, 256);
  const cols = ['#00e5ff', '#ff2bd6', '#ffd36b', '#8a5cff', '#ffffff'];
  for (let y = 4; y < 256; y += 10) for (let x = 4; x < 128; x += 12) {
    if (Math.random() < 0.38) {
      g.fillStyle = cols[(Math.random() * cols.length) | 0];
      g.globalAlpha = 0.35 + Math.random() * 0.65;
      g.fillRect(x, y, 7, 5);
    }
  }
  g.globalAlpha = 1;
  return tex(c, { repeat: true });
}

export function labelTexture(text, color) {
  const [c, g] = canvas(256, 128);
  // long names (ЛЕГЕНДА, ПРИЗРАК) used to be cut at the edges: shrink the font until the word fits
  let size = 72;
  g.font = `900 ${size}px "Unbounded", "Arial Black", sans-serif`;
  while (size > 30 && g.measureText(text).width > 232) { size -= 4; g.font = `900 ${size}px "Unbounded", "Arial Black", sans-serif`; }
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.lineWidth = 10;
  g.strokeStyle = 'rgba(0,0,0,0.85)';
  g.strokeText(text, 128, 64);
  g.fillStyle = hex(color);
  g.shadowColor = hex(color);
  g.shadowBlur = 16;
  g.fillText(text, 128, 64);
  return tex(c);
}

// ------------------------------------------------------------------------------------------------
// World-dressing textures (procedural, generated once per race and disposed with it)
// ------------------------------------------------------------------------------------------------

/** Tileable value noise on an integer lattice of period `per`. */
function tileNoise(per, seed) {
  const lat = new Float32Array(per * per);
  let s = seed >>> 0;
  for (let i = 0; i < lat.length; i++) { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; lat[i] = s / 4294967296; }
  return (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    const X0 = ((xi % per) + per) % per, Y0 = ((yi % per) + per) % per, X1 = (X0 + 1) % per, Y1 = (Y0 + 1) % per;
    const a = lat[Y0 * per + X0], b = lat[Y0 * per + X1], c = lat[Y1 * per + X0], d = lat[Y1 * per + X1];
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  };
}

/**
 * Asphalt detail (linear data, RGB used separately by the road shader):
 *  R = fine aggregate / grain (sampled every ~3.5 m), G = large blotches / wear (~64 m),
 *  B = cracks + sealed patches mask (~28 m). All channels tile seamlessly.
 */
export function asphaltDetailTexture(size = 512) {
  const [c, g] = canvas(size, size);
  const img = g.createImageData(size, size);
  const d = img.data;
  const n1 = tileNoise(64, 11), n2 = tileNoise(16, 23), n3 = tileNoise(8, 37), n4 = tileNoise(32, 51);
  let s = 12345;
  const rnd = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const fx = x / size, fy = y / size;
      // grain: mid-frequency + per-pixel speckle (bright stones / dark pores)
      let r = 0.5 + (n1(fx * 64, fy * 64) - 0.5) * 0.5 + (n4(fx * 32, fy * 32) - 0.5) * 0.35;
      const sp = rnd();
      if (sp > 0.965) r += 0.35 * rnd(); else if (sp < 0.05) r -= 0.3;
      r += (rnd() - 0.5) * 0.18;
      // macro blotches
      const gch = 0.5 + (n3(fx * 8, fy * 8) - 0.5) * 0.9 + (n2(fx * 16, fy * 16) - 0.5) * 0.35;
      const i = (y * size + x) * 4;
      d[i] = Math.max(0, Math.min(255, r * 255));
      d[i + 1] = Math.max(0, Math.min(255, gch * 255));
      d[i + 2] = 0;
      d[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  // B channel: draw patches + cracks on a separate canvas, wrapped 3x3 so it tiles
  const [c2, g2] = canvas(size, size);
  g2.fillStyle = '#000';
  g2.fillRect(0, 0, size, size);
  const k = size / 512;
  for (const ox of [-size, 0, size]) for (const oy of [-size, 0, size]) {
    s = 777;
    g2.save();
    g2.translate(ox, oy);
    // sealed rectangular patches
    for (let p = 0; p < 3; p++) {
      const w = (40 + rnd() * 90) * k, h = (60 + rnd() * 140) * k, px = rnd() * size, py = rnd() * size;
      g2.fillStyle = `rgba(110,110,110,${0.5 + rnd() * 0.3})`;
      g2.fillRect(px, py, w, h);
    }
    // cracks: jittered random walks
    g2.strokeStyle = 'rgba(255,255,255,0.95)';
    g2.lineCap = 'round';
    for (let cr = 0; cr < 7; cr++) {
      let px = rnd() * size, py = rnd() * size, a = rnd() * Math.PI * 2;
      g2.lineWidth = (1 + rnd() * 1.6) * k;
      g2.beginPath();
      g2.moveTo(px, py);
      const steps = 10 + rnd() * 26;
      for (let st = 0; st < steps; st++) {
        a += (rnd() - 0.5) * 1.2;
        px += Math.cos(a) * 9 * k; py += Math.sin(a) * 9 * k;
        g2.lineTo(px, py);
        if (rnd() < 0.12) { // branch
          const bx = px + Math.cos(a + 1.2) * 18 * k, by = py + Math.sin(a + 1.2) * 18 * k;
          g2.moveTo(bx, by); g2.lineTo(px, py);
        }
      }
      g2.stroke();
    }
    g2.restore();
  }
  const bd = g2.getImageData(0, 0, size, size).data;
  for (let i = 0; i < d.length; i += 4) d[i + 2] = bd[i];
  g.putImageData(img, 0, 0);
  const t = tex(c, { repeat: true, srgb: false, aniso: 8 });
  return t;
}

/** Sign atlas layout in a 2048x1024 reference space (scaled for smaller atlases). */
export const ATLAS_CELLS = {
  board: [[0, 0, 1024, 256], [1024, 0, 1024, 256], [0, 256, 1024, 256], [1024, 256, 1024, 256], [0, 512, 1024, 256], [1024, 512, 1024, 256]],
  strip: [[0, 768, 1024, 128], [1024, 768, 1024, 128], [1024, 896, 1024, 128]],
  chevron: [0, 896, 384, 128],
  checker: [384, 896, 640, 128],
};
/** uv rect [u0, v0, u1, v1] of a cell (canvas flipY → v measured from bottom). Half-texel inset avoids bleeding. */
export function atlasRect(cell) {
  const [x, y, w, h] = cell;
  const e = 2;
  return [(x + e) / 2048, 1 - (y + h - e) / 1024, (x + w - e) / 2048, 1 - (y + e) / 1024];
}

function glowText(g, text, x, y, font, fill, glow, blur, stroke = null) {
  g.font = font;
  g.shadowColor = glow;
  g.shadowBlur = blur;
  if (stroke) { g.strokeStyle = stroke; g.lineWidth = 3; g.strokeText(text, x, y); }
  g.fillStyle = fill;
  g.fillText(text, x, y);
  g.shadowBlur = blur * 0.4;
  g.fillText(text, x, y);
  g.shadowBlur = 0;
}

function fitFont(g, text, weight, family, maxW, maxPx) {
  let px = maxPx;
  g.font = `${weight} ${px}px ${family}`;
  const w = g.measureText(text).width;
  if (w > maxW) px = Math.floor(px * maxW / w);
  return `${weight} ${px}px ${family}`;
}

const DISPLAY = '"Unbounded", "Arial Black", "Impact", sans-serif';
const MONO = '"JetBrains Mono", "Courier New", monospace';

function drawBoard(g, x, y, w, h, spec) {
  const { title, sub, c1, c2, icon } = spec;
  g.save();
  g.beginPath(); g.rect(x, y, w, h); g.clip();
  // background: deep gradient + faint scanlines + vignette
  const bg = g.createLinearGradient(x, y, x + w, y + h);
  bg.addColorStop(0, '#07030f'); bg.addColorStop(0.55, '#120622'); bg.addColorStop(1, '#05020a');
  g.fillStyle = bg; g.fillRect(x, y, w, h);
  g.globalAlpha = 0.18;
  g.fillStyle = c2;
  for (let yy = y + 3; yy < y + h; yy += 6) g.fillRect(x, yy, w, 1);
  g.globalAlpha = 1;
  // diagonal accent shapes
  g.globalAlpha = 0.28;
  const acc = g.createLinearGradient(x, y, x + w * 0.4, y);
  acc.addColorStop(0, c1); acc.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = acc;
  g.beginPath(); g.moveTo(x, y); g.lineTo(x + w * 0.33, y); g.lineTo(x + w * 0.22, y + h); g.lineTo(x, y + h); g.fill();
  g.globalAlpha = 1;
  // neon frame (double line)
  g.shadowColor = c1; g.shadowBlur = 18;
  g.strokeStyle = c1; g.lineWidth = 7;
  g.strokeRect(x + 12, y + 12, w - 24, h - 24);
  g.shadowBlur = 0;
  g.strokeStyle = c2; g.lineWidth = 2;
  g.strokeRect(x + 26, y + 26, w - 52, h - 52);
  // icon
  let tx = x + w / 2;
  const iconW = icon ? h * 0.7 : 0;
  if (icon) {
    const cx = x + 40 + iconW / 2, cy = y + h / 2, r = h * 0.28;
    g.shadowColor = c2; g.shadowBlur = 20;
    g.strokeStyle = c2; g.fillStyle = c2; g.lineWidth = 8;
    if (icon === 'bolt') {
      g.beginPath(); g.moveTo(cx + r * 0.2, cy - r * 1.1); g.lineTo(cx - r * 0.6, cy + r * 0.15); g.lineTo(cx - r * 0.02, cy + r * 0.15);
      g.lineTo(cx - r * 0.3, cy + r * 1.1); g.lineTo(cx + r * 0.65, cy - r * 0.2); g.lineTo(cx + r * 0.05, cy - r * 0.2); g.closePath(); g.fill();
    } else if (icon === 'sun') {
      const sg = g.createLinearGradient(0, cy - r, 0, cy + r);
      sg.addColorStop(0, '#ffe14d'); sg.addColorStop(1, c1);
      g.fillStyle = sg;
      g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#07030f';
      for (let k = 0; k < 4; k++) g.fillRect(cx - r, cy + r * (0.1 + k * 0.24), r * 2, 3 + k * 2.5);
    } else if (icon === 'wave') {
      g.beginPath();
      for (let k = 0; k <= 40; k++) { const px = cx - r * 1.1 + (k / 40) * r * 2.2; const py = cy + Math.sin(k * 0.6) * r * 0.5 * Math.sin(k / 40 * Math.PI); k ? g.lineTo(px, py) : g.moveTo(px, py); }
      g.stroke();
      g.beginPath(); g.arc(cx, cy, r * 1.15, 0, Math.PI * 2); g.lineWidth = 4; g.stroke();
    } else if (icon === 'flag') {
      const q = r * 0.42;
      for (let yy = 0; yy < 4; yy++) for (let xx = 0; xx < 4; xx++) if ((xx + yy) % 2 === 0) g.fillRect(cx - r * 0.85 + xx * q, cy - r * 0.85 + yy * q, q, q);
      g.strokeRect(cx - r * 0.85, cy - r * 0.85, q * 4, q * 4);
    } else if (icon === 'drop') {
      g.beginPath(); g.moveTo(cx, cy - r * 1.1); g.quadraticCurveTo(cx + r, cy + r * 0.2, cx, cy + r); g.quadraticCurveTo(cx - r, cy + r * 0.2, cx, cy - r * 1.1); g.fill();
    } else if (icon === 'flame') {
      g.beginPath(); g.moveTo(cx, cy - r * 1.15); g.bezierCurveTo(cx + r * 1.1, cy - r * 0.2, cx + r * 0.7, cy + r, cx, cy + r);
      g.bezierCurveTo(cx - r * 0.7, cy + r, cx - r * 1.1, cy - r * 0.1, cx - r * 0.2, cy - r * 0.5); g.closePath(); g.fill();
    } else if (icon === 'flake') {
      for (let k = 0; k < 3; k++) { const a = k * Math.PI / 3; g.beginPath(); g.moveTo(cx - Math.cos(a) * r, cy - Math.sin(a) * r); g.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r); g.stroke(); }
    }
    g.shadowBlur = 0;
    tx = x + 40 + iconW + (w - 80 - iconW) / 2;
  }
  g.textAlign = 'center'; g.textBaseline = 'middle';
  const maxW = w - 110 - iconW;
  glowText(g, title, tx, y + h * (sub ? 0.43 : 0.52), fitFont(g, title, 900, DISPLAY, maxW, h * 0.46), '#ffffff', c1, 26, c1);
  if (sub) {
    g.font = fitFont(g, sub, 700, MONO, maxW, h * 0.15);
    g.fillStyle = c2; g.shadowColor = c2; g.shadowBlur = 10;
    g.fillText(sub, tx, y + h * 0.78);
    g.shadowBlur = 0;
  }
  g.restore();
}

function drawStrip(g, x, y, w, h, text, c1, c2) {
  g.save();
  g.beginPath(); g.rect(x, y, w, h); g.clip();
  g.fillStyle = '#06030c'; g.fillRect(x, y, w, h);
  g.shadowColor = c1; g.shadowBlur = 14; g.strokeStyle = c1; g.lineWidth = 6;
  g.strokeRect(x + 8, y + 8, w - 16, h - 16);
  g.shadowBlur = 0;
  // letters rotated −90° so the strip reads top→bottom (upright letters) once mapped vertically
  const letters = [...text];
  const step = (w - 60) / letters.length;
  g.textAlign = 'center'; g.textBaseline = 'middle';
  const font = `900 ${Math.min(h * 0.62, step * 0.95)}px ${DISPLAY}`;
  letters.forEach((ch, i) => {
    g.save();
    g.translate(x + 30 + step * (i + 0.5), y + h / 2);
    g.rotate(-Math.PI / 2);
    glowText(g, ch, 0, 0, font, '#ffffff', i % 2 ? c2 : c1, 18);
    g.restore();
  });
  g.restore();
}

/**
 * Atlas with fictional neon signage. specs: 6 board specs ({title, sub, c1, c2, icon}), strips: 3 strings.
 * size = atlas width (2048 or 1024).
 */
export function signAtlasTexture(specs, strips, size = 2048) {
  const [c, g] = canvas(2048, 1024);
  g.fillStyle = '#000'; g.fillRect(0, 0, 2048, 1024);
  ATLAS_CELLS.board.forEach((cell, i) => drawBoard(g, ...cell, specs[i % specs.length]));
  ATLAS_CELLS.strip.forEach((cell, i) => drawStrip(g, ...cell, strips[i % strips.length], specs[i % specs.length].c1, specs[(i + 1) % specs.length].c2));
  // chevron sign: three bold arrows pointing +u
  {
    const [x, y, w, h] = ATLAS_CELLS.chevron;
    g.fillStyle = '#08050e'; g.fillRect(x, y, w, h);
    g.fillStyle = '#ffffff';
    for (let k = 0; k < 3; k++) {
      const ox = x + 40 + k * 110;
      g.beginPath(); g.moveTo(ox, y + 14); g.lineTo(ox + 46, y + 14); g.lineTo(ox + 96, y + 64); g.lineTo(ox + 46, y + 114); g.lineTo(ox, y + 114); g.lineTo(ox + 50, y + 64); g.closePath(); g.fill();
    }
    g.strokeStyle = '#ffffff'; g.lineWidth = 6; g.strokeRect(x + 4, y + 4, w - 8, h - 8);
  }
  {
    const [x, y, w, h] = ATLAS_CELLS.checker;
    const q = h / 2;
    for (let yy = 0; yy < 2; yy++) for (let xx = 0; xx < w / q; xx++) {
      g.fillStyle = (xx + yy) % 2 ? '#0b0b10' : '#f4f4f8';
      g.fillRect(x + xx * q, y + yy * q, q, q);
    }
  }
  let out = c;
  if (size < 2048) {
    const [c2, g2] = canvas(size, size / 2);
    g2.drawImage(c, 0, 0, size, size / 2);
    out = c2;
  }
  const t = tex(out, { aniso: 8 });
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  return t;
}
