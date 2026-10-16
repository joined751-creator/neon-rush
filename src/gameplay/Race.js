import * as THREE from 'three';
import { CAR, TRACK, THEMES, DIFFICULTY, AI_NAMES, CAR_TYPES, CAR_COLORS, ELIMINATION, PARTICLES } from '../core/Constants.js';
import { eventBus, Events } from '../core/EventBus.js';
import { TRACKS } from '../level/TrackDefs.js';
import { Track } from '../level/Track.js';
import { Environment, disposeTree } from '../level/Environment.js';
import { ParticleSystem } from '../systems/ParticleSystem.js';
import { SkidMarks } from '../systems/SkidMarks.js';
import { CameraRig } from '../systems/CameraRig.js';
import { Car } from './Car.js';
import { LightTrails } from './LightTrails.js';
import { AIDriver } from './AIDriver.js';
import { ItemSystem } from './Items.js';
import { buildCarModel, disposeCarModel } from './CarModel.js';

const GHOST_DT = 1 / 20;
const fmt = (t) => `${Math.floor(t / 60)}:${(t % 60).toFixed(2).padStart(5, '0')}`;

/**
 * One race session: track, environment, cars, AI, items, cameras, rules.
 * demo=true runs an endless AI race for the title screen.
 */
export class Race {
  constructor({ scene, render, settings, garage, gameState, input, demo = false, roster = null }) {
    this.scene = scene;
    this.render = render;
    this.settings = { ...settings };
    this.garage = garage;
    this.gs = gameState;
    this.input = input;
    this.demo = demo;
    this.gp = !demo && settings.mode === 'gp';
    this.mode = demo || this.gp ? 'race' : settings.mode;
    this.rosterIn = roster;
    this.roster = [];
    this.slowmo = 0;
    this.fireworks = 0;
    this.fireworkTimer = 0;
    this.fxStrength = [0, 0];
    this.time = 0;
    this.raceTime = 0;
    this.phase = demo ? 'racing' : 'countdown';
    this.countdown = 3.6;
    this.lastCount = 4;
    this.results = null;
    this.endTimer = -1;
    this.unsub = [];

    this.trackKey = `${this.settings.track}${this.settings.mirror ? 'm' : ''}`;
    const def = TRACKS[this.settings.track];
    this.def = def;
    this.theme = THEMES[def.theme];
    this.track = new Track(def, this.settings.mirror);
    this.env = new Environment(scene, render.renderer, this.theme, this.track);
    render.renderer.toneMappingExposure = this.theme.exposure;
    this.trackGroup = this.track.build(this.theme, this.env.envMap);
    scene.add(this.trackGroup);

    this.fx = {
      sparks: new ParticleSystem(scene, PARTICLES.ADDITIVE_MAX, { additive: true }),
      smoke: new ParticleSystem(scene, PARTICLES.SMOKE_MAX, { additive: false, soft: 1 }),
      skids: new SkidMarks(scene),
    };
    const itemsOn = this.settings.items && this.mode !== 'trial';
    this.items = new ItemSystem(scene, this.track, this.fx, itemsOn);

    this.laps = this.mode === 'elim' ? 999 : demo ? 999 : this.settings.laps;
    this.humans = [];
    this.cars = [];
    this.drivers = new Map();
    this.buildCars();

    // Cameras
    this.rigs = this.humans.map((h, i) => {
      const rig = new CameraRig();
      this.humans.forEach((o, j) => { if (j !== i) rig.camera.layers.enable(1 + j); });
      return rig;
    });
    this.demoCam = new CameraRig();
    this.demoTarget = 0;
    this.demoTimer = 0;
    this.demoStyle = 0;
    this.setupViews();
    this.humans.forEach((h, i) => this.introCamera(this.rigs[i], h));

    // Ghost (time trial)
    this.ghostKey = this.trackKey;
    this.ghostData = this.mode === 'trial' ? this.gs.ghosts[this.ghostKey] : null;
    this.ghostModel = null;
    if (this.ghostData) {
      this.ghostModel = buildCarModel(CAR_TYPES[this.ghostData.type ?? 0].id, 0x9ad8ff, { ghost: true, label: 'ПРИЗРАК' });
      this.ghostModel.root.visible = false;
      scene.add(this.ghostModel.root);
    }
    this.ghostRec = this.humans.map(() => ({ frames: [], t: 0 }));

    this.elimTimer = ELIMINATION.FIRST_DELAY;
    this.pairPrev = new Map();

    this.unsub.push(eventBus.on(Events.CAMERA_SHAKE, ({ x, z, amount = 0.5 }) => {
      this.humans.forEach((h, i) => {
        if (x === undefined || (h.x - x) ** 2 + (h.z - z) ** 2 < 60 * 60) this.rigs[i].addShake(amount);
      });
    }));
    this.unsub.push(eventBus.on(Events.CAR_WALL_HIT, ({ car, impact }) => {
      if (car.human) this.rigs[car.player]?.addShake(Math.min(0.8, impact * 0.04));
    }));
    this.unsub.push(eventBus.on(Events.CAR_SPINOUT, ({ car }) => {
      if (car.human) { this.rigs[car.player]?.addShake(0.6); this.popup(car.player, 'ЗАНОС!', '#ff4060'); }
    }));
    this.unsub.push(eventBus.on(Events.CAR_DRIFT_LEVEL, ({ car, level }) => {
      if (car.human) this.popup(car.player, ['', 'ДРИФТ', 'СУПЕР ДРИФТ', 'УЛЬТРА ДРИФТ'][level], ['', '#3ab8ff', '#ff9a1a', '#c04dff'][level], true);
    }));
    this.unsub.push(eventBus.on(Events.CAR_LAND, ({ car, airTime }) => {
      if (car.human && airTime > 0.45) this.popup(car.player, 'ПОЛЁТ! +НИТРО', '#7dffb0');
      if (car.human) this.rigs[car.player]?.addShake(0.25);
    }));
    this.unsub.push(eventBus.on(Events.CAR_LAP, ({ car, lap }) => {
      if (!car.human || this.demo || this.mode === 'elim') return;
      if (lap === this.laps && this.laps > 1) this.popup(car.player, 'ФИНАЛЬНЫЙ КРУГ', '#ff2bd6', true);
      else if (lap > 1 && lap <= this.laps) this.popup(car.player, `КРУГ ${lap}/${this.laps}`, '#ffffff');
      const t = car.lapTimes[car.lapTimes.length - 1];
      if (lap > 1 && t !== undefined && t <= car.bestLap) this.popup(car.player, `ЛУЧШИЙ КРУГ ${fmt(t)}`, '#7dffb0');
    }));
    this.unsub.push(eventBus.on(Events.SHIELD_BLOCK, ({ car }) => { if (car.human) this.popup(car.player, 'ЩИТ СПАС!', '#6fe8ff'); }));
    this.unsub.push(eventBus.on(Events.ITEM_HIT, ({ car, by, item }) => {
      if (by?.human && by !== car) this.popup(by.player, item === 'emp' ? 'ЭМИ ПОПАЛ!' : 'ПОПАДАНИЕ!', '#ffd400', true);
      if (car.human && item === 'emp') this.popup(car.player, 'ЭМИ-ПОМЕХИ', '#5af0ff');
    }));
  }

