import { eventBus, Events } from '../core/EventBus.js';
import { ELIMINATION, CAR } from '../core/Constants.js';
import { ITEM_ICONS, ITEM_NAMES, ITEM_COLORS, UI_ICONS } from './Icons.js';
import { injectLaunchStyle } from './LaunchStyle.js';

const fmt = (t) => (t == null ? '-:--.--' : `${Math.floor(t / 60)}:${(t % 60).toFixed(2).padStart(5, '0')}`);
const hexCss = (n) => '#' + n.toString(16).padStart(6, '0');
const DRIFT_CSS = ['#ffffff', '#3ab8ff', '#ff9a1a', '#c04dff'];
const DRIFT_NAME = ['', 'I', 'II', 'III'];
const ITEM_KEYS = ['E', '/'];
const NITRO_KEYS = ['L-SHIFT', 'ENTER'];
const GEAR_AT = [0.15, 0.3, 0.46, 0.62, 0.79]; // speed fractions where the (fake) gearbox shifts up
const TOWER_HZ = 200; // ms between standings refreshes
const ITEM_IDS = Object.keys(ITEM_ICONS);
// gauge geometry: 240° arc, centre (100,100), r 80, from 150° to 30° clockwise
const G_R = 80, G_START = 150, G_SWEEP = 240;
const ARC = 'M30.72 140 A80 80 0 1 1 169.28 140';
const ARC_IN = 'M41.11 134 A68 68 0 1 1 158.89 134';
const ARC_OUT = 'M20.33 146 A92 92 0 1 1 179.67 146';
const gaugePoint = (f) => {
  const a = ((G_START + G_SWEEP * f) * Math.PI) / 180;
  return [100 + G_R * Math.cos(a), 100 + G_R * Math.sin(a)];
};

/** Per-player HUD panes aligned with the render viewports, plus shared minimap. */
export class HUD {
  constructor() {
    this.root = document.getElementById('hud');
    this.divider = document.getElementById('divider');
    this.minimap = document.getElementById('minimap');
    this.mctx = this.minimap.getContext('2d');
    this.panes = [];
    this.outline = null;
    this.towerAt = 0;
    injectLaunchStyle();
    eventBus.on(Events.UI_POPUP, ({ player, text, color, big }) => this.popup(player, text, color, big));
    eventBus.on(Events.RACE_COUNTDOWN, ({ n }) => this.count(n));
    eventBus.on(Events.ITEM_PICKUP, ({ car }) => { if (car?.human && this.race?.cars.includes(car)) this.roulette(car.player); });
    eventBus.on(Events.CAR_OVERTAKE, ({ car }) => this.overtake(car));
    window.addEventListener('resize', () => this.layout());
  }

