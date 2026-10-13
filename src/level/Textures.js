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
  g.font = '900 72px "Unbounded", "Arial Black", sans-serif';
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