  buildCars() {
    const s = this.settings;
    const humanCount = this.demo ? 0 : s.players;
    const bots = this.demo ? 6 : this.mode === 'trial' ? 0 : s.bots;
    const total = humanCount + bots;
    const skill = DIFFICULTY[this.demo ? 1 : s.difficulty];
    const usedColors = new Set(this.demo ? [] : this.garage.slice(0, humanCount).map((g) => g.color));
    const freeColors = CAR_COLORS.map((_, i) => i).filter((i) => !usedColors.has(i));
    // Humans start at the back of the grid (more overtaking fun); in trial they're alone
    const slots = [];
    for (let k = 0; k < total; k++) slots.push(k);
    const humanSlots = this.mode === 'trial' ? [0, 1] : slots.slice(Math.max(0, total - humanCount - Math.floor(bots / 3)), total).slice(0, humanCount);
    let botIdx = 0;
    const names = [...AI_NAMES].sort(() => Math.random() - 0.5);
    for (let k = 0; k < total; k++) {
      const hIdx = humanSlots.indexOf(k);
      const human = hIdx >= 0;
      let car;
      if (human) {
        const g = this.garage[hIdx];
        car = new Car({
          id: k, name: humanCount > 1 ? `Игрок ${hIdx + 1}` : 'Ты', typeIndex: g.type, colorIndex: g.color,
          human: true, player: hIdx, track: this.track, scene: this.scene, fx: this.fx, label: humanCount > 1 ? `P${hIdx + 1}` : null,
        });
        this.humans[hIdx] = car;
      } else {
        const preset = this.rosterIn?.[botIdx];
        const colorIndex = preset ? preset.colorIndex : freeColors[botIdx % freeColors.length];
        const typeIndex = preset ? preset.typeIndex : (botIdx + (Math.random() * 4 | 0)) % CAR_TYPES.length;
        const name = preset ? preset.name : names[botIdx % names.length];
        this.roster.push({ name, typeIndex, colorIndex });
        car = new Car({
          id: k, name, typeIndex, colorIndex,
          human: false, track: this.track, scene: this.scene, fx: this.fx,
        });
        botIdx++;
        const d = new AIDriver(car, this.track, skill);
        this.drivers.set(car, d);
        car.topMult = skill.speedMult;
      }
      const row = Math.floor(k / 2), col = k % 2;
      const sGrid = this.track.length - (TRACK.GRID_FIRST_ROW + row * TRACK.GRID_ROW_GAP + col * 3);
      car.placeAt(sGrid, (col ? 1 : -1) * TRACK.GRID_COL_OFFSET);
      car.lap = 0;
      this.cars.push(car);
    }
    if (this.demo) this.cars.forEach((c) => { c.controlEnabled = true; c.lap = 1; c.lapMax = 1; });
    this.trails = new LightTrails(this.scene, this.cars);
  }