  setup(race, settings) {
    this.race = race;
    this.settings = settings;
    this.root.innerHTML = '';
    this.panes = [];
    const n = race.humans.length;
    const split = settings.split;
    this.split = split;
    for (let p = 0; p < n; p++) {
      const el = document.createElement('div');
      el.className = 'phud' + (n > 1 ? ' compact' : '') + (race.mode === 'trial' ? ' trial' : '') + (race.mode === 'elim' ? ' elim' : '');
      if (n === 1) Object.assign(el.style, { left: '0', top: '0', width: '100%', height: '100%' });
      else if (split === 'horizontal') Object.assign(el.style, { left: '0', top: p === 0 ? '0' : '50%', width: '100%', height: '50%' });
      else Object.assign(el.style, { left: p === 0 ? '0' : '50%', top: '0', width: '50%', height: '100%' });
      if (n > 1) el.classList.add(`p${p + 1}`);
      if (race.mode === 'trial' || !race.settings.items) el.classList.add('noitems');
      // the pane in the top-right corner shares it with the pause / sound buttons
      if (n === 1 || (split === 'horizontal' ? p === 0 : p === 1)) el.classList.add('corner');
      const laps = race.laps;
      const pips = race.mode === 'elim' || laps > 9 ? '' : Array.from({ length: laps }, () => '<i></i>').join('');
      el.innerHTML = `
        <div class="speedlines"></div><div class="vignette"></div>
        <div class="h-tl">
          <div class="h-pos"><span class="h-lbl">Место</span><div class="h-place"></div></div>
          <div class="h-lapbox"><span class="h-lbl">${race.mode === 'elim' ? 'В гонке' : 'Круг'}</span><div class="h-lap"></div><div class="h-pips">${pips}</div></div>
        </div>
        <div class="h-tower" hidden><div class="tw-head"><span>Поз</span><span>Пилот</span><span>Интервал</span></div><div class="tw-rows"></div></div>
        <div class="h-tr">
          <div class="tm-main"><span class="h-lbl">Время</span><b class="tm-race"></b></div>
          <div class="tm-row"><span class="h-lbl">Круг</span><span class="tm-lap"></span></div>
          <div class="tm-row"><span class="h-lbl">Лучший</span><span class="tm-best"></span></div>
          <div class="tm-row tm-recrow" hidden><span class="h-lbl">Рекорд</span><span class="tm-rec"></span></div>
          <div class="h-delta" hidden></div>
        </div>
        <div class="h-elim" hidden><span class="el-l">Выбывание через</span><b></b><span class="el-bar"><i></i></span></div>
        <div class="h-feed"></div>
        <div class="h-banner"></div>
        <div class="h-warn" hidden><span class="hw-ico">${UI_ICONS.uturn}</span><span class="hw-t">Не туда!<small>Развернись</small></span></div>
        <div class="h-bl"><div class="slot"><span class="slot-ico"></span></div><div class="slot-l"></div></div>
        <div class="h-br">
          <div class="gauge">
            <svg viewBox="0 8 200 142" aria-hidden="true">
              <defs>
                <linearGradient id="gg${p}" x1="0" x2="1" y1="0" y2="0"><stop offset="0" stop-color="#00e5ff"/><stop offset="0.55" stop-color="#ff2bd6"/><stop offset="0.85" stop-color="#ffd400"/><stop offset="1" stop-color="#ff4060"/></linearGradient>
                <mask id="gm${p}" maskUnits="userSpaceOnUse" x="0" y="0" width="200" height="160"><path class="g-mask" d="${ARC}" stroke="#fff" stroke-width="22" fill="none" pathLength="100" stroke-dasharray="0 100"/></mask>
              </defs>
              <path d="${ARC_IN}" class="g-in" fill="none"/>
              <path d="${ARC}" class="g-bg" fill="none" pathLength="100"/>
              <path d="${ARC_OUT}" class="g-red" fill="none" pathLength="100"/>
              <path d="${ARC_OUT}" class="g-zone g-zg" fill="none" pathLength="100" stroke-dasharray="${(CAR.LAUNCH_GREEN[1] - CAR.LAUNCH_GREEN[0]) * 100} 200" stroke-dashoffset="${-CAR.LAUNCH_GREEN[0] * 100}"/>
              <path d="${ARC_OUT}" class="g-zone g-zr" fill="none" pathLength="100" stroke-dasharray="${(1 - CAR.LAUNCH_RED) * 100} 200" stroke-dashoffset="${-CAR.LAUNCH_RED * 100}"/>
              <path d="${ARC}" class="g-glow" fill="none" stroke="url(#gg${p})" mask="url(#gm${p})"/>
              <path d="${ARC}" class="g-fg" fill="none" pathLength="100" stroke="url(#gg${p})" mask="url(#gm${p})"/>
              <circle class="g-tip" r="5" cx="30.72" cy="140"/>
            </svg>
            <div class="g-read"><b class="kmh">0</b><span class="unit">км/ч</span></div>
            <div class="g-gear"><span>Пер</span><b class="gear">N</b></div>
          </div>
          <div class="meter drift-m" hidden><div class="ml"><span>Дрифт</span><b class="dl"></b></div><div class="mb"><i></i><u class="ticks"></u></div></div>
          <div class="meter nitro-m"><div class="ml"><span>Нитро <kbd class="kbd-only">${NITRO_KEYS[p]}</kbd></span><b class="nv">0%</b></div><div class="mb"><i></i><u class="ticks"></u></div></div>
        </div>
        <div class="h-launch" hidden><b></b><span></span></div>
        <div class="h-count"></div>
        <div class="h-out" hidden><div><small class="ho-k">Выбывание</small><b>Выбыл</b><small>Смотри за лидером</small></div></div>`;
      this.root.appendChild(el);
      const q = (s) => el.querySelector(s);
      this.panes.push({
        el, place: q('.h-place'), pos: q('.h-pos'), lap: q('.h-lap'), pips: [...el.querySelectorAll('.h-pips i')],
        tower: q('.h-tower'), towerRows: q('.tw-rows'), rows: [],
        tmRace: q('.tm-race'), tmLap: q('.tm-lap'), tmBest: q('.tm-best'), tmRecRow: q('.tm-recrow'), tmRec: q('.tm-rec'), delta: q('.h-delta'),
        elim: q('.h-elim'), elimNum: q('.h-elim b'), elimLbl: q('.el-l'), elimBar: q('.el-bar i'),
        feed: q('.h-feed'), banner: q('.h-banner'), warn: q('.h-warn'),
        slot: q('.slot'), slotIco: q('.slot-ico'), slotL: q('.slot-l'),
        mask: q('.g-mask'), tip: q('.g-tip'), kmh: q('.kmh'), unit: q('.g-read .unit'), gear: q('.gear'), gaugeEl: q('.gauge'),
        launch: q('.h-launch'), launchB: q('.h-launch b'), launchS: q('.h-launch span'),
        drift: q('.drift-m'), driftBar: q('.drift-m i'), dl: q('.dl'),
        nitro: q('.nitro-m'), nitroBar: q('.nitro-m i'), nv: q('.nv'),
        count: q('.h-count'), out: q('.h-out'), lines: q('.speedlines'),
        last: {}, lapSeen: 1, placeSeen: 0, flip: false, spin: 0, otAt: 0,
      });
    }
    this.divider.hidden = n < 2;
    if (n > 1) {
      if (split === 'horizontal') Object.assign(this.divider.style, { left: '0', right: '0', top: 'calc(50% - 2px)', height: '4px', width: 'auto', bottom: 'auto' });
      else Object.assign(this.divider.style, { top: '0', bottom: '0', left: 'calc(50% - 2px)', width: '4px', height: 'auto', right: 'auto' });
    }
    this.minimap.className = n > 1 ? (split === 'horizontal' ? 'split-h' : 'split-v') : '';
    this.outline = race.track.outline(220);
    this.buildMinimapLayer();
    this.root.hidden = false;
    this.minimap.hidden = false;
    this.towerAt = 0;
    if (race.phase === 'countdown') this.count(4);
    this.layout();
  }

