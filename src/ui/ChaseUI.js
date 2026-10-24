import { CHASE } from '../core/Constants.js';
import { eventBus, Events } from '../core/EventBus.js';
import { audioManager as A } from '../audio/AudioManager.js';
import { TRACKS } from '../level/TrackDefs.js';
import { MODE_ICONS } from './Icons.js';

/*
 * v4.3 «Погоня» — everything the player sees and hears around the chase mode:
 * HUD (escape timer, wanted stars, capture meter, red/blue strobe at the screen edges when a patrol is close,
 * BUSTED overlay), siren sound, the setup screen tweaks, the results screen and the "Новое в 4.3" title banner.
 * Installed once by the Game; wraps the HUD and menu renderers without touching their internals.
 */

const fmt = (t) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
const fmtMs = (t) => `${Math.floor(t / 60)}:${(t % 60).toFixed(1).padStart(4, '0')}`;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const hexCss = (n) => '#' + n.toString(16).padStart(6, '0');
const plural = (n, a, b, c) => (n % 10 === 1 && n % 100 !== 11 ? a : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20) ? b : c);

MODE_ICONS.chase = `<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  <path d="M8 22v-6a8 8 0 0 1 16 0v6"/><path d="M5 22h22v4H5z"/><path d="M16 4v3M6.5 8l2 2M25.5 8l-2 2M3 15h2M27 15h2" opacity=".7"/><path d="M13 16a3 3 0 0 1 3-3"/></svg>`;

const CSS = `
.phud.chase .h-tl, .phud.chase .h-tower, .phud.chase > .h-tr:not(.ch-tr), .phud.chase .h-elim, .phud.chase .h-delta { display: none !important; }
.ch-tr { min-width: 190px; gap: 4px; }
.ch-tr .ch-k { font-size: 10px; letter-spacing: 0.22em; text-transform: uppercase; color: var(--muted); }
.ch-tr .ch-time { font-family: var(--f-display); font-weight: 900; font-style: italic; font-size: 34px; line-height: 1; color: #fff; text-shadow: 0 0 16px rgba(0,229,255,0.45); }
.ch-tr .ch-time.hurry { color: #7dffb0; text-shadow: 0 0 18px rgba(57,255,136,0.6); }
.ch-tr .ch-row { display: flex; justify-content: space-between; align-items: baseline; gap: 10px; font-size: 12px; }
.ch-tr .ch-row b { font-weight: 700; color: var(--text); }
.ch-stars { letter-spacing: 0.08em; font-size: 15px; color: rgba(255,255,255,0.18); }
.ch-stars i { font-style: normal; }
.ch-stars i.on { color: #ff4060; text-shadow: 0 0 10px #ff4060; }
.ch-stars i.on.new { animation: chStar 0.5s ease 3; }
@keyframes chStar { 50% { transform: scale(1.6); color: #fff; } }
.ch-tl { position: absolute; left: max(var(--hx), env(safe-area-inset-left)); top: var(--hy); width: min(320px, 46%); padding: 9px 14px 11px; isolation: isolate; font-family: var(--f-mono); }
.ch-tl::before { content: ''; position: absolute; inset: 0; z-index: -1; transform: skewX(var(--skew)); background: linear-gradient(180deg, rgba(14,8,30,0.74), rgba(8,5,18,0.55)); border: 1px solid var(--line); border-radius: 3px; }
.ch-tl .ch-head { display: flex; justify-content: space-between; align-items: baseline; font-size: 10px; letter-spacing: 0.22em; text-transform: uppercase; color: var(--muted); margin-bottom: 6px; }
.ch-tl .ch-head b { font-size: 13px; letter-spacing: 0.04em; color: #fff; }
.ch-bar { position: relative; height: 10px; border-radius: 2px; background: rgba(255,255,255,0.08); overflow: hidden; }
.ch-bar i { position: absolute; inset: 0 auto 0 0; width: 0; background: linear-gradient(90deg, #1f5cff, #ff2bd6 60%, #ff1a3c); box-shadow: 0 0 12px rgba(255,26,60,0.6); }
.ch-tl.hot .ch-bar { box-shadow: 0 0 0 2px #ff1a3c, 0 0 18px rgba(255,26,60,0.7); }
.ch-tl.hot .ch-head b { color: #ff4060; }
.ch-tl .ch-hint { margin-top: 6px; font-size: 11px; color: var(--muted); }
.ch-tl.hot .ch-hint { color: #ffb0bd; }
.ch-strobe { position: absolute; inset: 0; pointer-events: none; opacity: 0; visibility: hidden; }
.ch-strobe::before, .ch-strobe::after { content: ''; position: absolute; top: 0; bottom: 0; width: 34%; }
.ch-strobe::before { left: 0; background: linear-gradient(90deg, rgba(255,26,60,0.42), transparent); }
.ch-strobe::after { right: 0; background: linear-gradient(-90deg, rgba(31,92,255,0.48), transparent); }
.ch-strobe.s0::after, .ch-strobe.s1::before { opacity: 0; }
.ch-out { position: absolute; inset: 0; display: grid; place-items: center; text-align: center; pointer-events: none;
  background: radial-gradient(ellipse at center, rgba(10,0,30,0.25), rgba(10,0,24,0.75)); animation: fadeUp 0.4s ease both; }
.ch-out[hidden] { display: none; }
.ch-out div { display: flex; flex-direction: column; align-items: center; gap: 8px; }
.ch-out b { font-weight: 900; font-style: italic; font-size: clamp(40px, 8vw, 96px); line-height: 1; text-transform: uppercase; color: #fff;
  text-shadow: 0 0 30px #ff1a3c, -5px 0 0 #ff1a3c, 5px 0 0 #1f5cff; }
.ch-out small { font-family: var(--f-mono); font-size: 12px; letter-spacing: 0.2em; text-transform: uppercase; color: var(--text); }
.compact .ch-tl { width: min(240px, 52%); padding: 6px 10px 8px; }
.compact .ch-tr { min-width: 150px; }
.compact .ch-tr .ch-time { font-size: 26px; }
.compact .ch-out b { font-size: clamp(28px, 4.6vw, 60px); }
body.touch-ui .ch-tl { width: min(250px, 40%); padding: 6px 10px 8px; }
body.touch-ui .ch-tl .ch-hint { display: none; }
body.touch-ui .ch-tr .ch-time { font-size: 26px; }
/* results */
#screen-results .ch-res-ok { color: #7dffb0; font-weight: 700; }
#screen-results .ch-res-bad { color: #ff4060; font-weight: 700; }
#screen-results tr.cop td { opacity: 0.7; }
/* "new in 4.3" banner: police colours */
.new-banner.ch-banner { background: linear-gradient(100deg, rgba(255,26,60,0.2), rgba(31,92,255,0.26)); border-color: rgba(120,140,255,0.7); }
.new-banner.ch-banner .nb-tag { background: linear-gradient(90deg, #ff1a3c, #1f5cff); color: #fff; }
.new-banner.ch-banner .mbtn-go { color: #8fb0ff; }
`;