  setupViews() {
    const n = this.humans.length;
    if (n === 0) {
      this.render.setViews([{ camera: this.demoCam.camera, x: 0, y: 0, w: 1, h: 1 }]);
    } else if (n === 1) {
      this.render.setViews([{ camera: this.rigs[0].camera, x: 0, y: 0, w: 1, h: 1 }]);
    } else if (this.settings.split === 'horizontal') {
      this.render.setViews([
        { camera: this.rigs[0].camera, x: 0, y: 0.5, w: 1, h: 0.5 },
        { camera: this.rigs[1].camera, x: 0, y: 0, w: 1, h: 0.5 },
      ]);
    } else {
      this.render.setViews([
        { camera: this.rigs[0].camera, x: 0, y: 0, w: 0.5, h: 1 },
        { camera: this.rigs[1].camera, x: 0.5, y: 0, w: 0.5, h: 1 },
      ]);
    }
  }

  introCamera(rig, car) {
    rig.update(car, 1);
    const fx = Math.sin(car.heading), fz = Math.cos(car.heading);
    rig.pos.set(car.x + fx * 30 + fz * 12, car.y + 22, car.z + fz * 30 - fx * 12);
    rig.yaw = car.heading;
  }

  popup(player, text, color = '#fff', big = false) {
    eventBus.emit(Events.UI_POPUP, { player, text, color, big });
  }

  get raceActive() { return this.phase === 'racing'; }

  // ---------------------------------------------------------------- update
  update(dt) {
    if (this.slowmo > 0) { this.slowmo -= dt; dt *= 0.3; }
    this._dt = dt;
    this.time += dt;
    this.env.update(dt);
    if (this.track.padMaterial) this.track.padMaterial.map.offset.y -= dt * 1.6;

    if (this.phase === 'countdown') this.updateCountdown(dt);
    else if (this.phase === 'racing' || this.phase === 'finished') this.raceTime += dt;

    // Controls
    const leaderHuman = this.humans.length ? Math.max(...this.humans.map((h) => h.progress)) : null;
    for (const car of this.cars) {
      if (car.eliminated) continue;
      const d = this.drivers.get(car);
      if (d) d.update(dt, this.cars, leaderHuman);
      else if (car.human) this.readHuman(car);
    }

    // Physics (sub-stepped)
    const steps = dt > 1 / 50 ? 2 : 1;
    const h = dt / steps;
    for (let k = 0; k < steps; k++) {
      for (const car of this.cars) car.update(h, this.raceTime);
      this.collideCars();
    }

    // Item usage requests
    for (const car of this.cars) {
      if (car.controls.item && car.item && car.controlEnabled && car.spinTime <= 0) this.items.use(car, this.cars);
      car.controls.item = false;
    }
    this.items.update(dt, this.cars, this.raceActive || this.demo);
    this.checkPads();
    this.checkSlipstream(dt);
    this.updatePlaces();
    if (!this.demo) this.checkRules(dt);
    this.updateGhost(dt);

    // Visuals
    for (const car of this.cars) car.updateVisual(dt, this.time);
    this.trails?.update(dt);
    this.humans.forEach((hc, i) => {
      const rig = this.rigs[i];
      const target = hc.eliminated ? this.spectateTarget() : hc;
      if (target) rig.update(target, dt);
    });
    if (this.demo) this.updateDemoCamera(dt);
    const vh = this.render.viewportHeightPx();
    this.fx.sparks.setViewportHeight(vh);
    this.fx.smoke.setViewportHeight(vh);
    this.fx.sparks.update(dt);
    this.fx.smoke.update(dt);
    this.fx.skids.update();
    this.updateFireworks(dt);
    this.humans.forEach((hc, i) => {
      const target = (hc.nitroActive ? 1 : hc.boosting ? 0.7 : 0) * Math.min(1, Math.abs(hc.speed) / 40);
      this.fxStrength[i] += (target - this.fxStrength[i]) * Math.min(1, dt * 6);
    });
  }