  hide() {
    this.root.hidden = true;
    this.minimap.hidden = true;
    this.divider.hidden = true;
    this.root.innerHTML = '';
    this.panes = [];
    this.race = null;
  }

  /** Size classes per pane (split panes and phones get denser layouts). */
  layout() {
    if (!this.race || !this.panes.length) return;
    const W = window.innerWidth, H = window.innerHeight;
    const n = this.panes.length;
    const touch = document.body.classList.contains('touch-ui');
    for (const pane of this.panes) {
      const w = n > 1 && this.split !== 'horizontal' ? W / 2 : W;
      const h = n > 1 && this.split === 'horizontal' ? H / 2 : H;
      const short = h < 460, tiny = h < 330 || w < 400;
      pane.el.classList.toggle('sz-short', short);
      pane.el.classList.toggle('sz-tiny', tiny);
      pane.el.classList.toggle('sz-narrow', w < 700);
      pane.towerMax = h < 560 || n > 1 ? 5 : 8;
      pane.towerOn = this.race.cars.length > 1 && h >= 400 && !touch;
      pane.tower.hidden = !pane.towerOn;
      pane.rows = [];
      pane.towerRows.innerHTML = '';
    }
    this.towerAt = 0;
  }

  // ---------------------------------------------------------------- events
  popup(p, text, color, big) {
    const pane = this.panes[p];
    if (!pane || !text) return;
    // Lap information is rendered by the HUD's own lap banners (see checkLap)
    if (this.race?.mode !== 'elim' && (text === 'ФИНАЛЬНЫЙ КРУГ' || /^КРУГ \d+\/\d+$/.test(text) || text.startsWith('ЛУЧШИЙ КРУГ'))) return;
    if (big && !/ДРИФТ|ПОПАДАНИЕ|ЭМИ ПОПАЛ/.test(text)) {
      let kicker = '', main = text, cls = '';
      if (text.startsWith('ФИНИШ: ')) { kicker = 'Финиш'; main = text.slice(7).replace(/^(\d+) МЕСТО$/, '$1-е место'); cls = 'fin'; }
      else if (text === 'ПОБЕДА!') { kicker = 'Финиш · 1 место'; cls = 'win'; }
      else if (/ВЫБЫЛ/.test(text)) { kicker = 'Выбывание'; cls = 'bad'; }
      else if (/ВЫЖИВШ|ЧЕМПИОН/.test(text)) { kicker = 'Финиш'; cls = 'win'; }
      else if (/СТАРТ/.test(text)) kicker = 'Бонус к старту';
      this.banner(p, { kicker, main, color, cls });
      return;
    }
    this.feed(p, text, color, big);
  }

