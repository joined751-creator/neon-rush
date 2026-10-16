// Launch coaching on the grid (rev zones on the speedometer + hint). Injected once from the HUD.
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
