import { GAME } from '../core/Constants.js';

/** One viewport for CSS, cameras, HUD and render buffers (including Safari toolbar changes). */
export function viewportSize(win = window) {
  const vv = win.visualViewport;
  const visual = vv && Math.abs((vv.scale ?? 1) - 1) < 0.01 && vv.width > 0 && vv.height > 0;
  return {
    W: Math.max(1, Math.round(visual ? vv.width : win.innerWidth)),
    H: Math.max(1, Math.round(visual ? vv.height : win.innerHeight)),
    x: visual ? Math.round(vv.offsetLeft || 0) : 0,
    y: visual ? Math.round(vv.offsetTop || 0) : 0,
  };
}

export function fitAppViewport(app, size) {
  app.style.width = `${size.W}px`;
  app.style.height = `${size.H}px`;
  app.style.left = `${size.x}px`;
  app.style.top = `${size.y}px`;
  app.style.right = 'auto'; app.style.bottom = 'auto';
}

/** Keep retina edges resolved even when the FPS governor reduces resolution. */
export function renderPixelRatio(deviceDpr, quality, scale = 1) {
  const native = Math.max(1, deviceDpr || 1);
  const cap = quality === 'high' ? GAME.MAX_DPR_HIGH : quality === 'medium' ? GAME.MAX_DPR_MED : GAME.MAX_DPR_LOW;
  const floor = Math.min(native, quality === 'low' ? 1 : 1.5);
  return Math.max(floor, Math.min(native, cap) * Math.max(0.85, Math.min(1, scale)));
}
