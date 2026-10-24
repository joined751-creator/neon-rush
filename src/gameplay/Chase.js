import * as THREE from 'three';
import { AI, CAR_TYPES, CHASE, DIFFICULTY } from '../core/Constants.js';
import { eventBus, Events } from '../core/EventBus.js';
import { angleDiff } from '../level/Track.js';
import { buildCarModel, disposeCarModel } from './CarModel.js';
import { tidyModel } from './LightTrails.js';
import { AIDriver } from './AIDriver.js';

/*
 * «ПОГОНЯ» (v4.3) — the player runs from the neon police.
 * Patrol cars start a little behind with sirens and flashing light bars; they ram, try to box the player in
 * and get faster as the wanted level rises (★ → ★★★ every 30 s). Stay close to a patrol car while slow
 * and the "capture" meter fills — full means BUSTED. Survive until the timer runs out to escape.
 * Rockets, oil, EMP and Overdrive spin police cars out ("takedowns").
 */

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const COP_WHITE = 0xe9eef8;
const COP_BLUE = 0x2f6bff;
const RED = new THREE.Color(0xff1a3c);
const BLUE = new THREE.Color(0x1f5cff);
const TITAN = Math.max(0, CAR_TYPES.findIndex((t) => t.id === 'titan'));
const _box = new THREE.Box3();
const _v = new THREE.Vector3();
let blobTex = null;