class Siren {
  constructor() {
    const ctx = A.ctx;
    this.o = ctx.createOscillator(); this.o.type = 'sawtooth';
    this.o2 = ctx.createOscillator(); this.o2.type = 'square';
    this.lfo = ctx.createOscillator(); this.lfo.type = 'triangle'; this.lfo.frequency.value = 0.28;
    this.depth = ctx.createGain(); this.depth.gain.value = 330;
    this.lfo.connect(this.depth);
    this.depth.connect(this.o.frequency);
    this.depth.connect(this.o2.frequency);
    this.o.frequency.value = 900; this.o2.frequency.value = 902;
    this.f = ctx.createBiquadFilter(); this.f.type = 'bandpass'; this.f.frequency.value = 1100; this.f.Q.value = 0.8;
    this.g = ctx.createGain(); this.g.gain.value = 0;
    const mix = ctx.createGain(); mix.gain.value = 0.35;
    this.o.connect(this.f); this.o2.connect(mix).connect(this.f);
    this.f.connect(this.g).connect(A.sfx);
    for (const s of [this.o, this.o2, this.lfo]) s.start();
  }

  set(vol, yelp) {
    const t = A.ctx.currentTime;
    this.g.gain.setTargetAtTime(vol, t, 0.15);
    this.lfo.frequency.setTargetAtTime(yelp ? 3.2 : 0.28, t, 0.3);
    this.depth.gain.setTargetAtTime(yelp ? 220 : 330, t, 0.3);
  }

  dispose() {
    this.set(0, false);
    setTimeout(() => { for (const s of [this.o, this.o2, this.lfo]) { try { s.stop(); } catch { /* */ } } this.g.disconnect(); }, 400);
  }
}

