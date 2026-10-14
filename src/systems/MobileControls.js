import { eventBus, Events } from '../core/EventBus.js';
import { ITEM_ICONS } from '../ui/Icons.js';

const STICK_RADIUS = 56; // px of thumb travel for full lock
const STICK_DEADZONE = 0.06;
const TILT_MAX = 0.42; // rad of roll for full lock (~24°)
const TILT_DEADZONE = 0.04;

export const isTouchDevice = () =>
  (window.matchMedia && matchMedia('(pointer: coarse)').matches) || 'ontouchstart' in window || navigator.maxTouchPoints > 0;

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/**
 * Mobile layer: per-player touch pads (floating stick / arrow buttons / tilt steering),
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
      const auto = s.autoGas !== false;
      Object.assign(this.input.touch[p], { active: p < n, steer: 0, gas: false, brake: false, drift: false, nitro: false, itemEdge: false, cameraEdge: false, autoGas: auto });
    }
    for (let p = 0; p < n; p++) this.pads.push(this.buildPad(p, n));
    this.root.classList.toggle('duo', n > 1);
    this.root.hidden = false;
    if (this.scheme === 'tilt' && n === 1) this.calibrateTilt();
  }

  buildPad(p, n) {
    const t = this.input.touch[p];
    const tilt = this.scheme === 'tilt' && n === 1;
    const arrows = this.scheme === 'buttons';
    const manual = this.gs.settings.autoGas === false;
    const el = document.createElement('div');
    el.className = 'tpad';
    Object.assign(el.style, n > 1 ? { left: p === 0 ? '0' : '50%', width: '50%' } : { left: '0', width: '100%' });
    let left;
    if (tilt) left = `<div class="tzone tilt-zone"><button class="tbtn brake-big" data-k="brake">ТОРМОЗ</button><span class="tz-hint">руль — наклон телефона</span></div>`;
    else if (arrows) left = `<div class="tzone arrows"><button class="tbtn arr" data-k="left" aria-label="Влево">◀</button><button class="tbtn arr" data-k="right" aria-label="Вправо">▶</button></div>`;
    else left = `<div class="tzone stick-zone"><div class="stick" hidden><i></i></div><span class="tz-hint">⟵ веди пальцем ⟶</span></div>`;
    el.innerHTML = `${left}
      <div class="tcluster${manual ? ' manual' : ''}">
        <button class="tbtn c-drift" data-k="drift">ДРИФТ</button>
        <button class="tbtn c-item" data-k="item" aria-label="Бонус"><span class="lbl">БОНУС</span></button>
        <button class="tbtn c-nitro" data-k="nitro">НИТРО</button>
        ${tilt ? '' : '<button class="tbtn c-brake" data-k="brake">ТОРМ</button>'}
        ${manual ? '<button class="tbtn c-gas" data-k="gas">ГАЗ</button>' : ''}
        <button class="tbtn c-cam" data-k="camera" aria-label="Камера">КАМ</button>
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
      else t[k] = true;
      if (k === 'item' || k === 'nitro') this.buzz(8);
    };
    const up = (e) => {
      e.preventDefault();
      b.classList.remove('on');
      if (k === 'left' && t.steer < 0) t.steer = 0;
      else if (k === 'right' && t.steer > 0) t.steer = 0;
      else if (!['item', 'camera', 'left', 'right'].includes(k)) t[k] = false;
    };
    b.addEventListener('pointerdown', down);
    b.addEventListener('pointerup', up);
    b.addEventListener('pointercancel', up);
  }

  /** Floating analog stick: appears under the thumb, follows it past full lock so reversing is instant. */
  bindStick(zone, t) {
    const stick = zone.querySelector('.stick');
    const knob = stick.querySelector('i');
    let id = null, ax = 0, ay = 0;
    const place = () => { stick.style.left = `${ax}px`; stick.style.top = `${ay}px`; };
    zone.addEventListener('pointerdown', (e) => {
      if (id !== null) return;
      e.preventDefault();
      id = e.pointerId;
      zone.setPointerCapture?.(id);
      const r = zone.getBoundingClientRect();
      ax = e.clientX - r.left; ay = e.clientY - r.top;
      place();
      stick.hidden = false;
      knob.style.transform = 'translate(-50%, -50%)';
      zone.classList.add('used');
    });
    zone.addEventListener('pointermove', (e) => {
      if (e.pointerId !== id) return;
      const r = zone.getBoundingClientRect();
      const x = e.clientX - r.left;
      let dx = x - ax;
      if (Math.abs(dx) > STICK_RADIUS) { ax = x - Math.sign(dx) * STICK_RADIUS; dx = Math.sign(dx) * STICK_RADIUS; place(); }
      let v = dx / STICK_RADIUS;
      v = Math.abs(v) < STICK_DEADZONE ? 0 : Math.sign(v) * Math.pow(Math.abs(v), 1.25);
      t.steer = clamp(v, -1, 1);
      knob.style.transform = `translate(calc(-50% + ${dx}px), -50%)`;
    });
    const end = (e) => {
      if (e.pointerId !== id) return;
      id = null;
      t.steer = 0;
      stick.hidden = true;
    };
    zone.addEventListener('pointerup', end);
    zone.addEventListener('pointercancel', end);
  }

  /** Per-frame: tilt steering + button feedback (item icon, nitro ready, drift colour). */
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
        pad.item.innerHTML = item ? ITEM_ICONS[item] : '<span class="lbl">БОНУС</span>';
        pad.item.classList.toggle('has', !!item);
      }
      const ready = car.nitro >= 15;
      if (L.ready !== ready) { L.ready = ready; pad.nitro.classList.toggle('ready', ready); }
      const lvl = car.drifting ? car.driftLevel || 0 : -1;
      if (L.lvl !== lvl) { L.lvl = lvl; pad.drift.dataset.lvl = String(lvl); }
    });
  }

  /** Release everything (pause, results, quit). */
  reset() {
    for (const t of this.input.touch) Object.assign(t, { steer: 0, gas: t.autoGas && this.go, brake: false, drift: false, nitro: false, itemEdge: false, cameraEdge: false });
    for (const b of this.root.querySelectorAll('.tbtn.on')) b.classList.remove('on');
    for (const s of this.root.querySelectorAll('.stick')) s.hidden = true;
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
