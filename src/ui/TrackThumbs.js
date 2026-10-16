/** Track-card thumbnails: neon outline in the track's theme colour on a faint grid. */
export const TRACK_ACCENT = {
  sunset: { a: '#ff2bd6', b: '#ffb347', label: 'Закат' },
  city: { a: '#00e5ff', b: '#ff2bd6', label: 'Ночь' },
  arctic: { a: '#7df9ff', b: '#b388ff', label: 'Лёд' },
  volcano: { a: '#ff7a1a', b: '#ffd400', label: 'Лава' },
};

export function accentFor(theme) { return TRACK_ACCENT[theme] || TRACK_ACCENT.city; }

/**
 * @param {HTMLCanvasElement} cv
 * @param {{pts:number[][],minX:number,maxX:number,minZ:number,maxZ:number}} o outline
 * @param {{a:string,b:string}} col
 * @param {boolean} on selected
 * @param {boolean} mirror reverse direction arrow
 */
export function drawTrackThumb(cv, o, col, on, mirror) {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const cssW = cv.width, cssH = cv.height;
  if (!cv.dataset.w) { cv.dataset.w = cssW; cv.dataset.h = cssH; }
  const W0 = +cv.dataset.w, H0 = +cv.dataset.h;
  cv.width = W0 * dpr; cv.height = H0 * dpr;
  const g = cv.getContext('2d');
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  const W = W0, H = H0;
  g.clearRect(0, 0, W, H);
  // faint perspective-free grid
  g.strokeStyle = 'rgba(255,255,255,0.05)';
  g.lineWidth = 1;
  g.beginPath();
  for (let x = 0.5; x < W; x += 16) { g.moveTo(x, 0); g.lineTo(x, H); }
  for (let y = 0.5; y < H; y += 16) { g.moveTo(0, y); g.lineTo(W, y); }
  g.stroke();
  const pad = 14;
  const k = Math.min((W - pad * 2) / (o.maxX - o.minX), (H - pad * 2) / (o.maxZ - o.minZ));
  const ox = (W - (o.maxX - o.minX) * k) / 2, oz = (H - (o.maxZ - o.minZ) * k) / 2;
  const P = ([x, z]) => [ox + (o.maxX - x) * k, oz + (o.maxZ - z) * k];
  const path = () => {
    g.beginPath();
    o.pts.forEach((p, i) => { const [x, y] = P(p); i ? g.lineTo(x, y) : g.moveTo(x, y); });
    g.closePath();
  };
  g.lineJoin = 'round'; g.lineCap = 'round';
  path();
  g.strokeStyle = 'rgba(0,0,0,0.55)'; g.lineWidth = 9; g.stroke();
  const grad = g.createLinearGradient(0, 0, W, H);
  grad.addColorStop(0, col.a); grad.addColorStop(1, col.b);
  if (on) { g.shadowColor = col.a; g.shadowBlur = 14; }
  g.globalAlpha = on ? 1 : 0.55;
  g.strokeStyle = grad; g.lineWidth = on ? 3.6 : 3; g.stroke();
  g.shadowBlur = 0; g.globalAlpha = 1;
  if (on) { path(); g.strokeStyle = 'rgba(255,255,255,0.85)'; g.lineWidth = 1; g.stroke(); }
  // start line + direction chevron
  const [sx0, sy0] = P(o.pts[0]);
  const [sx1, sy1] = P(o.pts[mirror ? o.pts.length - 3 : 3]);
  const a = Math.atan2(sy1 - sy0, sx1 - sx0);
  g.save(); g.translate(sx0, sy0); g.rotate(a);
  g.fillStyle = '#fff';
  for (let i = 0; i < 4; i++) { g.fillStyle = i % 2 ? '#111' : '#fff'; g.fillRect(-2, -8 + i * 4, 4, 4); }
  g.fillStyle = on ? '#fff' : 'rgba(255,255,255,0.7)';
  g.beginPath(); g.moveTo(17, 0); g.lineTo(9, -5); g.lineTo(11, 0); g.lineTo(9, 5); g.closePath(); g.fill();
  g.restore();
}