export class ChaseUI {
  constructor(game) {
    this.game = game;
    this.panes = [];
    this.siren = null;
    this.lastTick = 0;
    const st = document.createElement('style');
    st.id = 'chase-style';
    st.textContent = CSS;
    document.head.appendChild(st);

    const hud = game.hud;
    const setup = hud.setup.bind(hud);
    hud.setup = (race, settings) => { setup(race, settings); this.setupHud(race); };
    const update = hud.update.bind(hud);
    hud.update = () => { update(); this.updateHud(); };

    const menus = game.menus;
    const renderSetup = menus.renderSetup.bind(menus);
    menus.renderSetup = () => { renderSetup(); this.decorateSetup(); };
    const showResults = menus.showResults.bind(menus);
    menus.showResults = (res, humans, gp) => { showResults(res, humans, gp); this.decorateResults(res, humans); };

    eventBus.on(Events.UI_ACTION, ({ action }) => {
      if (action !== 'tryChase') return;
      const s = game.gs.settings;
      s.mode = 'chase';
      s.bots = clamp(s.bots, CHASE.COPS_MIN, CHASE.COPS_MAX);
      game.gs.saveSettings();
      menus.show('setup');
    });
    this.banner();
    // the siren fades out whenever the HUD stops updating (pause, menus)
    setInterval(() => { if (this.siren && performance.now() - this.lastTick > 250) this.siren.set(0, false); }, 200);
  }

  banner() {
    const b = document.querySelector('.new-banner');
    if (!b) return;
    b.dataset.action = 'tryChase';
    b.classList.add('ch-banner');
    b.innerHTML = '<span class="nb-tag">Новое в 4.3</span><span class="nb-t">Режим «Погоня» — уйди от неоновой полиции<small>Сирены, мигалки, тараны и розыск ★★★ — продержись 90 секунд</small></span><i class="mbtn-go"></i>';
  }

  // ---------------------------------------------------------------- setup screen
  decorateSetup() {
    const s = this.game.gs.settings;
    const chase = s.mode === 'chase';
    const bots = document.getElementById('opt-bots');
    const lbl = bots?.parentElement.querySelector('.flabel');
    if (lbl) lbl.textContent = chase ? 'Патрули' : 'Соперники ИИ';
    if (!chase) return;
    const laps = document.getElementById('opt-laps');
    laps.classList.add('disabled');
    laps.querySelector('output').textContent = `${CHASE.TIME} с`;
    const n = clamp(s.bots, CHASE.COPS_MIN, CHASE.COPS_MAX);
    this.game.menus.stepper('#opt-bots', n, CHASE.COPS_MIN, CHASE.COPS_MAX, (v) => { s.bots = v; });
    const sum = document.getElementById('setup-summary');
    if (sum) sum.textContent = `Погоня · ${TRACKS[s.track].name} · ${n} ${plural(n, 'патруль', 'патруля', 'патрулей')} · ${CHASE.TIME} секунд`;
  }

  // ---------------------------------------------------------------- HUD
  setupHud(race) {
    this.race = race;
    this.panes = [];
    if (!race?.chase) { this.stopSiren(); return; }
    this.game.hud.panes.forEach((pane, p) => {
      const el = pane.el;
      el.classList.add('chase');
      el.insertAdjacentHTML('beforeend', `
        <div class="ch-strobe"></div>
        <div class="ch-tl"><div class="ch-head"><span>Захват</span><b class="ch-pct">0%</b></div><div class="ch-bar"><i></i></div><div class="ch-hint">Не сбавляй скорость рядом с полицией</div></div>
        <div class="h-tr ch-tr"><span class="ch-k">До побега</span><b class="ch-time">${fmt(CHASE.TIME)}</b>
          <div class="ch-row"><span class="ch-k">Розыск</span><span class="ch-stars"><i>★</i><i>★</i><i>★</i></span></div>
          <div class="ch-row"><span class="ch-k">Полиция</span><b class="ch-near">—</b></div></div>
        <div class="ch-out" hidden><div><small>Погоня окончена</small><b>Пойман</b><small class="ch-out-s"></small></div></div>`);
      const q = (s) => el.querySelector(s);
      this.panes.push({ p, tl: q('.ch-tl'), pct: q('.ch-pct'), bar: q('.ch-bar i'), time: q('.ch-time'), stars: [...el.querySelectorAll('.ch-stars i')],
        near: q('.ch-near'), strobe: q('.ch-strobe'), out: q('.ch-out'), outS: q('.ch-out-s'), last: {} });
    });
  }