  feed(p, text, color = '#fff', strong = false) {
    const pane = this.panes[p];
    if (!pane) return;
    // same note again (drift, drift, drift…) → one line with a counter instead of a stack of copies
    const top = pane.feed.firstElementChild;
    if (top && top.dataset.t === text) {
      top.dataset.n = String((+top.dataset.n || 1) + 1);
      top.lastChild.textContent = `${text} ×${top.dataset.n}`;
      top.classList.remove('bump'); void top.offsetWidth; top.classList.add('bump');
      clearTimeout(top._t);
      top._t = setTimeout(() => top.remove(), 2300);
      return;
    }
    const d = document.createElement('div');
    d.dataset.t = text;
    d.className = 'ft' + (strong ? ' strong' : '');
    d.style.setProperty('--c', color);
    d.innerHTML = '<i></i><span></span>';
    d.lastChild.textContent = text;
    pane.feed.prepend(d);
    while (pane.feed.children.length > 3) pane.feed.lastChild.remove();
    d._t = setTimeout(() => d.remove(), 2300);
  }

  banner(p, { kicker = '', main, sub = '', color = '#fff', cls = '' }) {
    const pane = this.panes[p];
    if (!pane) return;
    const b = document.createElement('div');
    b.className = 'bn ' + cls;
    b.style.setProperty('--c', color);
    b.innerHTML = `${kicker ? `<small>${kicker}</small>` : ''}<b></b>${sub ? `<span>${sub}</span>` : ''}`;
    b.querySelector('b').textContent = main;
    pane.banner.replaceChildren(b);
    clearTimeout(pane.bannerT);
    pane.bannerT = setTimeout(() => b.remove(), 2600);
  }

  count(n) {
    const LIGHTS = '<div class="lights"><i><u></u><u></u></i><i><u></u><u></u></i><i><u></u><u></u></i></div><div class="cnum"></div>';
    for (const pane of this.panes) {
      if (n === 4) { pane.count.innerHTML = LIGHTS; continue; }
      if (!pane.count.firstChild) pane.count.innerHTML = LIGHTS;
      const lights = pane.count.querySelector('.lights');
      const num = pane.count.querySelector('.cnum');
      if (!lights || !num) continue;
      if (n > 0) {
        lights.className = `lights on${4 - n}`;
        num.innerHTML = `<span class="c${n}">${n}</span>`;
      } else {
        lights.className = 'lights go';
        num.innerHTML = '<i class="burst"></i><i class="burst b2"></i><span class="go">Старт!</span>';
        setTimeout(() => { pane.count.classList.add('done'); }, 650);
        setTimeout(() => { pane.count.innerHTML = ''; pane.count.classList.remove('done'); }, 1200);
      }
    }
  }

  roulette(p) {
    const pane = this.panes[p];
    if (!pane || document.body.classList.contains('touch-ui')) return;
    pane.spin = (pane.spin || 0) + 1;
    const id = pane.spin;
    let k = 0;
    pane.slot.classList.add('spin');
    const tick = () => {
      if (pane.spin !== id || !this.panes.includes(pane)) return;
      k++;
      if (k < 9) {
        pane.slotIco.innerHTML = ITEM_ICONS[ITEM_IDS[(k + id) % ITEM_IDS.length]];
        pane.slotIco.className = 'slot-ico r' + (k % 2);
        setTimeout(tick, 45 + k * 9);
      } else {
        pane.spin = 0;
        pane.slot.classList.remove('spin');
        pane.last.item = undefined; // force the real item to render
      }
    };
    tick();
  }

  overtake(car) {
    if (!car?.human || !this.race?.cars.includes(car) || this.race.raceTime < 3) return;
    const pane = this.panes[car.player];
    if (!pane) return;
    const now = performance.now();
    if (now - pane.otAt < 1500) return;
    pane.otAt = now;
    this.feed(car.player, `Обгон · ${car.place}-е место`, '#7dffb0');
  }