  updateFireworks(dt) {
    if (this.fireworks <= 0) return;
    this.fireworks -= dt;
    this.fireworkTimer -= dt;
    if (this.fireworkTimer > 0) return;
    this.fireworkTimer = 0.18 + Math.random() * 0.3;
    const p = this.track.pointAt(Math.random() * 40 - 10, (Math.random() - 0.5) * 50);
    const hue = Math.random();
    const col = new THREE.Color().setHSL(hue, 1, 0.6).getHex();
    const y = p.y + 16 + Math.random() * 14;
    this.fx.sparks.burst(70, { x: p.x, y, z: p.z, color: col, size: 1.5, sizeEnd: 0.1, life: 1.4, gravity: 5, drag: 1.4 }, 34);
    this.fx.sparks.burst(20, { x: p.x, y, z: p.z, color: 0xffffff, size: 0.9, sizeEnd: 0.05, life: 0.6, gravity: 2, drag: 2 }, 20);
    eventBus.emit(Events.FIREWORK, { x: p.x, z: p.z });
  }

  readHuman(car) {
    const p = car.player;
    const st = this.input.state(p);
    const c = car.controls;
    if (car.finished) return;
    c.steer = st.steer; c.throttle = st.throttle; c.brake = st.brake; c.drift = st.drift; c.nitro = st.nitro;
    if (this.input.pressed(p, 'item')) c.item = true;
    if (this.input.pressed(p, 'camera')) this.rigs[p].cycle();
    if (this.input.pressed(p, 'respawn')) c.respawn = true;
    // launch revs on the grid: gas raises them, releasing lets them fall (shown on the speedometer)
    if (this.phase === 'countdown') {
      const r = car.launchRev || 0;
      car.launchRev = st.throttle > 0 ? Math.min(1, r + CAR.LAUNCH_RISE * this._dt) : Math.max(0, r - CAR.LAUNCH_FALL * this._dt);
    }
  }

  updateCountdown(dt) {
    this.countdown -= dt;
    const n = Math.ceil(this.countdown);
    if (n !== this.lastCount && n <= 3 && n >= 1) {
      this.lastCount = n;
      eventBus.emit(Events.RACE_COUNTDOWN, { n });
    }
    // perfect start window
    if (this.countdown <= 0) {
      this.phase = 'racing';
      this.raceTime = 0;
      eventBus.emit(Events.RACE_COUNTDOWN, { n: 0 });
      eventBus.emit(Events.RACE_GO, {});
      for (const car of this.cars) {
        car.controlEnabled = true;
        car.lapStart = 0;
        if (car.human) {
          const rev = car.launchRev || 0;
          car.launchResult = rev >= CAR.LAUNCH_RED ? 'hot' : rev >= CAR.LAUNCH_GREEN[0] ? 'perfect' : 'none';
          if (car.launchResult === 'perfect') {
            car.giveBoost(1.4);
            this.popup(car.player, 'ИДЕАЛЬНЫЙ СТАРТ!', '#7dffb0', true);
          } else if (car.launchResult === 'hot') {
            car.controlEnabled = false;
            setTimeout(() => { car.controlEnabled = true; }, 700);
            this.popup(car.player, 'ПЕРЕГРЕВ ДВИГАТЕЛЯ', '#ff4060');
          }
          car.launchRev = 0;
        } else if (Math.random() < 0.35) car.giveBoost(1.0);
      }
    }
  }

