import { eventBus, Events } from '../core/EventBus.js';
import { ITEM_ICONS } from '../ui/Icons.js';

const STICK_DEADZONE = 0.06;
const TILT_MAX = 0.42; // rad of roll for full lock (~24°)
const TILT_DEADZONE = 0.04;
const STICK_REVERSE = 0.45; // pull the thumb down by this share of the radius → brake / reverse

export const isTouchDevice = () =>
  (window.matchMedia && matchMedia('(pointer: coarse)').matches) || 'ontouchstart' in window || navigator.maxTouchPoints > 0;

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/**
 * Mobile layer: per-player touch pads (static joystick / arrow buttons / tilt steering),
 * joystick = gas while touched, steer left/right, pull down to brake and reverse (like most mobile racers),
 * action cluster, haptics, tilt sensor and item/nitro feedback on the buttons.
 * Writes only into InputSystem.touch[p]; the race reads it like any other device.
 */
export class MobileControls {
  constructor(input, gameState) {
    this.input = input;
    this.gs = gameState;
    this.root = document.getElementById('touch');
    this.enabled = isTouchDevice();
    this.pads = [];
    this.tilt = { roll: 0, neutral: 0, has: false };
    input.touchEnabled = this.enabled;
    if (!this.enabled) return;
    document.body.classList.add('touch-ui');
    window.addEventListener('deviceorientation', (e) => this.onOrient(e));
    this.root.addEventListener('contextmenu', (e) => e.preventDefault());
    this.setupHaptics();
  }

  get scheme() { return this.gs.settings.steering || 'swipe'; }

  /** iOS 13+ needs an explicit permission prompt from a user gesture. */
  async requestTilt() {
    const DOE = window.DeviceOrientationEvent;
    if (DOE && typeof DOE.requestPermission === 'function') {
      try { return (await DOE.requestPermission()) === 'granted'; } catch { return false; }
    }
    return !!DOE;
  }

  onOrient(e) {
    if (e.beta == null || e.gamma == null) return;
    const b = (e.beta * Math.PI) / 180, g = (e.gamma * Math.PI) / 180;
    // Gravity ("down") in device coordinates, then rotated into screen space.
    const dx = Math.cos(b) * Math.sin(g), dy = -Math.sin(b);
    const ang = ((screen.orientation?.angle ?? window.orientation ?? 0) + 360) % 360;
    let sx = dx, sy = dy;
    if (ang === 90) { sx = -dy; sy = dx; } else if (ang === 270) { sx = dy; sy = -dx; } else if (ang === 180) { sx = -dx; sy = -dy; }
    if (Math.hypot(sx, sy) < 0.15) return; // phone lying flat: roll undefined
    this.tilt.roll = Math.atan2(sx, -sy);
    this.tilt.has = true;
  }

  calibrateTilt() { this.tilt.neutral = Math.abs(this.tilt.roll) < 0.5 ? this.tilt.roll : 0; }

  // ---------------------------------------------------------------- layout
  setup(race) {
    if (!this.enabled) return;
    this.race = race;
    this.go = false;
    this.root.innerHTML = '';
    this.pads = [];
    const n = race.humans.length;
    const s = this.gs.settings;
    for (let p = 0; p < 2; p++) {
      // Stick & tilt: gas only while held (unless «Авто» is chosen). Arrows: classic auto-gas.
      const auto = s.autoGas === true || this.scheme === 'buttons';
      Object.assign(this.input.touch[p], { active: p < n, steer: 0, gas: false, brake: false, bb: false, sb: false, drift: false, nitro: false, itemEdge: false, cameraEdge: false, autoGas: auto });
    }
    for (let p = 0; p < n; p++) this.pads.push(this.buildPad(p, n));
    this.root.classList.toggle('duo', n > 1);
    this.root.hidden = false;
    if (this.scheme === 'tilt' && n === 1) this.calibrateTilt();
    this.showCoach(n);
  }

