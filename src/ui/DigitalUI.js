/*
 * v5.0 "digital world" interface: cyan + orange on deep black-blue, thin glowing frames with corner brackets,
 * a techno display font (Tektur, with Cyrillic), straighter shapes and a faint scan-line texture.
 * Pure CSS on top of style.css — every screen and the HUD pick it up through the shared variables.
 */

const FONT = 'https://fonts.googleapis.com/css2?family=Tektur:wght@500;700;800;900&display=swap';

const CSS = `
:root {
  --ink: #01060b; --ink-2: #031019;
  --glass: rgba(2, 12, 20, 0.8); --glass-hi: rgba(6, 26, 40, 0.72); --hud-bg: rgba(1, 9, 15, 0.72);
  --line: rgba(110, 225, 255, 0.13); --line-2: rgba(110, 225, 255, 0.32);
  --text: #eafcff; --muted: #8db4c4; --dim: #5a7c8b;
  --pink: #ff7a1a; --violet: #0a7cff; --purple: #36c9ff; --cyan: #00e5ff;
  --grad-hot: linear-gradient(90deg, #00e5ff, #0a7cff);
  --grad-neon: linear-gradient(90deg, #00e5ff, #ff7a1a);
  --f-display: 'Tektur', 'Unbounded', 'Arial Black', system-ui, sans-serif;
  --skew: -6deg;
  --dg-glow: 0 0 14px rgba(0, 229, 255, 0.45);
}
html, body { background: var(--ink); }
#splash { background: radial-gradient(ellipse at 50% 55%, #032234 0%, #01060b 62%); }
.sp-lines i { background: linear-gradient(90deg, transparent, #00e5ff 40%, #fff 50%, #ff7a1a 60%, transparent); box-shadow: 0 0 18px #00e5ff; }
.sp-b { background: linear-gradient(180deg, #fff 0%, #c8f8ff 40%, #00e5ff 55%, #0a5aa0 100%); -webkit-background-clip: text; background-clip: text; }

/* logo: white-cyan light, orange underline */
.logo-a { -webkit-text-stroke: 2px #00e5ff; text-shadow: 0 0 26px rgba(0, 229, 255, 0.6); }
.logo-b { background: linear-gradient(180deg, #ffffff 0%, #e6fdff 30%, #7deeff 48%, #02324a 50%, #0a8fc0 54%, #00e5ff 74%, #d4fbff 100%) !important;
  -webkit-background-clip: text !important; background-clip: text !important; filter: drop-shadow(0 0 16px rgba(0,229,255,0.45)); }
.logo-rule i { background: linear-gradient(90deg, #00e5ff, #ff7a1a 60%, transparent); box-shadow: 0 0 12px rgba(255,122,26,0.6); }

/* panels: thin cyan frame + glowing corner brackets */
.panel { border-color: rgba(0, 229, 255, 0.22) !important;
  background-image:
    linear-gradient(#00e5ff, #00e5ff), linear-gradient(#00e5ff, #00e5ff),
    linear-gradient(#ff7a1a, #ff7a1a), linear-gradient(#ff7a1a, #ff7a1a),
    linear-gradient(165deg, rgba(4, 22, 34, 0.9), rgba(1, 8, 14, 0.92)) !important;
  background-size: 26px 2px, 2px 26px, 26px 2px, 2px 26px, 100% 100% !important;
  background-position: left top, left top, right bottom, right bottom, 0 0 !important;
  background-repeat: no-repeat !important;
  box-shadow: 0 0 0 1px rgba(0,229,255,0.08), 0 20px 60px -20px rgba(0, 229, 255, 0.25) !important; }
.panel::before { box-shadow: 0 0 14px #00e5ff; }
.kicker { color: #ff7a1a; }
.kicker::before { box-shadow: 0 0 8px #00e5ff; }
.flabel::before { box-shadow: 0 0 6px #ff7a1a; }

/* menu buttons: light bar on the left, cyan text glow */
.mbtn:hover .mbtn-t, .mbtn.sel .mbtn-t, .mbtn:focus-visible .mbtn-t { text-shadow: 0 0 14px rgba(0,229,255,0.65); color: #fff; }

.mbtn:hover::before, .mbtn:focus-visible::before, .mbtn.sel::before {
  background: linear-gradient(90deg, rgba(0,229,255,0.32), rgba(10,124,255,0.14) 60%, rgba(10,124,255,0.03)) !important;
  border-color: rgba(0,229,255,0.75) !important; box-shadow: 0 0 28px rgba(0,229,255,0.25), inset 0 1px 0 rgba(255,255,255,0.18) !important; }
/* segmented buttons, primary button */
.seg button.on { box-shadow: 0 0 18px rgba(0, 229, 255, 0.4), inset 0 1px 0 rgba(255,255,255,0.3) !important; color: #00131c !important; }
.btn.primary::before { background: linear-gradient(90deg, #ff7a1a, #ffb347) !important; box-shadow: 0 0 26px rgba(255,122,26,0.5), inset 0 1px 0 rgba(255,255,255,0.35) !important; }
.btn.primary { color: #1a0800 !important; }
.card.on { box-shadow: inset 0 0 0 1px var(--acc, #00e5ff), 0 0 24px -6px var(--acc, #00e5ff) !important; }

/* HUD */
.h-pos::after { background: #00e5ff !important; box-shadow: 0 0 12px #00e5ff !important; }
.h-pos::before, .h-lapbox::before, .h-tr::before { background: linear-gradient(180deg, rgba(2,16,26,0.82), rgba(1,8,14,0.62)) !important; border-color: rgba(0,229,255,0.22) !important; }
.h-place { text-shadow: 0 0 20px rgba(0, 229, 255, 0.6), 0 2px 0 rgba(0,0,0,0.6) !important; }
.h-pips i.c { box-shadow: 0 0 8px #ff7a1a; }
.tw-r.me { background: linear-gradient(90deg, rgba(0,229,255,0.5), rgba(10,124,255,0.28)) !important; border-left-color: #00e5ff !important; box-shadow: 0 0 18px rgba(0,229,255,0.3) !important; }
.cnum span { text-shadow: 0 0 40px #00e5ff, 0 0 90px rgba(0,229,255,0.6), 0 6px 0 rgba(0,0,0,0.4) !important; }
.cnum .burst.b2 { box-shadow: 0 0 30px #ff7a1a; }
#divider { background: linear-gradient(#00e5ff, #ff7a1a) !important; box-shadow: 0 0 18px #00e5ff !important; }
.standings tr.me td:first-child { box-shadow: inset 3px 0 0 #00e5ff !important; }

/* faint scan lines over the menus (static texture, no animation) */
.screen::after { content: ''; position: fixed; inset: 0; pointer-events: none; z-index: 30;
  background: repeating-linear-gradient(0deg, rgba(0, 229, 255, 0.035) 0 1px, transparent 1px 3px); mix-blend-mode: screen; }
`;

(function install() {
  if (typeof document === 'undefined' || document.getElementById('digital-ui')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = FONT;
  document.head.appendChild(link);
  const st = document.createElement('style');
  st.id = 'digital-ui';
  st.textContent = CSS;
  document.head.appendChild(st);
  document.body?.classList.add('digital');
})();