function blob() {
  const S = 64;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  gr.addColorStop(0, 'rgba(255,255,255,1)');
  gr.addColorStop(0.3, 'rgba(255,255,255,0.5)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, S, S);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

let labelTex = null;
function copLabel() {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 128;
  const g = c.getContext('2d');
  g.font = '900 64px "Unbounded", "Arial Black", sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.lineWidth = 10;
  g.strokeStyle = 'rgba(0,0,0,0.85)';
  g.strokeText('ПОЛИЦИЯ', 256, 64);
  g.shadowColor = '#2f6bff';
  g.shadowBlur = 18;
  g.fillStyle = '#e9f0ff';
  g.fillText('ПОЛИЦИЯ', 256, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Roof top of a car model (root-local): highest point and the middle of the roof panel. */
function roofOf(model) {
  const root = model.root;
  const p = root.position.clone(), q = root.quaternion.clone();
  root.position.set(0, 0, 0);
  root.quaternion.identity();
  root.updateMatrixWorld(true);
  let top = -Infinity;
  model.body.traverse((o) => { if (o.isMesh && o.visible) { _box.setFromObject(o); top = Math.max(top, _box.max.y); } });
  let zs = 0, n = 0;
  model.body.traverse((o) => {
    const pos = o.isMesh && o.geometry?.attributes?.position;
    if (!pos || pos.count > 20000) return;
    for (let i = 0; i < pos.count; i += 3) {
      _v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld);
      if (_v.y > top - 0.06) { zs += _v.z; n++; }
    }
  });
  root.position.copy(p);
  root.quaternion.copy(q);
  root.updateMatrixWorld(true);
  return { y: top, z: n ? zs / n : -0.4 };
}

/** Police AI: the normal racing line far away; up close it rams the target or cuts in front to box it in. */
class PoliceDriver {
  constructor(base, chase) {
    this.base = base;
    this.chase = chase;
    this.car = base.car;
    this.track = base.track;
    this._p = {};
  }

  update(dt, cars, leader) {
    const car = this.car, c = car.controls, t = this.track;
    car.item = null; // patrols don't use pickups
    this.base.update(dt, cars, leader);
    c.item = false;
    const target = this.chase.targetFor(car);
    if (!target) { c.throttle = 0; c.brake = 0.6; c.nitro = false; c.drift = false; return; }
    const gap = target.progress - car.progress; // + target ahead of the patrol
    // pace: wanted level + catch-up when left far behind
    const lvl = CHASE.COP_SPEED[this.chase.level - 1] ?? 1;
    const far = clamp((gap - CHASE.CATCHUP_FROM) / CHASE.CATCHUP_RANGE, 0, 1);
    const mult = this.chase.skill.speedMult * lvl * (1 + CHASE.CATCHUP * far);
    car.topMult += (mult - car.topMult) * Math.min(1, dt * 1.5);
    car.accelMult = Math.max(car.accelMult, 1.15 + far * 0.6);
    if (gap > 70 && c.throttle > 0 && car.nitro > 25 && Math.abs(t.curv[car.trackIndex]) < 0.006) c.nitro = true;
    if (Math.abs(gap) > CHASE.PURSUIT_DIST || target.airborne || car.airborne || car.spinTime > 0) return;

    const speed = Math.max(0, car.speed);
    let px, pz;
    if (gap > -3) {
      // ram: aim at where the target will be in a moment, slightly to its side for a PIT-style hit
      const lead = clamp(gap / Math.max(8, speed - target.speed + 6), 0, 0.5);
      px = target.x + target.vx * lead;
      pz = target.z + target.vz * lead;
      c.throttle = 1; c.brake = 0;
      c.nitro = c.nitro || (gap > 14 && car.nitro > 10);
    } else {
      // ahead of the target: drift across its line and brake to box it in
      const p = t.pointAt(car.s + 12 + speed * 0.3, target.lateral, this._p);
      px = p.x; pz = p.z;
      const slower = car.speed > target.speed - 3;
      c.throttle = slower ? 0 : 1;
      c.brake = slower && gap > -25 ? 0.35 : 0;
      c.nitro = false;
    }
    const err = angleDiff(Math.atan2(px - car.x, pz - car.z), car.heading);
    let steer = clamp(-err * AI.STEER_GAIN * 1.15, -1, 1);
    if (Math.abs(car.lateral) > t.half - 2.2) steer = clamp(steer - Math.sign(car.lateral) * 0.5, -1, 1);
    c.steer = steer;
    c.drift = false;
  }
}

export class ChaseMode {
  constructor(race) {
    this.race = race;
    this.time = 0;
    this.level = 1;
    this.unsub = [];
    this.skill = DIFFICULTY[race.settings.difficulty] ?? DIFFICULTY[1];
    this.cops = race.cars.filter((c) => !c.human);
    this.state = race.humans.map(() => ({ heat: 0, busted: false, escaped: false, at: null, dist: 0, takedowns: 0, near: Infinity, escapeCool: 0 }));
    race.humans.forEach((h, i) => { h.chase = this.state[i]; });
    blobTex ||= blob();
    this.lights = [];

    // grid: players in front, patrols lined up behind them
    const L = race.track.length;
    const front = L - 10;
    race.humans.forEach((h, i) => h.placeAt(front - i * 3, race.humans.length > 1 ? (i ? 1 : -1) * 4.2 : 0));
    const k = race.theme.carLights ?? 0.7;
    this.cops.forEach((car, i) => {
      car.placeAt(front - CHASE.START_GAP - Math.floor(i / 2) * 11, (i % 2 ? 1 : -1) * 3.6);
      this.makeCop(car, i, k);
      race.drivers.set(car, new PoliceDriver(race.drivers.get(car), this));
    });

    this.unsub.push(eventBus.on(Events.CAR_CAR_HIT, ({ a, b, impact }) => {
      const cop = a.cop ? a : b.cop ? b : null, h = a.human ? a : b.human ? b : null;
      if (!cop || !h || !h.chase || h.chase.busted || this.race.phase !== 'racing') return;
      h.chase.heat = Math.min(1, h.chase.heat + Math.min(0.2, impact * CHASE.RAM_HEAT));
      if (h.chase.heat >= 1) this.bust(h);
    }));
    this.unsub.push(eventBus.on(Events.CAR_SPINOUT, ({ car, source }) => {
      if (!car.cop || source === 'drift' || this.race.phase !== 'racing') return;
      let best = null, bd = 60 * 60;
      for (const h of this.race.humans) {
        const d = (h.x - car.x) ** 2 + (h.z - car.z) ** 2;
        if (!h.chase.busted && d < bd) { bd = d; best = h; }
      }
      if (!best) return;
      best.chase.takedowns++;
      this.popup(best, 'ПАТРУЛЬ СБИТ!', '#ffd400', true);
    }));
  }

  popup(car, text, color, big = false) {
    eventBus.emit(Events.UI_POPUP, { player: car.player, text, color, big });
  }

  /** Police livery: white car, blue underglow, light bar with red/blue strobes and a coloured pool on the road. */
  makeCop(car, i, k) {
    const scene = this.race.scene;
    car.type = CAR_TYPES[TITAN];
    car.typeIndex = TITAN;
    scene.remove(car.model.root);
    disposeCarModel(car.model);
    car.model = buildCarModel(car.type.id, COP_WHITE);
    scene.add(car.model.root);
    tidyModel(car.model);
    if (car.model.glow) car.model.glow.material.color.setHex(COP_BLUE).multiplyScalar(1.2);
    car.color = COP_BLUE;
    car.name = `Патруль ${i + 1}`;
    car.cop = true;
    car.updateVisual(0);

    const roof = roofOf(car.model);
    const bar = new THREE.Group();
    bar.position.set(0, roof.y + 0.02, roof.z - 0.2);
    const base = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.08, 0.34), new THREE.MeshStandardMaterial({ color: 0x15161c, roughness: 0.4, metalness: 0.6 }));
    base.position.y = 0.04;
    const mkLamp = (x) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.16, 0.28), new THREE.MeshBasicMaterial({ color: 0x222222 }));
      m.position.set(x, 0.16, 0);
      return m;
    };
    const lampL = mkLamp(-0.31), lampR = mkLamp(0.31);
    const spMat = (c) => new THREE.SpriteMaterial({ map: blobTex, color: c, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    const glowL = new THREE.Sprite(spMat(RED)), glowR = new THREE.Sprite(spMat(BLUE));
    glowL.position.set(-0.34, 0.2, 0); glowR.position.set(0.34, 0.2, 0);
    bar.add(base, lampL, lampR, glowL, glowR);
    car.model.body.add(bar);
    // name tag (wider than the standard one so the whole word fits)
    labelTex ||= copLabel();
    const tag = new THREE.Sprite(new THREE.SpriteMaterial({ map: labelTex, depthTest: false, transparent: true }));
    tag.scale.set(3.4, 0.85, 1);
    tag.position.y = 2.75;
    tag.renderOrder = 20;
    tag.onBeforeRender = (r, sc, cam) => { tag.material.opacity = clamp((cam.position.distanceTo(tag.getWorldPosition(_v)) - 7) / 9, 0, 1); };
    car.model.root.add(tag);
    // the strobes light up the road around the car
    const pool = new THREE.Mesh(new THREE.PlaneGeometry(11, 11).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({
      map: blobTex, color: 0x000000, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4,
    }));
    pool.position.y = 0.08;
    pool.renderOrder = 2;
    car.model.root.add(pool);
    this.lights.push({ car, bar, tag, lampL, lampR, glowL, glowR, pool, k, phase: i * 0.37 });
  }

  /** The human a patrol chases: the closest one along the track that is still free. */
  targetFor(cop) {
    let best = null, bd = Infinity;
    for (const h of this.race.humans) {
      if (h.chase.busted || h.chase.escaped) continue;
      const d = Math.abs(h.progress - cop.progress);
      if (d < bd) { bd = d; best = h; }
    }
    return best;
  }

  get left() { return Math.max(0, CHASE.TIME - this.race.raceTime); }

  update(dt) {
    this.time += dt;
    const race = this.race;
    // head start: patrols wait a moment after the green light, sirens already on
    if (race.phase === 'racing' && race.raceTime < CHASE.HEAD_START) for (const c of this.cops) c.controlEnabled = false;
    else if (race.phase === 'racing') for (const c of this.cops) c.controlEnabled = true;
    // strobes: double flash red, then double flash blue
    for (const L of this.lights) {
      const f = (this.time * 1.6 + L.phase) % 1;
      const r = (f < 0.12 || (f > 0.2 && f < 0.32)) ? 1 : 0;
      const b = (f > 0.5 && f < 0.62) || (f > 0.7 && f < 0.82) ? 1 : 0;
      const on = !L.car.eliminated;
      L.lampL.material.color.copy(RED).multiplyScalar(r ? 7 : 0.7);
      L.lampR.material.color.copy(BLUE).multiplyScalar(b ? 7 : 0.7);
      L.glowL.visible = on && !!r; L.glowR.visible = on && !!b;
      L.glowL.scale.setScalar(3.4); L.glowR.scale.setScalar(3.4);
      L.pool.visible = on && !L.car.airborne;
      L.pool.material.color.setRGB(0, 0, 0).add(_c1.copy(RED).multiplyScalar(r * 0.55 * L.k)).add(_c2.copy(BLUE).multiplyScalar(b * 0.7 * L.k));
    }
    if (race.phase !== 'racing') return;
    // wanted level
    const lvl = Math.min(3, 1 + Math.floor(race.raceTime / CHASE.LEVEL_EVERY));
    if (lvl > this.level) {
      this.level = lvl;
      for (const h of race.humans) if (!h.chase.busted) this.popup(h, `РОЗЫСК ${'★'.repeat(lvl)}`, '#ff4060', true);
      eventBus.emit('chase:level', { level: lvl });
    }
  }

  /** Called instead of the race rules: capture meter, busts, escape at the end of the timer. */
  rules(dt) {
    const race = this.race;
    if (race.phase === 'racing') {
      for (const h of race.humans) {
        const st = h.chase;
        if (st.busted) continue;
        st.dist += Math.max(0, h.speed) * dt;
        let near = Infinity, close = 0, minGap = Infinity;
        for (const c of this.cops) {
          const d = Math.hypot(c.x - h.x, c.z - h.z, (c.y - h.y) * 2);
          near = Math.min(near, d);
          if (d < CHASE.BUST_DIST && c.spinTime <= 0) close++;
          minGap = Math.min(minGap, Math.abs(h.progress - c.progress));
        }
        st.near = near;
        st.gap = minGap;
        const slow = h.speed < CHASE.BUST_SPEED;
        if (close && slow) st.heat += (dt / CHASE.BUST_TIME) * (1 + 0.4 * (close - 1));
        else st.heat -= dt * CHASE.COOL * (close ? 0.25 : 1);
        st.heat = clamp(st.heat, 0, 1);
        st.escapeCool -= dt;
        if (minGap > CHASE.ESCAPE_GAP && st.escapeCool <= 0 && race.raceTime > 8) {
          st.escapeCool = 15;
          this.popup(h, 'ОТОРВАЛСЯ!', '#7dffb0', true);
          h.nitro = Math.min(100, h.nitro + 15);
        }
        if (st.heat >= 1) this.bust(h);
      }
      const free = race.humans.filter((h) => !h.chase.busted);
      if (!free.length) race.endRace(2.6);
      else if (race.raceTime >= CHASE.TIME) {
        for (const h of free) {
          h.chase.escaped = true;
          h.finished = true;
          h.finishTime = CHASE.TIME;
          this.popup(h, 'УШЁЛ ОТ ПОГОНИ!', '#7dffb0', true);
          eventBus.emit(Events.CAR_FINISH, { car: h, place: 1 });
          race.drivers.set(h, new AIDriver(h, race.track, DIFFICULTY[0])); // autopilot for the victory lap
        }
        race.slowmo = 1.3;
        race.fireworks = 8;
        for (const c of this.cops) { c.controls.throttle = 0; }
        race.endRace(3.4);
      }
    }
    if (race.endTimer > 0) {
      race.endTimer -= dt;
      if (race.endTimer <= 0) race.finishRace();
    }
  }

  bust(h) {
    const st = h.chase;
    st.busted = true;
    st.heat = 1;
    st.at = this.race.raceTime;
    h.controlEnabled = false;
    h.nitroActive = false;
    Object.assign(h.controls, { throttle: 0, brake: 1, steer: 0, drift: false, nitro: false });
    this.popup(h, 'ПОЙМАН!', '#ff4060', true);
    eventBus.emit(Events.CAMERA_SHAKE, { x: h.x, z: h.z, amount: 0.8 });
    eventBus.emit('chase:busted', { car: h });
  }

  /** Results table for the chase: players first (escaped, then by time survived), patrols after. */
  results() {
    const race = this.race;
    const humans = race.humans.map((h) => ({
      name: h.name, human: true, player: h.player, color: h.color, car: h.type.name,
      time: h.chase.escaped ? CHASE.TIME : h.chase.at ?? race.raceTime, best: isFinite(h.bestLap) ? h.bestLap : null,
      eliminated: h.chase.busted, estimated: false, escaped: h.chase.escaped, busted: h.chase.busted,
      dist: Math.round(h.chase.dist), takedowns: h.chase.takedowns,
    }));
    humans.sort((a, b) => (b.escaped - a.escaped) || (b.time - a.time) || (b.dist - a.dist));
    const cops = this.cops.map((c) => ({
      name: c.name, human: false, color: c.color, car: 'Патрульный V8', time: null, best: null, eliminated: false, estimated: false, cop: true,
    }));
    const rows = [...humans, ...cops];
    rows.forEach((r, i) => { r.place = i + 1; });
    return { rows, mode: 'chase', gp: false, track: race.def.name, mirror: race.settings.mirror, record: null, chaseTime: CHASE.TIME };
  }

  hud(p) {
    const h = this.race.humans[p];
    if (!h) return null;
    const st = h.chase;
    return { left: this.left, level: this.level, heat: st.heat, busted: st.busted, escaped: st.escaped, near: st.near, dist: st.dist, takedowns: st.takedowns, started: this.race.phase !== 'countdown' };
  }

  /** Distance to the nearest patrol from a car (for the siren volume). */
  nearestTo(car) {
    let d = Infinity;
    for (const c of this.cops) d = Math.min(d, Math.hypot(c.x - car.x, c.z - car.z));
    return d;
  }

  dispose() {
    for (const u of this.unsub) u();
    for (const L of this.lights) {
      L.bar.traverse((o) => { if (o.isMesh) o.geometry.dispose(); if (o.isMesh || o.isSprite) o.material.dispose(); });
      L.tag?.material.dispose();
      L.pool.geometry.dispose();
      L.pool.material.dispose();
    }
    this.lights = [];
  }
}

const _c1 = new THREE.Color(), _c2 = new THREE.Color();