  /**
   * Layout (per player half in duo):
   *   left  — static joystick (or ◀ ▶, or GAS/BRAKE pedals for tilt)
   *   right — only what a racer needs: big DRIFT, NITRO with a charge ring, and an ITEM button that
   *           pops up only while a bonus is held. Braking/reverse live on the stick; camera is in the top bar.
   */
  buildPad(p, n) {
    const t = this.input.touch[p];
    const tilt = this.scheme === 'tilt' && n === 1;
    const arrows = this.scheme === 'buttons';
    const el = document.createElement('div');
    el.className = 'tpad';
    Object.assign(el.style, n > 1 ? { left: p === 0 ? '0' : '50%', width: '50%' } : { left: '0', width: '100%' });
    let left;
    if (tilt) {
      left = `<div class="tzone pedals">
        <button class="tbtn pedal brake-pedal" data-k="brake" aria-label="Тормоз / назад"><span>ТОРМОЗ</span></button>
        ${t.autoGas ? '' : '<button class="tbtn pedal gas-pedal" data-k="gas" aria-label="Газ"><span>ГАЗ</span></button>'}
      </div>`;
    } else if (arrows) {
      left = `<div class="tzone arrows"><button class="tbtn arr" data-k="left" aria-label="Влево">◀</button><button class="tbtn arr" data-k="right" aria-label="Вправо">▶</button></div>`;
    } else {
      left = `<div class="tzone stick-zone"><div class="stick"><span class="s-up">ГАЗ</span><span class="s-dn">НАЗАД</span><b class="s-ring"></b><i></i></div></div>`;
    }
    el.innerHTML = `${left}
      <div class="tcluster">
        <button class="tbtn c-drift" data-k="drift"><span>ДРИФТ</span></button>
        <button class="tbtn c-nitro" data-k="nitro"><span>НИТРО</span></button>
        <button class="tbtn c-item" data-k="item" aria-label="Бонус" hidden></button>
        ${arrows ? '<button class="tbtn c-brake" data-k="brake" aria-label="Тормоз"><span>ТОРМ</span></button>' : ''}
      </div>`;
    this.root.appendChild(el);

    for (const b of el.querySelectorAll('.tbtn')) this.bindButton(b, t);
    const zone = el.querySelector('.stick-zone');
    if (zone) this.bindStick(zone, t);
    return { el, t, item: el.querySelector('.c-item'), nitro: el.querySelector('.c-nitro'), drift: el.querySelector('.c-drift'), last: {} };
  }

  bindButton(b, t) {
    const k = b.dataset.k;
    const down = (e) => {
      e.preventDefault();
      b.setPointerCapture?.(e.pointerId);
      b.classList.add('on');
      if (k === 'left') t.steer = -1;
      else if (k === 'right') t.steer = 1;
      else if (k === 'item') t.itemEdge = true;
      else if (k === 'camera') t.cameraEdge = true;
      else if (k === 'brake') { t.bb = true; t.brake = true; }
      else t[k] = true;
      this.buzz(k === 'item' || k === 'nitro' ? 10 : 6);
    };
    const up = (e) => {
      e.preventDefault();
      b.classList.remove('on');
      if (k === 'left' && t.steer < 0) t.steer = 0;
      else if (k === 'right' && t.steer > 0) t.steer = 0;
      else if (k === 'brake') { t.bb = false; t.brake = t.sb; }
      else if (!['item', 'camera', 'left', 'right'].includes(k)) t[k] = false;
    };
    b.addEventListener('pointerdown', down);
    b.addEventListener('pointerup', up);
    b.addEventListener('pointercancel', up);
  }