  collideCars() {
    const R = CAR.RADIUS;
    const cars = this.cars;
    for (let i = 0; i < cars.length; i++) {
      const a = cars[i];
      if (a.eliminated || a.ghostTime > 0) continue;
      for (let j = i + 1; j < cars.length; j++) {
        const b = cars[j];
        if (b.eliminated || b.ghostTime > 0) continue;
        const dx = b.x - a.x, dz = b.z - a.z;
        const d2 = dx * dx + dz * dz;
        if (d2 > 4 * R * R || Math.abs(a.y - b.y) > 2) continue;
        const d = Math.sqrt(d2) || 0.01;
        const nx = dx / d, nz = dz / d;
        const ma = a.type.weight * (a.shieldTime > 0 ? 3 : 1), mb = b.type.weight * (b.shieldTime > 0 ? 3 : 1);
        const overlap = 2 * R - d;
        a.x -= nx * overlap * (mb / (ma + mb)); a.z -= nz * overlap * (mb / (ma + mb));
        b.x += nx * overlap * (ma / (ma + mb)); b.z += nz * overlap * (ma / (ma + mb));
        const rel = (b.vx - a.vx) * nx + (b.vz - a.vz) * nz;
        if (rel < 0) {
          const jImp = (-(1 + CAR.CAR_BOUNCE) * rel) / (1 / ma + 1 / mb);
          a.vx -= (jImp / ma) * nx; a.vz -= (jImp / ma) * nz;
          b.vx += (jImp / mb) * nx; b.vz += (jImp / mb) * nz;
          if (-rel > 3) {
            eventBus.emit(Events.CAR_CAR_HIT, { a, b, impact: -rel });
            if (a.human) this.rigs[a.player]?.addShake(Math.min(0.5, -rel * 0.04));
            if (b.human) this.rigs[b.player]?.addShake(Math.min(0.5, -rel * 0.04));
            this.fx.sparks.burst(10, { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 + 0.6, z: (a.z + b.z) / 2, color: 0xffd080, size: 0.5, sizeEnd: 0.05, life: 0.4, gravity: 14 }, 10);
            if (a.shieldTime > 0 && b.shieldTime <= 0 && -rel > 6) b.spinOut('shield');
            if (b.shieldTime > 0 && a.shieldTime <= 0 && -rel > 6) a.spinOut('shield');
          }
        }
      }
    }
  }

  checkPads() {
    for (const car of this.cars) {
      if (car.eliminated || car.airborne) continue;
      car.padCooldown = Math.max(0, (car.padCooldown || 0) - 1 / 60);
      if (car.padCooldown > 0) continue;
      for (const pad of this.track.boostPads) {
        let ds = car.s - pad.s;
        if (Math.abs(ds) < TRACK.BOOST_PAD_LENGTH / 2 && Math.abs(car.lateral - pad.lateral) < TRACK.BOOST_PAD_WIDTH / 2 + 0.6) {
          car.giveBoost(CAR.PAD_BOOST_TIME);
          car.padCooldown = 0.6;
          if (car.human) this.popup(car.player, 'УСКОРИТЕЛЬ!', '#00f0ff');
        }
      }
    }
  }

  checkSlipstream(dt) {
    for (const car of this.cars) {
      if (car.eliminated) continue;
      const fx = Math.sin(car.heading), fz = Math.cos(car.heading);
      let behind = false;
      if (car.speed > 28 && !car.airborne) {
        for (const o of this.cars) {
          if (o === car || o.eliminated) continue;
          const rx = o.x - car.x, rz = o.z - car.z;
          const along = rx * fx + rz * fz;
          const lat = Math.abs(rx * -fz + rz * fx);
          if (along > 4 && along < CAR.SLIPSTREAM_DIST && lat < CAR.SLIPSTREAM_LATERAL) { behind = true; break; }
        }
      }
      car.slipTimer = behind ? car.slipTimer + dt : Math.max(0, car.slipTimer - dt * 2);
      const was = car.slipstream;
      car.slipstream = car.slipTimer > 0.6;
      if (car.slipstream) car.nitro = Math.min(100, car.nitro + CAR.NITRO_SLIPSTREAM_GAIN * dt);
      if (car.slipstream && !was && car.human) {
        this.popup(car.player, 'СЛИПСТРИМ', '#aaddff');
        eventBus.emit(Events.CAR_SLIPSTREAM, { car });
      }
    }
  }