  checkLap(p, pane, h) {
    if (h.lap <= pane.lapSeen) { pane.lapSeen = Math.min(pane.lapSeen, h.lap); return; }
    const done = pane.lapSeen;
    pane.lapSeen = h.lap;
    if (h.mode === 'elim' || h.finished) return;
    const car = this.race.humans[p];
    const t = car?.lapTimes?.[car.lapTimes.length - 1];
    const best = t != null && h.bestLap != null && t <= h.bestLap + 1e-6 && done > 1;
    const sub = t != null ? `Круг ${done} · <em>${fmt(t)}</em>${best ? ' <i class="tag">Лучший</i>' : ''}` : '';
    if (h.lap === h.laps && h.laps > 1) this.banner(p, { kicker: 'Последний рывок', main: 'Финальный круг', sub, color: '#ff2bd6', cls: 'final' });
    else this.banner(p, { kicker: `Круг ${h.lap} / ${h.laps}`, main: t != null ? fmt(t) : `Круг ${h.lap}`, sub: best ? '<i class="tag">Лучший круг</i>' : `Круг ${done} завершён`, color: best ? '#7dffb0' : '#ffffff', cls: 'lap' });
  }

  // ---------------------------------------------------------------- frame
  update() {
    const race = this.race;
    if (!race) return;
    const now = performance.now();
    const towerDue = now - this.towerAt > TOWER_HZ;
    if (towerDue) this.towerAt = now;
    this.panes.forEach((pane, p) => {
      const h = race.hud(p);
      if (!h) return;
      const L = pane.last;
      const set = (key, el, html) => { if (L[key] !== html) { L[key] = html; el.innerHTML = html; } };
      const txt = (key, el, v) => { if (L[key] !== v) { L[key] = v; el.textContent = v; } };
      // position + lap
      set('place', pane.place, h.mode === 'trial' ? '' : `${h.place}<small>/${h.total}</small>`);
      if (h.mode !== 'trial' && h.place !== pane.placeSeen) {
        if (pane.placeSeen && h.phase === 'racing') {
          pane.flip = !pane.flip;
          pane.pos.className = `h-pos ${h.place < pane.placeSeen ? 'up' : 'down'}${pane.flip ? '2' : ''}`;
        }
        pane.placeSeen = h.place;
      }
      set('lap', pane.lap, h.mode === 'elim' ? `${h.total}` : `${h.lap}<small>/${h.laps}</small>`);
      if (pane.pips.length && L.pip !== h.lap) {
        L.pip = h.lap;
        pane.pips.forEach((e, i) => { e.className = i < h.lap - 1 ? 'f' : i === h.lap - 1 ? 'c' : ''; });
      }
      this.checkLap(p, pane, h);
      // timing
      txt('tmRace', pane.tmRace, fmt(h.raceTime));
      txt('tmLap', pane.tmLap, fmt(h.lapTime));
      txt('tmBest', pane.tmBest, fmt(h.bestLap));
      if (L.rec !== h.record) { L.rec = h.record; pane.tmRecRow.hidden = !h.record; pane.tmRec.textContent = fmt(h.record); }
      if (h.ghostDelta != null) {
        pane.delta.hidden = false;
        const ahead = h.ghostDelta <= 0;
        txt('delta', pane.delta, `${ahead ? '−' : '+'}${Math.abs(h.ghostDelta).toFixed(2)}`);
        if (L.ahead !== ahead) { L.ahead = ahead; pane.delta.className = 'h-delta ' + (ahead ? 'ahead' : 'behind'); }
      } else if (!pane.delta.hidden) pane.delta.hidden = true;
      // elimination
      if (h.elimTimer != null && !h.eliminated) {
        pane.elim.hidden = false;
        txt('elim', pane.elimNum, String(Math.max(0, Math.ceil(h.elimTimer))));
        const fr = Math.max(0, Math.min(1, h.elimTimer / ELIMINATION.INTERVAL));
        pane.elimBar.style.transform = `scaleX(${fr.toFixed(3)})`;
        if (L.danger !== h.danger) { L.danger = h.danger; pane.elim.classList.toggle('danger', h.danger); pane.elimLbl.textContent = h.danger ? 'Ты последний!' : 'Выбывание через'; }
      } else if (!pane.elim.hidden) pane.elim.hidden = true;
      if (L.ww !== h.wrongWay) { L.ww = h.wrongWay; pane.warn.hidden = !h.wrongWay; }
      if (L.out !== h.eliminated) { L.out = h.eliminated; pane.out.hidden = !h.eliminated; pane.el.classList.toggle('is-out', h.eliminated); }
      // item
      const itemKey = h.item || '';
      if (!pane.spin && L.item !== itemKey) {
        L.item = itemKey;
        pane.slotIco.className = 'slot-ico';
        pane.slotIco.innerHTML = h.item ? ITEM_ICONS[h.item] : '';
        pane.slot.classList.toggle('has', !!h.item);
        if (h.item) pane.slot.style.setProperty('--ic', ITEM_COLORS[h.item] || '#ffd400');
        pane.slotL.innerHTML = h.item ? `<b>${ITEM_NAMES[h.item]}</b><span><kbd>${ITEM_KEYS[p]}</kbd> использовать</span>` : '<span class="empty">Бонус</span>';
      }
      // speed (on the grid: engine revs + launch zones)
      const grid = h.phase === 'countdown';
      if (L.grid !== grid) {
        L.grid = grid;
        pane.el.classList.toggle('launch', grid);
        pane.unit.textContent = grid ? 'об/мин' : 'км/ч';
        if (!grid) setTimeout(() => { if (!L.grid) pane.launch.hidden = true; }, 900);
      }
      if (grid) this.updateLaunch(pane, h.launchRev);
      txt('kmh', pane.kmh, String(grid ? Math.round((900 + h.launchRev * 7600) / 100) * 100 : h.kmh));
      const f = grid ? h.launchRev : Math.max(0, Math.min(1, h.speedFrac / 1.12));
      const fq = Math.round(f * 200) / 2;
      if (L.f !== fq) {
        L.f = fq;
        pane.mask.setAttribute('stroke-dasharray', `${fq} 100`);
        const [x, y] = gaugePoint(fq / 100);
        pane.tip.setAttribute('cx', x.toFixed(1));
        pane.tip.setAttribute('cy', y.toFixed(1));
      }
      let gear = 'N';
      if (h.kmh >= 3) { gear = 1; for (const g of GEAR_AT) if (h.speedFrac > g) gear++; }
      txt('gear', pane.gear, String(gear));
      const nit = Math.round(h.nitro);
      if (L.nit !== nit) {
        L.nit = nit;
        pane.nitroBar.style.transform = `scaleX(${(nit / 100).toFixed(2)})`;
        pane.nv.textContent = nit >= 100 ? 'ГОТОВО' : `${nit}%`;
        pane.nitro.classList.toggle('full', nit >= 100);
      }
      if (L.nitroOn !== h.nitroActive) { L.nitroOn = h.nitroActive; pane.nitro.classList.toggle('on', h.nitroActive); }
      if (L.drifting !== h.drifting) { L.drifting = h.drifting; pane.drift.hidden = !h.drifting; }
      if (h.drifting) {
        const t = Math.min(1, h.driftTime / 3);
        pane.driftBar.style.transform = `scaleX(${t.toFixed(3)})`;
        if (L.dlv !== h.driftLevel) {
          L.dlv = h.driftLevel;
          pane.drift.style.setProperty('--dc', DRIFT_CSS[h.driftLevel]);
        }
        // the tail is close to coming all the way round: warn to catch it with counter-steer
        const warn = (race.humans[p]?.slip || 0) > CAR.DRIFT_SPIN_ANGLE * 0.72;
        txt('dlt', pane.dl, warn ? 'Контрруль!' : DRIFT_NAME[h.driftLevel] ? `Ур. ${DRIFT_NAME[h.driftLevel]}` : '');
        if (L.slipW !== warn) { L.slipW = warn; pane.drift.classList.toggle('slip', warn); }
      }
      const lo = Math.max(0, (h.speedFrac - 0.75) * 1.6) + (h.boosting ? 0.45 : 0);
      const loq = Math.round(Math.min(1, lo) * 20) / 20;
      if (L.lo !== loq) { L.lo = loq; pane.lines.style.opacity = String(loq); }
      const fx = h.empTime > 0 ? 'emp' : h.nitroActive ? 'nitro' : h.boosting ? 'boost' : '';
      if (L.fx !== fx) {
        L.fx = fx;
        pane.el.classList.toggle('boost', fx === 'boost');
        pane.el.classList.toggle('nitro', fx === 'nitro');
        pane.el.classList.toggle('emp', fx === 'emp');
      }
      if (towerDue && pane.towerOn) this.updateTower(pane, p);
    });
    this.drawMinimap();
  }