  /**
   * Static joystick: the base never moves. A touch anywhere in the left zone drives the knob relative
   * to the base centre — touching = gas, left/right = steer, pulling down = brake then reverse,
   * letting go = coast.
   */
  bindStick(zone, t) {
    const stick = zone.querySelector('.stick');
    const knob = stick.querySelector('i');
    let id = null, origin = null;
    const centre = () => { const r = stick.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, R: r.width * 0.42 }; };
    const pedal = (dy, R) => {
      const back = dy > STICK_REVERSE * R;
      if (!t.autoGas) t.gas = !back;
      else t.gas = this.go && !back;
      t.sb = back;
      t.brake = t.sb || t.bb;
      stick.classList.toggle('rev', back);
    };
    const move = (e) => {
      const c = origin;
      let dx = e.clientX - c.x, dy = e.clientY - c.y;
      const len = Math.hypot(dx, dy);
      if (len > c.R) { dx *= c.R / len; dy *= c.R / len; }
      let v = dx / c.R;
      v = Math.abs(v) < STICK_DEADZONE ? 0 : Math.sign(v) * Math.pow(Math.abs(v), 1.35);
      t.steer = clamp(v, -1, 1);
      knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
      pedal(dy, c.R);
    };
    zone.addEventListener('pointerdown', (e) => {
      if (id !== null) return;
      e.preventDefault();
      id = e.pointerId;
      zone.setPointerCapture?.(id);
      // The base never moves. A thumb landing on it steers from its centre; a thumb landing elsewhere
      // in the zone uses its own landing point as neutral, so it never jerks the car sideways.
      const c = centre();
      origin = Math.hypot(e.clientX - c.x, e.clientY - c.y) <= c.R * 1.25 ? c : { x: e.clientX, y: e.clientY, R: c.R };
      stick.classList.add('held');
      move(e);
    });
    zone.addEventListener('pointermove', (e) => { if (e.pointerId === id) move(e); });
    const end = (e) => {
      if (e.pointerId !== id) return;
      id = null;
      t.steer = 0;
      t.gas = t.autoGas && this.go;
      t.sb = false;
      t.brake = t.bb;
      knob.style.transform = 'translate(-50%, -50%)';
      stick.classList.remove('held', 'rev');
    };
    zone.addEventListener('pointerup', end);
    zone.addEventListener('pointercancel', end);
  }

  /** First races on a phone: short coach marks over the controls during the countdown. */
  showCoach(n) {
    let seen = 0;
    try { seen = +localStorage.getItem('neonrush.coach') || 0; } catch { /* storage blocked */ }
    if (seen >= 3 || n > 1) return;
    try { localStorage.setItem('neonrush.coach', String(seen + 1)); } catch { /* */ }
    const tip = document.createElement('div');
    tip.className = 'coach';
    const stick = this.scheme === 'swipe';
    tip.innerHTML = `
      <div class="coach-l">${stick ? '<b>Держи</b> — газ<br><b>Влево / вправо</b> — руль<br><b>Вниз</b> — тормоз и назад' : this.scheme === 'tilt' ? '<b>Наклоняй телефон</b> — руль' : '<b>◀ ▶</b> — руль, газ сам'}</div>
      <div class="coach-r"><b>Дрифт</b> — держи в повороте,<br>отпусти — турбо</div>`;
    this.root.appendChild(tip);
    setTimeout(() => tip.classList.add('out'), 5200);
    setTimeout(() => tip.remove(), 6000);
  }

  /** Per-frame: tilt steering + button feedback (item pop-up, nitro charge ring, drift colour). */
  update(race) {
    if (!this.enabled || !this.pads.length) return;
    if (this.scheme === 'tilt' && this.pads.length === 1 && this.tilt.has) {
      let v = (this.tilt.roll - this.tilt.neutral) / TILT_MAX;
      v = Math.abs(v) < TILT_DEADZONE ? 0 : v;
      this.input.touch[0].steer = clamp(v, -1, 1);
    }
    this.pads.forEach((pad, p) => {
      const car = race.humans[p];
      if (!car) return;
      const L = pad.last;
      const item = car.item || '';
      if (L.item !== item) {
        L.item = item;
        pad.item.innerHTML = item ? ITEM_ICONS[item] : '';
        pad.item.hidden = !item;
        if (item) this.buzz(15);
      }
      const n = Math.round(car.nitro);
      if (L.n !== n) { L.n = n; pad.nitro.style.setProperty('--n', `${n}%`); pad.nitro.classList.toggle('ready', n >= 15); }
      const lvl = car.drifting ? car.driftLevel || 0 : -1;
      if (L.lvl !== lvl) { L.lvl = lvl; pad.drift.dataset.lvl = String(lvl); }
    });
  }

  /** Release everything (pause, results, quit). */
  reset() {
    for (const t of this.input.touch) Object.assign(t, { steer: 0, gas: t.autoGas && this.go, brake: false, bb: false, sb: false, drift: false, nitro: false, itemEdge: false, cameraEdge: false });
    for (const b of this.root.querySelectorAll('.tbtn.on')) b.classList.remove('on');
    for (const s of this.root.querySelectorAll('.stick')) s.classList.remove('held', 'rev');
    for (const k of this.root.querySelectorAll('.stick i')) k.style.transform = 'translate(-50%, -50%)';
  }

  hide() {
    if (!this.enabled) return;
    this.reset();
    for (const t of this.input.touch) t.active = false;
    this.root.hidden = true;
    this.root.innerHTML = '';
    this.pads = [];
  }

  // ---------------------------------------------------------------- haptics
  buzz(pattern) {
    if (this.gs.settings.haptics === false || !navigator.vibrate) return;
    try { navigator.vibrate(pattern); } catch { /* not allowed */ }
  }

  /** Auto-gas starts with the lights so it never counts as a jump start. */
  onGo() {
    this.go = true;
    for (const t of this.input.touch) if (t.active && t.autoGas) t.gas = true;
    if (this.scheme === 'tilt') this.calibrateTilt();
  }

  setupHaptics() {
    const live = () => this.pads.length > 0;
    const me = (car) => live() && car?.human;
    eventBus.on(Events.CAR_WALL_HIT, ({ car, impact }) => { if (me(car) && impact > 6) this.buzz(Math.min(60, Math.round(impact * 3))); });
    eventBus.on(Events.CAR_CAR_HIT, ({ a, b, impact }) => { if ((me(a) || me(b)) && impact > 4) this.buzz(22); });
    eventBus.on(Events.CAR_SPINOUT, ({ car }) => { if (me(car)) this.buzz([90, 40, 90]); });
    eventBus.on(Events.CAR_BOOST, ({ car }) => { if (me(car)) this.buzz(14); });
    eventBus.on(Events.CAR_DRIFT_LEVEL, ({ car }) => { if (me(car)) this.buzz(10); });
    eventBus.on(Events.CAR_LAND, ({ car, impact }) => { if (me(car) && impact > 5) this.buzz(28); });
    eventBus.on(Events.RACE_COUNTDOWN, ({ n }) => {
      if (!live()) return;
      this.buzz(n === 0 ? 120 : 30);
      if (n === 0) this.onGo();
    });
    eventBus.on(Events.CAR_FINISH, ({ car }) => { if (me(car)) this.buzz([60, 50, 60, 50, 160]); });
  }
}
