import * as THREE from 'three';
import { eventBus, Events } from '../core/EventBus.js';
import { sfx } from '../audio/sfx.js';

/*
 * v5.7 «A+++ feel»: how the driving itself feels.
 *  - Style combo: drifts, near misses, overtakes, big jumps, slingshots and hits on rivals chain into one combo
 *    with a growing multiplier (×1…×8). Keep the chain alive within ~3 s (a drift keeps it alive by itself).
 *    A hard wall hit or a spin breaks it. When the chain ends it is banked: points + nitro.
 *  - Slingshot: sit in a rival's slipstream for a second, pull out — a short kick of boost.
 *    While in the slipstream, wind lines rush past the car.
 *  - Punch: a short FOV kick on every boost, a red edge flash on hard impacts.
 * Pure add-on: listens to game events, never changes the race rules except the small slingshot boost and nitro.
 */

const WINDOW = 3.0; // seconds to land the next trick
const MAX_MULT = 8;
const STREAKS = 22;

const CSS = `
.fx-combo { position: absolute; left: 50%; top: max(16px, env(safe-area-inset-top)); transform: translateX(-50%) scale(0.9); display: grid; justify-items: center;
  pointer-events: none; opacity: 0; transition: opacity 0.25s, transform 0.25s cubic-bezier(.2,1.6,.4,1); font-family: var(--f-display); }
.fx-combo.on { opacity: 1; transform: translateX(-50%) scale(1); }
.fx-combo .cx-row { display: flex; align-items: baseline; gap: 10px; }
.fx-combo .cx-score { font-size: 34px; font-weight: 900; color: #fff; letter-spacing: 0.02em; text-shadow: 0 0 18px var(--cx, #00e5ff), 0 2px 0 rgba(0,0,0,0.5); font-variant-numeric: tabular-nums; }
.fx-combo .cx-mult { font-size: 22px; font-weight: 900; color: var(--cx, #00e5ff); text-shadow: 0 0 14px var(--cx, #00e5ff); }
.fx-combo .cx-mult.pop { animation: cxPop 0.35s cubic-bezier(.2,1.8,.4,1); }
@keyframes cxPop { from { transform: scale(1.8); } to { transform: none; } }
.fx-combo .cx-bar { width: 180px; height: 4px; margin-top: 4px; background: rgba(255,255,255,0.12); border-radius: 2px; overflow: hidden; }
.fx-combo .cx-bar u { display: block; height: 100%; background: var(--cx, #00e5ff); box-shadow: 0 0 10px var(--cx, #00e5ff); transform-origin: left; }
.fx-combo .cx-last { margin-top: 5px; font: 700 11px var(--f-mono); letter-spacing: 0.24em; text-transform: uppercase; color: rgba(255,255,255,0.78); }
.fx-combo.bank .cx-score { animation: cxBank 0.6s ease-out; }
@keyframes cxBank { 30% { transform: scale(1.25); color: #ffd400; } to { transform: none; } }
.fx-combo.lost { opacity: 0 !important; transform: translateX(-50%) translateY(10px) scale(0.9) !important; transition: opacity 0.6s, transform 0.6s; }
.compact .fx-combo { top: 54px; }
.compact .fx-combo .cx-score { font-size: 26px; }
.phud .fx-hit { position: absolute; inset: 0; pointer-events: none; opacity: 0; box-shadow: inset 0 0 90px 18px rgba(255, 40, 70, 0.55); }
.phud .fx-hit.on { animation: fxHit 0.45s ease-out; }
@keyframes fxHit { from { opacity: 1; } to { opacity: 0; } }
.pr-chip.fx-best { background: linear-gradient(90deg, rgba(0,229,255,0.25), rgba(255,122,26,0.22)); }
`;

const COLORS = ['#00e5ff', '#00e5ff', '#39ff88', '#ffd400', '#ff9a1a', '#ff2bd6', '#c04dff', '#ffffff', '#ffffff'];