  /** Launch coaching on the grid: where the revs are and what to do with the gas. */
  updateLaunch(pane, rev) {
    const [g0] = CAR.LAUNCH_GREEN;
    const zone = rev >= CAR.LAUNCH_RED ? 'hot' : rev >= g0 ? 'ok' : rev > 0.03 ? 'up' : 'idle';
    const L = pane.last;
    if (L.lz === zone) return;
    L.lz = zone;
    pane.launch.hidden = false;
    pane.launch.className = 'h-launch ' + zone;
    pane.gaugeEl.dataset.lz = zone;
    const touch = document.body.classList.contains('touch-ui');
    const T = {
      idle: [touch ? 'Зажми джойстик на цифре «1»' : 'Жми газ на цифре «1»', 'Стрелка в зелёной зоне на старте — рывок вперёд'],
      up: ['Обороты растут…', 'Доведи стрелку до зелёной зоны'],
      ok: ['Держи! Зелёная зона', 'На старте будет идеальный рывок'],
      hot: ['Перегрев! Отпусти газ', 'В красной зоне двигатель заглохнет на старте'],
    }[zone];
    pane.launchB.textContent = T[0];
    pane.launchS.textContent = T[1];
  }

  /** Live standings (F1/GRID-style), refreshed ~5×/s. */
  updateTower(pane, p) {
    const race = this.race;
    const order = race.order || [...race.cars].sort((a, b) => a.place - b.place);
    if (!order.length) return;
    const me = race.humans[p];
    const max = Math.min(pane.towerMax, order.length);
    let list = order.slice(0, max);
    const myIdx = order.indexOf(me);
    if (myIdx >= max) list = [...order.slice(0, max - 1), me];
    while (pane.rows.length < list.length) {
      const r = document.createElement('div');
      r.className = 'tw-r';
      r.innerHTML = '<b class="tw-p"></b><i class="tw-c"></i><span class="tw-n"></span><span class="tw-g"></span>';
      pane.towerRows.appendChild(r);
      pane.rows.push({ el: r, p: r.children[0], c: r.children[1], n: r.children[2], g: r.children[3], last: {} });
    }
    const leader = order[0];
    const L = race.track.length;
    const active = order.filter((c) => !c.eliminated).length;
    const ref = Math.max(18, Math.min(90, race.raceTime > 2 ? leader.progress / race.raceTime : 40));
    list.forEach((c, i) => {
      const row = pane.rows[i];
      const R = row.last;
      const place = order.indexOf(c) + 1;
      let gap;
      if (c.eliminated) gap = 'ВЫБЫЛ';
      else if (c.finished) gap = c === leader ? 'ФИНИШ' : `+${(c.finishTime - leader.finishTime).toFixed(1)}`;
      else if (c === leader) gap = race.phase === 'countdown' ? '—' : race.mode === 'elim' ? 'ЛИДЕР' : `КРУГ ${Math.max(1, Math.min(c.lap, race.laps))}`;
      else {
        const d = Math.max(0, leader.progress - c.progress);
        if (d >= L && race.mode !== 'elim') gap = `+${Math.floor(d / L)} КР`;
        else if (race.raceTime < 2) gap = `+${Math.round(d)} м`;
        else gap = `+${(d / ref).toFixed(1)}`;
      }
      const cls = 'tw-r' + (c === me ? ' me' : c.human ? ' hu' : '') + (c.eliminated ? ' out' : '') + (race.mode === 'elim' && !c.eliminated && place === active && active > 1 ? ' danger' : '') + (i === list.length - 1 && myIdx >= max && c === me ? ' sep' : '') + (place <= 3 ? ` pod${place}` : '');
      if (R.cls !== cls) { R.cls = cls; row.el.className = cls; }
      if (R.pl !== place) { R.pl = place; row.p.textContent = place; }
      if (R.col !== c.color) { R.col = c.color; row.c.style.background = hexCss(c.color); row.c.style.color = hexCss(c.color); }
      if (R.nm !== c.name) { R.nm = c.name; row.n.textContent = c.name; }
      if (R.g !== gap) { R.g = gap; row.g.textContent = gap; }
    });
    for (let i = list.length; i < pane.rows.length; i++) pane.rows[i].el.className = 'tw-r gone';
  }

