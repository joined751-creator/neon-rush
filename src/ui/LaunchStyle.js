// HUD style additions injected once from the HUD: launch coaching on the grid (rev zones + hint)
// and quieter in-race notifications.
const CSS = `/* ---------------------------------------------------------------- launch coaching (grid) */
.g-zone { stroke-width: 7; opacity: 0; transition: opacity 0.3s; }
.g-zg { stroke: var(--green); }
.g-zr { stroke: var(--red); }
.phud.launch .g-zone { opacity: 0.95; }
.phud.launch .g-red { opacity: 0; }
.phud.launch .gauge[data-lz="ok"] .g-tip { stroke: var(--green); }
.phud.launch .gauge[data-lz="hot"] .g-tip { stroke: var(--red); }
.phud.launch .gauge[data-lz="ok"] .kmh { color: var(--green); text-shadow: 0 0 18px rgba(125,255,176,0.7), 0 2px 0 rgba(0,0,0,0.6); }
.phud.launch .gauge[data-lz="hot"] .kmh { color: var(--red); text-shadow: 0 0 18px rgba(255,64,96,0.8), 0 2px 0 rgba(0,0,0,0.6); animation: lz-blink 0.35s steps(2) infinite; }
.h-launch { position: absolute; left: 50%; top: 36%; transform: translateX(-50%); display: flex; flex-direction: column; align-items: center; gap: 3px; padding: 9px 18px 10px; border-radius: 4px; background: rgba(8,5,18,0.78); border: 1px solid rgba(255,255,255,0.14); border-left: 3px solid #fff; text-align: center; pointer-events: none; white-space: nowrap; transition: opacity 0.4s; }
.phud:not(.launch) .h-launch { opacity: 0; }
.h-launch b { font-weight: 900; font-style: italic; font-size: 20px; letter-spacing: 0.02em; text-transform: uppercase; }
.h-launch span { font-family: var(--f-mono); font-size: 11px; color: var(--muted); letter-spacing: 0.06em; }
.h-launch.up { border-left-color: var(--cyan, #00e5ff); }
.h-launch.ok { border-left-color: var(--green); }
.h-launch.ok b { color: var(--green); }
.h-launch.hot { border-left-color: var(--red); }
.h-launch.hot b { color: var(--red); animation: lz-blink 0.35s steps(2) infinite; }
@keyframes lz-blink { 50% { opacity: 0.35; } }
.phud.compact .h-launch { transform: translateX(-50%) scale(0.8); }
body.touch-ui .phud .h-launch { top: 134px; }
body.touch-ui .phud .h-launch b { font-size: 16px; }
body.touch-ui .phud .h-launch span { font-size: 10px; }
body.touch-ui.portrait .phud .h-launch { top: 230px; bottom: auto; }

/* ---------------------------------------------------------------- quiet race notifications
   Lap / bonus banners: a compact strip at the top centre instead of a full-width title over the road.
   Feed (overtake, near miss…): small chips that don't cover the track. Finish / win banners stay big. */
.h-banner { top: 10px; }
.bn:not(.win):not(.fin):not(.bad) { gap: 2px; padding: 6px 22px 7px; min-width: 0; background: linear-gradient(90deg, transparent, rgba(8,4,18,0.62) 18%, rgba(8,4,18,0.62) 82%, transparent); animation: bnQuiet 2.2s ease forwards; }
.bn:not(.win):not(.fin):not(.bad)::before, .bn:not(.win):not(.fin):not(.bad)::after { left: 18%; right: 18%; opacity: 0.6; }
.bn:not(.win):not(.fin):not(.bad) small { font-size: 8px; letter-spacing: 0.24em; }
.bn:not(.win):not(.fin):not(.bad) b { font-size: 16px; text-shadow: 0 0 10px var(--c), 0 2px 0 rgba(0,0,0,0.5); animation: none; }
.bn.lap b { font-size: 16px; }
.bn:not(.win):not(.fin):not(.bad) span { font-size: 9px; letter-spacing: 0.08em; }
.bn.win, .bn.fin, .bn.bad { margin-top: 18vh; }
@keyframes bnQuiet { 0% { opacity: 0; transform: translateY(-8px); } 10% { opacity: 1; transform: none; } 85% { opacity: 1; } 100% { opacity: 0; transform: translateY(-6px); } }
.ft { font-size: 10px; padding: 2px 10px 2px 8px; gap: 7px; opacity: 0.9; }
.ft.strong { font-size: 11px; padding-block: 3px; }
.ft i { width: 4px; height: 4px; }
.ft::before { background: linear-gradient(90deg, rgba(8,5,18,0.35), rgba(8,5,18,0.6)); box-shadow: none; border-right-width: 2px; }
.ft span { text-shadow: none; }
.ft.bump { animation: ftBump 2.3s var(--ease) forwards; }
@keyframes ftBump { 0% { opacity: 1; transform: scale(1.12); } 8% { transform: none; } 82% { opacity: 1; transform: none; } 100% { opacity: 0; transform: translateX(16px); } }
/* drift about to over-rotate */
.drift-m.slip { --dc: #ff4060 !important; }
.drift-m.slip .ml b { animation: lz-blink 0.3s steps(2) infinite; }
/* place label stays readable while the big digit animates */
.h-pos .h-lbl { position: relative; z-index: 1; }
.compact .h-banner { top: 10px; }
.phud.sz-short .h-banner { top: 8px; }
body.touch-ui .phud .h-banner { top: 6px; }
body.touch-ui .phud .h-feed { top: 62px; gap: 3px; }
body.touch-ui .phud.elim .h-feed { top: 96px; }
body.touch-ui.portrait .phud .h-banner { top: 200px; }
body.touch-ui.portrait .phud .h-feed { top: 256px; }
`;

let done = false;
export function injectLaunchStyle() {
  if (done || typeof document === 'undefined') return;
  done = true;
  const el = document.createElement('style');
  el.id = 'launch-style';
  el.textContent = CSS;
  document.head.appendChild(el);
}