  updatePlaces() {
    const active = this.cars.filter((c) => !c.eliminated);
    const finished = this.gs.finishedOrder;
    const sorted = [...active].sort((a, b) => {
      if (a.finished && b.finished) return a.finishTime - b.finishTime;
      if (a.finished) return -1;
      if (b.finished) return 1;
      return b.progress - a.progress;
    });
    sorted.forEach((c, i) => {
      const prev = c.place;
      c.place = i + 1;
      if (this.raceActive && c.human && c.place < prev && !c.finished) {
        eventBus.emit(Events.CAR_OVERTAKE, { car: c });
      }
    });
    // eliminated cars rank after active ones (by elimination order, last eliminated first)
    const elim = this.cars.filter((c) => c.eliminated).sort((a, b) => b.elimAt - a.elimAt);
    elim.forEach((c, i) => { c.place = sorted.length + i + 1; });
    this.order = [...sorted, ...elim];
    void finished;

    // Near-miss overtakes for humans
    if (!this.raceActive) return;
    for (const h of this.humans) {
      if (h.eliminated || h.finished) continue;
      for (const o of this.cars) {
        if (o === h || o.eliminated) continue;
        const key = h.id * 100 + o.id;
        const delta = h.progress - o.progress;
        const prev = this.pairPrev.get(key);
        this.pairPrev.set(key, delta);
        if (prev !== undefined && prev < 0 && delta >= 0 && Math.abs(delta) < 20) {
          const dist = Math.hypot(h.x - o.x, h.z - o.z);
          if (dist < 4.2 && h.speed > 25) {
            h.nitro = Math.min(100, h.nitro + CAR.NITRO_NEARMISS);
            this.popup(h.player, 'НА ВОЛОСОК! +НИТРО', '#ff7ae0');
            eventBus.emit(Events.CAR_NEARMISS, { car: h });
          }
        }
      }
    }
  }

  checkRules(dt) {
    if (this.phase !== 'racing' && this.phase !== 'finished') return;
    // Laps & finish
    for (const car of this.cars) {
      if (car.eliminated || car.finished) continue;
      if (car.lap > this.laps) {
        car.finished = true;
        car.finishTime = this.raceTime;
        this.gs.finishedOrder.push(car);
        eventBus.emit(Events.CAR_FINISH, { car, place: this.gs.finishedOrder.length });
        if (car.human) {
          this.slowmo = 1.3;
          if (this.gs.finishedOrder.length === 1) this.fireworks = 9;
          else this.fireworks = Math.max(this.fireworks, 3);
          // autopilot after finish
          this.drivers.set(car, new AIDriver(car, this.track, DIFFICULTY[0]));
          const pl = this.gs.finishedOrder.length;
          this.popup(car.player, pl === 1 ? 'ПОБЕДА!' : `ФИНИШ: ${pl} МЕСТО`, pl === 1 ? '#ffd400' : '#ffffff', true);
          this.saveRecords(car);
        }
      }
    }
    // Lap popups
    // Elimination mode
    if (this.mode === 'elim' && this.phase === 'racing') {
      this.elimTimer -= dt;
      const active = this.cars.filter((c) => !c.eliminated);
      if (this.elimTimer <= 0 && active.length > 1) {
        const last = this.order.filter((c) => !c.eliminated).pop();
        if (last) {
          last.elimAt = this.raceTime;
          last.eliminate();
          eventBus.emit(Events.CAR_ELIMINATED, { car: last });
          eventBus.emit(Events.CAMERA_SHAKE, { x: last.x, z: last.z, amount: 0.9 });
          for (const hc of this.humans) {
            if (hc === last) this.popup(hc.player, 'ТЫ ВЫБЫЛ', '#ff4060', true);
            else this.popup(hc.player, `${last.name} ВЫБЫЛ`, '#ff9a1a');
          }
        }
        this.elimTimer = ELIMINATION.INTERVAL;
      }
      const left = this.cars.filter((c) => !c.eliminated);
      if (left.length === 1 && !left[0].finished) {
        const w = left[0];
        w.finished = true;
        w.finishTime = this.raceTime;
        eventBus.emit(Events.CAR_FINISH, { car: w, place: 1 });
        if (w.human) this.popup(w.player, 'ПОСЛЕДНИЙ ВЫЖИВШИЙ!', '#ffd400', true);
        this.endRace(2.5);
      }
      if (this.humans.length && this.humans.every((hc) => hc.eliminated)) this.endRace(2.5);
    }
    // End when all humans finished
    if (this.phase === 'racing' && this.mode !== 'elim' && this.humans.length && this.humans.every((hc) => hc.finished)) {
      this.endRace(3.2);
    }
    if (this.endTimer > 0) {
      this.endTimer -= dt;
      if (this.endTimer <= 0) this.finishRace();
    }
  }

  endRace(delay) {
    if (this.phase === 'finished') return;
    this.phase = 'finished';
    this.endTimer = delay;
  }