export class FeelFX {
  constructor(game) {
    this.game = game;
    this.race = null;
    this.slots = [];
    const st = document.createElement('style');
    st.id = 'feel-style';
    st.textContent = CSS;
    document.head.appendChild(st);
    const slot = (car) => this.slots.find((s) => s.car === car);
    eventBus.on(Events.CAR_DRIFT_LEVEL, ({ car, level }) => { const s = slot(car); if (s && level > 0) this.trick(s, ['', 'ДРИФТ', 'СУПЕР ДРИФТ', 'УЛЬТРА ДРИФТ'][level], 120 * level); });
    eventBus.on(Events.CAR_NEARMISS, ({ car }) => { const s = slot(car); if (s) this.trick(s, 'НА ВОЛОСОК', 250); });
    eventBus.on(Events.CAR_OVERTAKE, ({ car }) => { const s = slot(car); if (s) this.trick(s, 'ОБГОН', 200); });
    eventBus.on(Events.CAR_LAND, ({ car, airTime }) => { const s = slot(car); if (s && airTime > 0.45) this.trick(s, 'ПОЛЁТ', Math.round(400 * airTime)); });
    eventBus.on(Events.ITEM_HIT, ({ car, by }) => { const s = slot(by); if (s && car !== by) this.trick(s, 'ПОПАДАНИЕ', 300); });
    eventBus.on(Events.CAR_WALL_HIT, ({ car, impact }) => {
      const s = slot(car);
      if (!s) return;
      if (impact > 9) this.hitFlash(s);
      if (impact > 7) this.lose(s);
    });
    eventBus.on(Events.CAR_SPINOUT, ({ car, source }) => { const s = slot(car); if (s && source !== 'drift') { this.hitFlash(s); this.lose(s); } });
    eventBus.on(Events.CAR_BOOST, ({ car }) => { const s = slot(car); if (s) this.punch(s, 5); });
    // results: the best combo of the race next to the rewards (runs after the game has built the results screen)
    eventBus.on(Events.RACE_FINISHED, () => setTimeout(() => this.showBest(), 0));
  }