  // ---------------------------------------------------------------- minimap
  buildMinimapLayer() {
    const o = this.outline;
    const W = this.minimap.width, H = this.minimap.height;
    const pad = 22;
    const k = Math.min((W - pad * 2) / (o.maxX - o.minX), (H - pad * 2) / (o.maxZ - o.minZ));
    const ox = (W - (o.maxX - o.minX) * k) / 2, oz = (H - (o.maxZ - o.minZ) * k) / 2;
    this.mapT = { k, ox, oz };
    const P = (x, z) => [ox + (o.maxX - x) * k, oz + (o.maxZ - z) * k];
    const cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    const g = cv.getContext('2d');
    const path = () => {
      g.beginPath();
      o.pts.forEach(([x, z], i) => { const [a, b] = P(x, z); i ? g.lineTo(a, b) : g.moveTo(a, b); });
      g.closePath();
    };
    g.lineJoin = 'round'; g.lineCap = 'round';
    path(); g.strokeStyle = 'rgba(0,0,0,0.6)'; g.lineWidth = 12; g.stroke();
    path(); g.strokeStyle = 'rgba(255,255,255,0.08)'; g.lineWidth = 9; g.stroke();
    const grad = g.createLinearGradient(0, 0, W, H);
    grad.addColorStop(0, '#00e5ff'); grad.addColorStop(1, '#ff2bd6');
    g.shadowColor = '#00e5ff'; g.shadowBlur = 10;
    path(); g.strokeStyle = grad; g.lineWidth = 3; g.stroke();
    g.shadowBlur = 0;
    path(); g.strokeStyle = 'rgba(255,255,255,0.7)'; g.lineWidth = 1; g.stroke();
    // start/finish: checkered bar across the track
    const [sx, sy] = P(o.pts[0][0], o.pts[0][1]);
    const [nx, ny] = P(o.pts[2][0], o.pts[2][1]);
    const a = Math.atan2(ny - sy, nx - sx);
    g.save(); g.translate(sx, sy); g.rotate(a);
    for (let i = 0; i < 4; i++) for (let j = 0; j < 2; j++) { g.fillStyle = (i + j) % 2 ? '#111' : '#fff'; g.fillRect(-3 + j * 3, -6 + i * 3, 3, 3); }
    g.restore();
    this.mapLayer = cv;
  }