  finishRace() {
    // Estimate times for unfinished cars
    const L = this.track.length;
    const rows = this.order.map((c) => {
      let time = c.finished ? c.finishTime : null;
      if (!time && !c.eliminated && this.mode !== 'elim') {
        const remaining = this.laps * L - c.progress;
        const avg = Math.max(20, c.progress / Math.max(1, this.raceTime));
        time = this.raceTime + remaining / avg;
      }
      return {
        name: c.name, human: c.human, player: c.player, color: c.color, car: c.type.name,
        time, best: isFinite(c.bestLap) ? c.bestLap : null, eliminated: c.eliminated, estimated: !c.finished,
      };
    });
    if (this.mode !== 'elim') rows.sort((a, b) => (a.time ?? 1e9) - (b.time ?? 1e9));
    rows.forEach((r, i) => { r.place = i + 1; });
    this.results = { rows, mode: this.mode, gp: this.gp, track: this.def.name, mirror: this.settings.mirror, record: this.newRecord || null };
    eventBus.emit(Events.RACE_FINISHED, this.results);
  }

  saveRecords(car) {
    const key = this.trackKey;
    const rec = this.gs.records[key] || {};
    let newRecord = null;
    if (isFinite(car.bestLap) && (!rec.bestLap || car.bestLap < rec.bestLap)) { rec.bestLap = car.bestLap; newRecord = 'lap'; }
    if (this.mode !== 'elim' && (!rec.bestRace || (car.finishTime < rec.bestRace && rec.laps === this.laps))) {
      rec.bestRace = car.finishTime; rec.laps = this.laps; newRecord = newRecord || 'race';
    }
    this.gs.records[key] = rec;
    this.gs.saveRecords();
    if (newRecord) this.newRecord = newRecord;
  }

  /** Test/QA helper: let the AI drive a human car. */
  setAutopilot(p, on = true) {
    const car = this.humans[p];
    if (!car) return;
    if (on) this.drivers.set(car, new AIDriver(car, this.track, DIFFICULTY[2]));
    else { this.drivers.delete(car); car.accelMult = 1; }
  }

  // ---------------------------------------------------------------- ghost
  updateGhost(dt) {
    if (this.mode !== 'trial') return;
    this.humans.forEach((hc, i) => {
      const rec = this.ghostRec[i];
      if (!this.raceActive || hc.finished) return;
      if (hc.lap !== rec.lap) {
        // lap completed → compare & store
        if (rec.lap >= 1 && hc.lapTimes.length && rec.frames.length > 10) {
          const t = hc.lapTimes[hc.lapTimes.length - 1];
          const cur = this.gs.ghosts[this.ghostKey];
          if (!cur || t < cur.time) {
            this.gs.saveGhost(this.ghostKey, { time: t, type: hc.typeIndex, frames: rec.frames });
            this.ghostData = this.gs.ghosts[this.ghostKey];
            this.popup(hc.player, 'НОВЫЙ ПРИЗРАК!', '#9ad8ff', true);
            if (!this.ghostModel) {
              this.ghostModel = buildCarModel(CAR_TYPES[hc.typeIndex].id, 0x9ad8ff, { ghost: true, label: 'ПРИЗРАК' });
              this.scene.add(this.ghostModel.root);
            }
          }
        }
        rec.lap = hc.lap; rec.frames = []; rec.t = 0; rec.acc = 0;
      }
      if (hc.lap >= 1) {
        rec.t += dt; rec.acc = (rec.acc || 0) + dt;
        while (rec.acc >= GHOST_DT) {
          rec.acc -= GHOST_DT;
          rec.frames.push(+hc.x.toFixed(2), +hc.y.toFixed(2), +hc.z.toFixed(2), +hc.heading.toFixed(3), +hc.s.toFixed(1));
        }
      }
    });
    // Playback relative to P1's current lap
    const p1 = this.humans[0];
    if (this.ghostModel && this.ghostData && p1 && p1.lap >= 1 && this.raceActive) {
      const t = this.raceTime - p1.lapStart;
      const fr = this.ghostData.frames;
      const n = fr.length / 5;
      const f = t / GHOST_DT;
      const i = Math.floor(f);
      if (i < n - 1) {
        const a = i * 5, b = (i + 1) * 5, k = f - i;
        const g = this.ghostModel.root;
        g.visible = true;
        g.position.set(fr[a] + (fr[b] - fr[a]) * k, fr[a + 1] + (fr[b + 1] - fr[a + 1]) * k, fr[a + 2] + (fr[b + 2] - fr[a + 2]) * k);
        g.rotation.y = fr[a + 3];
      } else this.ghostModel.root.visible = false;
      // delta: when did the ghost reach P1's current s?
      let lo = 0, hi = n - 1;
      const s = p1.s;
      while (lo < hi) { const mid = (lo + hi) >> 1; if (fr[mid * 5 + 4] < s) lo = mid + 1; else hi = mid; }
      this.ghostDelta = lo > 2 && lo < n - 1 ? t - lo * GHOST_DT : null;
    } else this.ghostDelta = null;
  }