  attach(race) {
    this.detach();
    this.race = race;
    if (race.demo) return;
    const panes = document.querySelectorAll('.phud');
    this.slots = race.humans.map((car, i) => {
      const pane = panes[i];
      let el = null, hit = null;
      if (pane) {
        el = document.createElement('div');
        el.className = 'fx-combo';
        el.innerHTML = '<div class="cx-row"><b class="cx-score">0</b><span class="cx-mult">×1</span></div><i class="cx-bar"><u></u></i><small class="cx-last"></small>';
        hit = document.createElement('div');
        hit.className = 'fx-hit';
        pane.append(hit, el);
      }
      // wind lines for the slipstream: one instanced mesh of thin light streaks around the car
      const geo = new THREE.BoxGeometry(0.025, 0.025, 1);
      const mat = new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
      const mesh = new THREE.InstancedMesh(geo, mat, STREAKS);
      mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(STREAKS * 3), 3);
      mesh.frustumCulled = false;
      mesh.visible = false;
      race.scene.add(mesh);
      const streaks = Array.from({ length: STREAKS }, () => ({ a: Math.random() * Math.PI * 2, r: 1.3 + Math.random() * 0.9, z: Math.random() * 10 - 5, len: 1.5 + Math.random() * 2 }));
      return {
        car, i, el, hit, mesh, geo, mat, streaks,
        score: 0, mult: 1, timer: 0, best: 0, last: '', slip: 0, wasSlip: false, wind: 0,
        nodes: el ? { score: el.querySelector('.cx-score'), mult: el.querySelector('.cx-mult'), bar: el.querySelector('.cx-bar u'), last: el.querySelector('.cx-last') } : null,
      };
    });
  }

  detach() {
    for (const s of this.slots) {
      s.el?.remove(); s.hit?.remove();
      this.race?.scene.remove(s.mesh);
      s.mesh.dispose(); s.geo.dispose(); s.mat.dispose();
    }
    this.slots = [];
    this.race = null;
  }

  get active() { return this.race && this.race.phase === 'racing'; }

  /** A trick: adds points, raises the multiplier and refreshes the chain window. */
  trick(s, name, pts) {
    if (!this.active || s.car.finished || s.car.eliminated) return;
    const fresh = s.score <= 0;
    s.score += pts;
    if (!fresh) s.mult = Math.min(MAX_MULT, s.mult + 1);
    s.timer = WINDOW;
    s.last = name;
    if (!fresh) sfx.comboTick(s.mult);
    if (s.nodes && !fresh) { s.nodes.mult.classList.remove('pop'); void s.nodes.mult.offsetWidth; s.nodes.mult.classList.add('pop'); }
    if (s.el) s.el.classList.remove('lost', 'bank');
  }

  bank(s) {
    if (s.score <= 0) return;
    const total = Math.round(s.score * s.mult);
    s.best = Math.max(s.best, total);
    s.car.nitro = Math.min(100, s.car.nitro + Math.max(4, Math.min(40, total / 150)));
    eventBus.emit(Events.UI_POPUP, { player: s.car.player, text: `КОМБО +${fmtN(total)}`, color: '#ffd400' });
    sfx.comboBank(s.mult);
    this.game.mobile?.buzz?.([20, 30, 40]);
    s.score = 0; s.mult = 1; s.timer = 0;
    if (s.el) { s.el.classList.add('bank'); setTimeout(() => s.el?.classList.remove('on', 'bank'), 650); }
  }

  lose(s) {
    if (s.score <= 0) return;
    eventBus.emit(Events.UI_POPUP, { player: s.car.player, text: 'КОМБО СОРВАНО', color: '#ff4060' });
    sfx.comboLost();
    s.score = 0; s.mult = 1; s.timer = 0;
    if (s.el) { s.el.classList.add('lost'); setTimeout(() => s.el?.classList.remove('on', 'lost'), 650); }
  }

  hitFlash(s) {
    if (!s.hit) return;
    s.hit.classList.remove('on'); void s.hit.offsetWidth; s.hit.classList.add('on');
  }

  /** Short FOV kick (the chase camera eases back on its own). */
  punch(s, deg) {
    const cam = this.race?.rigs?.[s.car.player]?.camera;
    if (!cam) return;
    cam.fov += deg;
    cam.updateProjectionMatrix();
  }

  update(dt) {
    if (!this.race) return;
    for (const s of this.slots) {
      const car = s.car;
      // ---- slipstream slingshot
      if (car.slipstream) s.slip += dt;
      if (s.wasSlip && !car.slipstream) {
        if (s.slip > 1.0 && Math.abs(car.speed) > 30 && this.active && !car.finished) {
          car.boostTime = Math.max(car.boostTime, 0.75);
          eventBus.emit(Events.CAR_BOOST, { car, time: 0.75 });
          eventBus.emit(Events.UI_POPUP, { player: car.player, text: 'РЫВОК ИЗ-ЗА СПИНЫ!', color: '#7fe8ff' });
          sfx.slingshot();
          this.punch(s, 4);
          this.trick(s, 'РЫВОК', 200);
        }
        s.slip = 0;
      }
      if (!car.slipstream && !s.wasSlip) s.slip = 0;
      s.wasSlip = car.slipstream;
      this.updateWind(s, dt);
      // ---- combo clock: a drift keeps the chain alive and keeps scoring
      if (s.score > 0) {
        if (car.drifting && car.driftLevel > 0) { s.score += 70 * car.driftLevel * dt; s.timer = Math.max(s.timer, 1.2); }
        else s.timer -= dt;
        if (s.timer <= 0 || car.finished || !this.active) this.bank(s);
      }
      this.render(s);
    }
  }

  updateWind(s, dt) {
    const car = s.car;
    s.wind += ((car.slipstream ? 1 : 0) - s.wind) * Math.min(1, dt * (car.slipstream ? 5 : 3));
    const m = s.mesh;
    m.visible = s.wind > 0.02 && car.model.root.visible;
    if (!m.visible) return;
    const fx = Math.sin(car.heading), fz = Math.cos(car.heading), rx = -fz, rz = fx;
    const sp = Math.max(20, Math.abs(car.speed));
    const M = _m, q = _q.setFromAxisAngle(_up, car.heading);
    for (let i = 0; i < STREAKS; i++) {
      const w = s.streaks[i];
      w.z -= sp * 0.9 * dt;
      if (w.z < -6) { w.z = 5 + Math.random() * 2; w.a = Math.random() * Math.PI * 2; w.r = 1.3 + Math.random() * 0.9; }
      const ox = Math.cos(w.a) * w.r, oy = 0.7 + Math.sin(w.a) * w.r * 0.55;
      _v.set(car.x + rx * ox + fx * w.z, car.y + Math.max(0.15, oy), car.z + rz * ox + fz * w.z);
      M.compose(_v, q, _s.set(1, 1, w.len));
      m.setMatrixAt(i, M);
      const fade = Math.min(1, (w.z + 6) / 3) * Math.min(1, (6 - w.z) / 3);
      m.setColorAt(i, _c.setRGB(0.55, 0.85, 1).multiplyScalar(1.6 * s.wind * Math.max(0, fade)));
    }
    m.instanceMatrix.needsUpdate = true;
    m.instanceColor.needsUpdate = true;
  }

  render(s) {
    const n = s.nodes;
    if (!n) return;
    const on = s.score > 0;
    if (on && !s.el.classList.contains('on')) s.el.classList.add('on');
    if (!on) return;
    n.score.textContent = fmtN(Math.round(s.score));
    n.mult.textContent = `×${s.mult}`;
    n.last.textContent = s.last;
    n.bar.style.transform = `scaleX(${Math.max(0, Math.min(1, s.timer / WINDOW))})`;
    s.el.style.setProperty('--cx', COLORS[s.mult]);
  }

  showBest() {
    const s = this.slots.find((x) => x.car.player === 0);
    if (!s || s.best <= 0) return;
    const box = document.querySelector('#screen-results .pr-reward');
    if (!box || box.querySelector('.fx-best')) return;
    const chip = document.createElement('span');
    chip.className = 'pr-chip fx-best';
    chip.innerHTML = `Лучшее комбо <b>${fmtN(s.best)}</b>`;
    const bal = box.querySelector('.pr-bal');
    box.insertBefore(chip, bal || null);
  }
}

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _v = new THREE.Vector3(), _s = new THREE.Vector3(), _c = new THREE.Color();
const _up = new THREE.Vector3(0, 1, 0);
const fmtN = (n) => Math.round(n).toLocaleString('ru-RU');