  drawMinimap() {
    if (!this.mapLayer || !this.race) return;
    const g = this.mctx, W = this.minimap.width, H = this.minimap.height;
    const { k, ox, oz } = this.mapT;
    const o = this.outline;
    const P = (x, z) => [ox + (o.maxX - x) * k, oz + (o.maxZ - z) * k];
    g.clearRect(0, 0, W, H);
    g.drawImage(this.mapLayer, 0, 0);
    const cars = this.race.cars;
    const multi = this.race.humans.length > 1;
    for (const c of cars) {
      if (c.eliminated || c.human) continue;
      const [x, y] = P(c.x, c.z);
      g.fillStyle = 'rgba(0,0,0,0.7)';
      g.beginPath(); g.arc(x, y, 5, 0, Math.PI * 2); g.fill();
      g.fillStyle = hexCss(c.color);
      g.beginPath(); g.arc(x, y, 3.4, 0, Math.PI * 2); g.fill();
    }
    for (const c of cars) {
      if (c.eliminated || !c.human) continue;
      const [x, y] = P(c.x, c.z);
      const ang = Math.atan2(-Math.cos(c.heading), -Math.sin(c.heading));
      g.save(); g.translate(x, y); g.rotate(ang);
      g.beginPath(); g.moveTo(10, 0); g.lineTo(-7, -7); g.lineTo(-3.5, 0); g.lineTo(-7, 7); g.closePath();
      g.lineJoin = 'round';
      g.lineWidth = 4; g.strokeStyle = 'rgba(0,0,0,0.75)'; g.stroke();
      g.fillStyle = hexCss(c.color); g.fill();
      g.lineWidth = 1.6; g.strokeStyle = '#fff'; g.stroke();
      g.restore();
      if (multi) {
        g.font = '700 11px "JetBrains Mono", monospace';
        g.fillStyle = 'rgba(0,0,0,0.75)';
        g.fillRect(x + 7, y - 19, 22, 13);
        g.fillStyle = '#fff';
        g.fillText(`P${c.player + 1}`, x + 9, y - 9);
      }
    }
  }
}