  // ---------------------------------------------------------------- cameras
  spectateTarget() {
    return this.order?.find((c) => !c.eliminated) || this.cars[0];
  }

  updateDemoCamera(dt) {
    this.demoTimer -= dt;
    if (this.demoTimer <= 0) {
      this.demoTimer = 6;
      this.demoTarget = (this.demoTarget + 1 + Math.floor(Math.random() * 3)) % this.cars.length;
      this.demoStyle = (this.demoStyle + 1) % 3;
      this.demoAngle = Math.random() * Math.PI * 2;
    }
    const car = this.cars[this.demoTarget];
    const cam = this.demoCam.camera;
    const t = this.time;
    this.demoAngle = (this.demoAngle || 0) + dt * 0.35;
    if (this.demoStyle === 0) {
      cam.position.set(car.x + Math.cos(this.demoAngle) * 9, car.y + 2.2, car.z + Math.sin(this.demoAngle) * 9);
      cam.lookAt(car.x, car.y + 0.8, car.z);
      cam.fov = 55;
    } else if (this.demoStyle === 1) {
      const fx = Math.sin(car.heading), fz = Math.cos(car.heading);
      cam.position.set(car.x + fz * 5 + fx * 3, car.y + 0.8, car.z - fx * 5 + fz * 3);
      cam.lookAt(car.x - fx * 2, car.y + 0.7, car.z - fz * 2);
      cam.fov = 60;
    } else {
      cam.position.set(car.x - Math.sin(car.heading) * 26, car.y + 18 + Math.sin(t * 0.3) * 2, car.z - Math.cos(car.heading) * 26);
      cam.lookAt(car.x, car.y, car.z);
      cam.fov = 50;
    }
    cam.updateProjectionMatrix();
  }

  // ---------------------------------------------------------------- HUD data
  hud(p) {
    const car = this.humans[p];
    if (!car) return null;
    const active = this.cars.filter((c) => !c.eliminated).length;
    return {
      place: car.place, total: this.mode === 'elim' ? active : this.cars.length,
      lap: Math.max(1, Math.min(car.lap, this.laps)), laps: this.laps,
      kmh: Math.round(car.kmh), speedFrac: Math.min(1.2, Math.abs(car.speed) / car.topSpeed),
      nitro: car.nitro, nitroActive: car.nitroActive, item: car.item, boosting: car.boosting,
      driftLevel: car.driftLevel, driftTime: car.drifting ? car.driftTime : 0, drifting: car.drifting,
      raceTime: this.raceTime, lapTime: car.lap >= 1 ? this.raceTime - car.lapStart : 0,
      bestLap: isFinite(car.bestLap) ? car.bestLap : null,
      record: this.gs.records[this.trackKey]?.bestLap ?? null,
      wrongWay: car.wrongWay, eliminated: car.eliminated, finished: car.finished,
      elimTimer: this.mode === 'elim' && this.phase === 'racing' ? this.elimTimer : null,
      danger: this.mode === 'elim' && car.place === active && active > 1,
      ghostDelta: p === 0 ? this.ghostDelta : null,
      mode: this.mode, phase: this.phase, countdown: this.countdown, launchRev: car.launchRev || 0,
      slipstream: car.slipstream, empTime: car.empTime, shield: car.shieldTime,
      color: car.color, name: car.name,
    };
  }

  minimap() {
    return this.cars.map((c) => ({ x: c.x, z: c.z, color: c.color, human: c.human, player: c.player, elim: c.eliminated }));
  }

  dispose() {
    for (const u of this.unsub) u();
    for (const c of this.cars) c.dispose();
    if (this.ghostModel) { this.scene.remove(this.ghostModel.root); disposeCarModel(this.ghostModel); }
    this.items.dispose();
    this.trails?.dispose();
    this.fx.sparks.dispose();
    this.fx.smoke.dispose();
    this.fx.skids.dispose();
    this.scene.remove(this.trackGroup);
    disposeTree(this.trackGroup);
    this.env.dispose();
  }
}
