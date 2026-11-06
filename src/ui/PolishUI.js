import { eventBus, Events } from '../core/EventBus.js';

/*
 * v5.7 «A+++ presentation» for the menus:
 *  - screens slide in with a short focus pull instead of popping in;
 *  - race start: a title card with the track name sweeps across and opens onto the grid (covers the load hitch);
 *  - results: the place is stamped in, the reward counts up, the podium rows glint.
 * CSS + a little JS on top of the existing screens; nothing here changes how the menus work.
 */

const CSS = `
.screen:not([hidden]) { animation: scrIn 0.38s cubic-bezier(.2,.8,.2,1) both; }
@keyframes scrIn { from { opacity: 0; filter: blur(6px); transform: scale(1.015); } to { opacity: 1; filter: none; transform: none; } }

/* race title card */
#nr-card { position: fixed; inset: 0; z-index: 45; pointer-events: none; display: none; overflow: hidden; }
#nr-card.on { display: block; }
#nr-card .nc-a, #nr-card .nc-b { position: absolute; left: -10%; right: -10%; height: 52%; background: #01060b; }
#nr-card .nc-a { top: 0; border-bottom: 2px solid var(--cyan, #00e5ff); box-shadow: 0 0 24px var(--cyan, #00e5ff); }
#nr-card .nc-b { bottom: 0; border-top: 2px solid var(--pink, #ff7a1a); box-shadow: 0 0 24px var(--pink, #ff7a1a); }
#nr-card.on .nc-a { animation: ncUp 0.75s cubic-bezier(.7,0,.2,1) 0.55s both; }
#nr-card.on .nc-b { animation: ncDn 0.75s cubic-bezier(.7,0,.2,1) 0.55s both; }
@keyframes ncUp { to { transform: translateY(-104%) skewY(-2deg); } }
@keyframes ncDn { to { transform: translateY(104%) skewY(-2deg); } }
#nr-card .nc-t { position: absolute; left: 0; right: 0; top: 50%; transform: translateY(-50%); text-align: center; z-index: 2; }
#nr-card .nc-k { display: block; font: 700 12px var(--f-mono); letter-spacing: 0.5em; text-transform: uppercase; color: var(--cyan, #00e5ff); }
#nr-card .nc-n { display: block; margin-top: 6px; font: 900 clamp(34px, 7vw, 76px) var(--f-display); letter-spacing: 0.06em; color: #fff; text-shadow: 0 0 30px rgba(0,229,255,0.6); }
#nr-card.on .nc-t { animation: ncT 1.1s ease both; }
@keyframes ncT { 0% { opacity: 0; letter-spacing: 0.5em; } 25% { opacity: 1; letter-spacing: 0.06em; } 60% { opacity: 1; } 100% { opacity: 0; transform: translateY(-50%) scale(1.08); } }

/* results */
#screen-results:not([hidden]) .rh-place b { display: inline-block; animation: rhStamp 0.6s cubic-bezier(.2,1.7,.4,1) 0.25s backwards; }
@keyframes rhStamp { from { opacity: 0; transform: scale(2.6) rotate(-8deg); filter: blur(4px); } }
#screen-results:not([hidden]) .res-hero::after { content: ''; position: absolute; inset: 0; pointer-events: none;
  background: linear-gradient(105deg, transparent 35%, rgba(255,255,255,0.16) 50%, transparent 65%); background-size: 250% 100%; animation: rhGlint 1.4s ease 0.6s both; }
@keyframes rhGlint { from { background-position: 150% 0; } to { background-position: -60% 0; } }
.standings tr.pod td:first-child span { position: relative; }
#screen-results:not([hidden]) .standings tr.pod.gold .pl span { animation: podGlow 1.6s ease-in-out 0.8s 2; }
@keyframes podGlow { 50% { box-shadow: 0 0 26px rgba(255,212,0,0.9); } }
.pr-reward .pr-big.counting { color: #fff; }
`;

export class PolishUI {
  constructor(game) {
    this.game = game;
    const st = document.createElement('style');
    st.id = 'polish-style';
    st.textContent = CSS;
    document.head.appendChild(st);
    this.card = document.createElement('div');
    this.card.id = 'nr-card';
    this.card.innerHTML = '<i class="nc-a"></i><i class="nc-b"></i><div class="nc-t"><span class="nc-k"></span><span class="nc-n"></span></div>';
    document.getElementById('app')?.appendChild(this.card);
    eventBus.on(Events.RACE_FINISHED, () => setTimeout(() => this.countUp(), 0));
  }

  /** Title card over the freshly built race: track name, then the shutters open onto the grid. */
  raceCard(race) {
    if (!race || race.demo) return;
    const mode = { race: 'Гонка', gp: 'Гран-при', elim: 'Выбывание', trial: 'На время', chase: 'Погоня' }[race.mode] || 'Гонка';
    const gp = this.game.gp ? ` · этап ${this.game.gp.round + 1}` : '';
    this.card.querySelector('.nc-k').textContent = mode + gp;
    this.card.querySelector('.nc-n').textContent = race.track?.def?.name || '';
    this.card.classList.remove('on');
    void this.card.offsetWidth;
    this.card.classList.add('on');
    clearTimeout(this.cardT);
    this.cardT = setTimeout(() => this.card.classList.remove('on'), 1500);
  }

  /** The race reward counts up from zero. */
  countUp() {
    const el = document.querySelector('#screen-results .pr-big');
    if (!el) return;
    const txt = el.textContent;
    const m = txt.match(/\+([\d\s]+)/);
    if (!m) return;
    const total = parseInt(m[1].replace(/\D/g, ''), 10);
    if (!(total > 0)) return;
    const suffix = txt.slice(txt.indexOf(m[0]) + m[0].length);
    const t0 = performance.now(), dur = 900;
    el.classList.add('counting');
    const tick = (now) => {
      const k = Math.min(1, (now - t0) / dur);
      const v = Math.round(total * (1 - (1 - k) ** 3));
      el.textContent = `+${v.toLocaleString('ru-RU')}${suffix}`;
      if (k < 1) requestAnimationFrame(tick);
      else { el.textContent = txt; el.classList.remove('counting'); }
    };
    requestAnimationFrame(tick);
  }
}