  updateHud() {
    const race = this.race;
    if (!race?.chase || race !== this.game.race) return;
    const ch = race.chase;
    this.lastTick = performance.now();
    for (const P of this.panes) {
      const h = ch.hud(P.p);
      if (!h) continue;
      const L = P.last;
      const t = fmt(Math.ceil(h.left));
      if (L.t !== t) { L.t = t; P.time.textContent = t; P.time.classList.toggle('hurry', h.left < 10.5 && h.started); }
      const pct = Math.round(h.heat * 100);
      if (L.pct !== pct) { L.pct = pct; P.pct.textContent = `${pct}%`; P.bar.style.width = `${pct}%`; }
      const hot = h.heat > 0.25 && !h.busted;
      if (L.hot !== hot) { L.hot = hot; P.tl.classList.toggle('hot', hot); }
      if (L.lvl !== h.level) {
        L.lvl = h.level;
        P.stars.forEach((s, i) => { s.classList.toggle('on', i < h.level); s.classList.toggle('new', i === h.level - 1 && h.level > 1); });
      }
      const near = isFinite(h.near) ? `${Math.round(h.near)} м` : '—';
      if (L.near !== near) { L.near = near; P.near.textContent = near; }
      // red/blue glow at the screen edges while a patrol is close (switched from JS: no endless CSS animation)
      const strobe = h.busted || h.escaped || !h.started ? 0 : clamp(1 - (h.near - 8) / 30, 0, 1);
      const so = strobe.toFixed(1);
      if (L.so !== so) { L.so = so; P.strobe.style.opacity = so; P.strobe.style.visibility = strobe > 0 ? 'visible' : 'hidden'; }
      const side = Math.floor(this.lastTick / 300) % 2;
      if (strobe > 0 && L.side !== side) { L.side = side; P.strobe.className = `ch-strobe s${side}`; }
      if (L.busted !== h.busted) {
        L.busted = h.busted;
        P.out.hidden = !h.busted;
        if (h.busted) P.outS.textContent = `Продержался ${fmtMs(race.chase.state[P.p].at ?? 0)}`;
      }
    }
    this.updateSiren(ch);
  }

  updateSiren(ch) {
    if (!A.ready) return;
    const me = this.race.humans[0];
    if (!me) return;
    this.siren ||= new Siren();
    const d = ch.nearestTo(me);
    const vol = !this.race.results ? 0.11 * Math.pow(clamp(1 - d / 220, 0, 1), 1.4) + 0.012 : 0;
    this.siren.set(vol, d < 25);
  }

  stopSiren() {
    if (this.siren) { this.siren.dispose(); this.siren = null; }
  }

  // ---------------------------------------------------------------- results
  decorateResults(res, humans) {
    const scr = document.getElementById('screen-results');
    scr.classList.toggle('chase', res.mode === 'chase');
    if (res.mode !== 'chase') return;
    this.stopSiren();
    const me = res.rows.find((r) => r.human && r.player === 0);
    const humanRows = res.rows.filter((r) => r.human);
    const anyEscaped = humanRows.some((r) => r.escaped);
    scr.classList.toggle('win', !!me?.escaped);
    document.getElementById('results-kicker').textContent = 'Погоня · итог';
    let title = me?.escaped ? 'Ушёл от погони!' : 'Пойман!';
    if (humans > 1) title = anyEscaped ? `Ушёл: ${humanRows.filter((r) => r.escaped).map((r) => r.name).join(', ')}` : 'Пойманы все';
    document.getElementById('results-title').textContent = title;
    document.getElementById('results-sub').textContent = `${res.track}${res.mirror ? ' · обратное' : ''} · розыск ${CHASE.TIME} секунд`;
    const hero = document.getElementById('results-hero');
    if (me) {
      hero.hidden = false;
      hero.className = 'res-hero' + (me.escaped ? ' gold' : '');
      hero.innerHTML = `
        <span class="rh-l">${me.escaped ? 'Ушёл от погони' : 'Продержался'}</span>
        <span class="rh-time">${me.escaped ? fmt(CHASE.TIME) : fmtMs(me.time ?? 0)}</span>
        <div class="rh-stats">
          <div><span>Проехал</span><b>${(me.dist / 1000).toFixed(2)} км</b></div>
          <div><span>Патрулей сбито</span><b>${me.takedowns}</b></div>
          <div><span>Машина</span><b>${me.car}</b></div>
        </div>`;
    }
    const rows = res.rows.map((r, i) => `
      <tr class="${r.human ? 'me' : 'cop'}" style="--i:${i}">
        <td class="pl"><span>${r.human ? r.place : '—'}</span></td>
        <td class="nm"><span class="dot" style="color:${hexCss(r.color ?? 0xffffff)}"></span>${r.name}${r.human && humans > 1 ? ` <span class="muted">P${r.player + 1}</span>` : ''}</td>
        <td class="muted car">${r.car}</td>
        <td class="t">${r.cop ? '<span class="muted">в погоне</span>' : r.escaped ? '<span class="ch-res-ok">ушёл</span>' : `<span class="ch-res-bad">пойман ${fmtMs(r.time ?? 0)}</span>`}</td>
        <td class="t bl">${r.cop ? '—' : `${(r.dist / 1000).toFixed(2)} км`}</td>
      </tr>`).join('');
    document.getElementById('results-table').innerHTML = `<thead><tr><th>#</th><th>Участник</th><th class="car">Машина</th><th>Итог</th><th>Дистанция</th></tr></thead><tbody>${rows}</tbody>`;
  }
}
