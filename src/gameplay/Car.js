import * as THREE from 'three';
import { CAR, CAR_TYPES, CAR_COLORS, ITEMS } from '../core/Constants.js';
import { eventBus, Events } from '../core/EventBus.js';
import { buildCarModel, disposeCarModel } from './CarModel.js';
import { angleDiff } from '../level/Track.js';

const DRIFT_COLORS = [0x8080a0, 0x3ab8ff, 0xff9a1a, 0xc04dff];
const _v = new THREE.Vector3();

export class Car {
  constructor({ id, name, typeIndex, colorIndex, human = false, player = -1, track, scene, fx, label = null }) {
    this.id = id;
    this.name = name;
    this.type = CAR_TYPES[typeIndex];
    this.typeIndex = typeIndex;
    this.color = CAR_COLORS[colorIndex].hex;
    this.human = human;
    this.player = player;
    this.track = track;
    this.scene = scene;
    this.fx = fx; // { sparks, smoke, skids }
    this.model = buildCarModel(this.type.id, this.color, { label, tagLayer: label && player >= 0 ? 1 + player : 0 });
    scene.add(this.model.root);

    this.controls = { throttle: 0, brake: 0, steer: 0, drift: false, nitro: false, item: false, respawn: false };
    this.topMult = 1;
    this.reset();
  }

  reset() {
    this.x = 0; this.y = 0; this.z = 0; this.vy = 0;
    this.heading = 0; this.vx = 0; this.vz = 0;
    this.speed = 0; this.lateralSpeed = 0;
    this.drifting = false; this.driftDir = 0; this.driftTime = 0; this.driftLevel = 0;
    this.boostTime = 0; this.nitro = CAR.NITRO_START; this.nitroActive = false; this.overdrive = 0; this.prevNitroBtn = false;
    this.item = null; this.itemLock = false;
    this.shieldTime = 0; this.spinTime = 0; this.spinDir = 1; this.empTime = 0; this.ghostTime = 0;
    this.airborne = false; this.airTime = 0;
    this.lap = 0; this.lapMax = 0; this.s = 0; this.prevS = 0; this.trackIndex = -1; this.progress = 0;
    this.finished = false; this.finishTime = 0; this.lapTimes = []; this.lapStart = 0; this.bestLap = Infinity;
    this.eliminated = false; this.place = 1;
    this.stuckTimer = 0; this.wrongWayTimer = 0; this.wrongWay = false;
    this.slipTimer = 0; this.slipstream = false; this.slipNotified = false;
    this.visDrift = 0; this.visRoll = 0; this.visPitch = 0; this.steerVis = 0; this.hop = 0; this.wheelSpin = 0;
    this.lastWheel = null;
    this.controlEnabled = false;
    this.lateral = 0;
    this.pitchTarget = 0;
  }

  placeAt(s, lateral) {
    const p = this.track.pointAt(s, lateral);
    this.x = p.x; this.z = p.z; this.y = p.y; this.heading = p.heading;
    this.vx = this.vz = 0; this.speed = 0;
    const q = this.track.closest(this.x, this.z, -1);
    this.trackIndex = q.index;
    this.s = this.prevS = q.s;
    this.lastWheel = null;
    this.updateVisual(0);
  }

  get topSpeed() { return (CAR.BASE_TOP_SPEED + CAR.TOP_SPEED_RANGE * this.type.speed) * this.topMult; }
  get kmh() { return Math.abs(this.speed) * 3.6; }

  respawn() {
    const q = this.track.closest(this.x, this.z, this.trackIndex);
    const p = this.track.pointAt(q.s, 0);
    this.x = p.x; this.z = p.z; this.y = p.y + 1; this.vy = 0; this.airborne = true;
    this.heading = p.heading; this.vx = this.vz = 0; this.speed = 0;
    this.spinTime = 0; this.drifting = false; this.ghostTime = 2; this.stuckTimer = 0; this.wrongWayTimer = 0;
    this.lastWheel = null;
  }

  spinOut(source = 'item') {
    if (this.shieldTime > 0) {
      this.shieldTime = 0;
      eventBus.emit(Events.SHIELD_BLOCK, { car: this });
      return false;
    }
    if (this.spinTime > 0 || this.ghostTime > 0) return false;
    this.spinTime = CAR.SPINOUT_TIME;
    this.spinDir = Math.random() < 0.5 ? -1 : 1;
    this.drifting = false; this.driftTime = 0; this.driftLevel = 0;
    this.boostTime = 0;
    eventBus.emit(Events.CAR_SPINOUT, { car: this, source });
    return true;
  }

  giveBoost(t) {
    this.boostTime = Math.max(this.boostTime, t);
    eventBus.emit(Events.CAR_BOOST, { car: this, time: t });
  }

  update(dt, raceTime) {
    if (this.eliminated) return;
    const c = this.controls;
    const top = this.topSpeed;
    const accel = (CAR.BASE_ACCEL + CAR.ACCEL_RANGE * this.type.accel) * (this.accelMult || 1);
    const handling = 0.75 + this.type.handling * 0.5;

    this.boostTime = Math.max(0, this.boostTime - dt);
    this.backfire = Math.max(0, (this.backfire || 0) - dt);
    this.bfCool = Math.max(0, (this.bfCool || 0) - dt);
    if (this.prevThrottle > 0 && c.throttle === 0 && this.speed > 30 && this.controlEnabled && this.bfCool <= 0 && Math.random() < (this.human ? 0.6 : 0.15)) {
      this.backfire = 0.14;
      this.bfCool = 1.2;
      eventBus.emit(Events.CAR_BACKFIRE, { car: this });
    }
    this.prevThrottle = c.throttle;
    this.shieldTime = Math.max(0, this.shieldTime - dt);
    this.spinTime = Math.max(0, this.spinTime - dt);
    this.empTime = Math.max(0, this.empTime - dt);
    this.ghostTime = Math.max(0, this.ghostTime - dt);

    let throttle = c.throttle, brake = c.brake, steer = c.steer;
    const can = this.controlEnabled && this.spinTime <= 0;
    if (!can) { throttle = 0; brake = 0; steer = 0; }
    const holding = !this.controlEnabled && !this.finished; // parked on the grid / stalled

    // Overdrive: a full nitro tank fired at once (players only) — a few seconds of ultra speed that rams rivals aside
    this.overdrive = Math.max(0, (this.overdrive || 0) - dt);
    if (can && this.human && c.nitro && !this.prevNitroBtn && this.nitro >= CAR.OVERDRIVE_FULL && this.overdrive <= 0) {
      this.overdrive = CAR.OVERDRIVE_TIME;
      this.nitro = 0;
      eventBus.emit(Events.CAR_OVERDRIVE, { car: this });
    }
    this.prevNitroBtn = c.nitro;
    const od = this.overdrive > 0;
    // Nitro
    this.nitroActive = !od && can && c.nitro && this.nitro > 0.5;
    if (this.nitroActive) this.nitro = Math.max(0, this.nitro - CAR.NITRO_DRAIN * dt);
    const boosting = this.boostTime > 0 || this.nitroActive || od;
    this.boosting = boosting;

    let topEff = top * (od ? CAR.OVERDRIVE_TOP_MULT : boosting ? CAR.BOOST_TOP_MULT : 1) * (this.empTime > 0 ? ITEMS.EMP_SLOW + 0.3 : 1) * (this.slipstream ? 1.06 : 1);

    const h0 = this.heading;
    const fx = Math.sin(h0), fz = Math.cos(h0);
    const rx = -fz, rz = fx;
    let vF = this.vx * fx + this.vz * fz;
    let vR = this.vx * rx + this.vz * rz;
    let yawRate = 0;

    if (!this.airborne) {
      if (throttle > 0 && vF < topEff) vF += accel * throttle * dt * Math.max(0.18, 1 - (vF / topEff) ** 2);
      if (boosting && vF < topEff) vF += CAR.BOOST_ACCEL * (od ? 1.6 : 1) * dt;
      if (this.slipstream && vF < topEff) vF += CAR.SLIPSTREAM_ACCEL * dt;
      if (brake > 0) {
        if (vF > 0.5) vF -= CAR.BRAKE * brake * dt;
        else if (vF > -CAR.REVERSE_MAX) vF -= CAR.REVERSE_ACCEL * brake * dt;
      }
      if (vF > topEff) vF -= (vF - topEff) * 1.6 * dt;
      if (throttle === 0 && brake === 0) vF -= Math.sign(vF) * Math.min(Math.abs(vF), CAR.ROLLING * dt);
      if (this.empTime > 0) vF *= Math.exp(-0.8 * dt);
      if (holding) vF *= Math.exp(-6 * dt);

      // Drift state machine (power slide): the tail steps out and momentum carries the car wide, so the slide
      // has to be started early; the stick steers it — full lock tightens, counter-steer widens.
      if (can && c.drift && !this.drifting && Math.abs(steer) > CAR.DRIFT_MIN_STEER && vF > CAR.DRIFT_MIN_SPEED) {
        this.drifting = true; this.driftDir = Math.sign(steer); this.driftTime = 0; this.driftLevel = 0; this.hop = 0.18;
        this.counterTime = 0;
      }
      if (this.drifting) {
        // holding hard counter-steer for a moment straightens the car out of the slide
        this.counterTime = this.driftDir * steer < -0.6 ? this.counterTime + dt : 0;
        if (!c.drift || vF < CAR.DRIFT_MIN_SPEED * 0.55 || !can || this.counterTime > CAR.DRIFT_EXIT_TIME) this.endDrift(can);
      }

      const speedFactor = Math.min(1, Math.abs(vF) / 9) * (1 - 0.28 * Math.min(1, Math.abs(vF) / top));
      if (this.drifting) {
        const tight = this.driftDir * steer; // -1..1
        const amount = CAR.DRIFT_YAW_BIAS + CAR.DRIFT_YAW_GAIN * tight; // -0.4..1: the stick steers the slide
        yawRate = this.driftDir * CAR.TURN_RATE * CAR.DRIFT_TURN * handling * amount * speedFactor;
        vF -= vF * (CAR.DRIFT_DRAG + CAR.DRIFT_ANGLE_DRAG * Math.max(0, tight)) * dt;
        // the slide builds only on the throttle: lifting off lets the drift die down
        this.driftTime += dt * (0.75 + 0.5 * Math.max(0, tight)) * (0.3 + 0.7 * throttle);
        const lvl = CAR.DRIFT_LEVELS.filter((t) => this.driftTime >= t).length;
        if (lvl > this.driftLevel) {
          this.driftLevel = lvl;
          eventBus.emit(Events.CAR_DRIFT_LEVEL, { car: this, level: lvl });
        }
        this.nitro = Math.min(100, this.nitro + CAR.NITRO_DRIFT_GAIN * dt);
      } else {
        yawRate = steer * CAR.TURN_RATE * handling * speedFactor * Math.sign(vF || 1);
      }

      let grip = this.drifting ? CAR.DRIFT_GRIP : CAR.GRIP * (0.75 + 0.45 * this.type.handling);
      if (this.spinTime > 0) grip = 0.9;
      vR *= Math.exp(-grip * dt);
      if (this.drifting && this.human) [vF, vR, yawRate] = this.driftAssist(vF, vR, yawRate, fx, fz, rx, rz, dt);
    } else {
      // Arcade air control: the car (and its flight path) gently line up with the road below,
      // so ramps on curving sections don't throw everyone into the wall.
      this.airTime += dt;
      const qa = this.track.closest(this.x, this.z, this.trackIndex);
      const roadH = Math.abs(angleDiff(this.heading, qa.heading)) < Math.PI / 2 ? qa.heading : qa.heading + Math.PI;
      yawRate = steer * CAR.AIR_STEER - angleDiff(roadH, this.heading) * CAR.AIR_ALIGN;
      vR *= Math.exp(-CAR.AIR_GRIP * dt);
    }
    if (this.spinTime > 0) {
      yawRate = -this.spinDir * 10 * (this.spinTime / CAR.SPINOUT_TIME + 0.2);
      vF *= Math.exp(-CAR.SPIN_DECEL * dt);
    }

    this.vx = fx * vF + rx * vR;
    this.vz = fz * vF + rz * vR;
    this.speed = vF;
    this.lateralSpeed = vR;
    this.heading = h0 - yawRate * dt;
    this.steerVis += (steer - this.steerVis) * Math.min(1, dt * 10);

    this.x += this.vx * dt;
    this.z += this.vz * dt;

    // Track & walls
    const q = this.track.closest(this.x, this.z, this.trackIndex);
    this.trackIndex = q.index;
    this.lateral = q.lateral;
    const limit = this.track.half + 0.6 - 1.05;
    if (Math.abs(q.lateral) > limit) {
      const side = Math.sign(q.lateral);
      const pen = Math.abs(q.lateral) - limit;
      this.x -= q.rx * side * pen;
      this.z -= q.rz * side * pen;
      const vn = (this.vx * q.rx + this.vz * q.rz) * side;
      if (vn > 0) {
        this.vx -= q.rx * side * vn * (1 + CAR.WALL_BOUNCE);
        this.vz -= q.rz * side * vn * (1 + CAR.WALL_BOUNCE);
        const loss = Math.max(0.55, 1 - vn * 0.018);
        this.vx *= loss; this.vz *= loss;
        if (vn > 3.5) {
          eventBus.emit(Events.CAR_WALL_HIT, { car: this, impact: vn, x: this.x - q.rx * side * -1.0, y: this.y + 0.6, z: this.z });
          // align to wall direction
          const trackH = Math.abs(angleDiff(this.heading, q.heading)) < Math.PI / 2 ? q.heading : q.heading + Math.PI;
          this.heading += angleDiff(trackH, this.heading) * Math.min(0.5, vn * 0.03);
        }
        if (this.drifting && vn > CAR.DRIFT_WALL_BREAK) { this.drifting = false; this.driftTime = 0; this.driftLevel = 0; }
      }
      this.scraping = true;
    } else this.scraping = false;

    // Height / ramps
    const groundY = q.y + this.track.rampHeight(q.s);
    if (this.airborne) {
      this.vy -= CAR.GRAVITY * dt;
      this.y += this.vy * dt;
      if (this.y <= groundY) {
        this.y = groundY;
        const airT = this.airTime;
        this.airborne = false; this.airTime = 0;
        eventBus.emit(Events.CAR_LAND, { car: this, airTime: airT, impact: -this.vy });
        if (airT > 0.45 && this.controlEnabled) {
          this.giveBoost(0.6);
          this.nitro = Math.min(100, this.nitro + CAR.NITRO_JUMP);
        }
        this.vy = 0;
      }
    } else {
      const ramp = this.track.rampLaunch(this.prevS, q.s);
      if (ramp && this.speed > 12) {
        this.airborne = true;
        this.airTime = 0;
        this.vy = Math.min(CAR.JUMP_VY_MAX, this.speed * this.track.rampSlope + 3.5);
        eventBus.emit(Events.CAR_JUMP, { car: this });
      } else {
        this.y += (groundY - this.y) * Math.min(1, dt * 30);
      }
    }

    // Laps
    const L = this.track.length;
    const sNew = q.s;
    if (this.prevS > L * 0.75 && sNew < L * 0.25) {
      this.lap++;
      if (this.lap > this.lapMax) {
        this.lapMax = this.lap;
        if (this.lap >= 2) {
          const t = raceTime - this.lapStart;
          this.lapTimes.push(t);
          this.bestLap = Math.min(this.bestLap, t);
        }
        this.lapStart = raceTime;
        eventBus.emit(Events.CAR_LAP, { car: this, lap: this.lap, time: raceTime });
      }
    } else if (this.prevS < L * 0.25 && sNew > L * 0.75) {
      this.lap--;
    }
    this.prevS = sNew;
    this.s = sNew;
    this.progress = (this.lap - 1) * L + sNew;

    // Pitch from slope
    const along = fx * q.tx + fz * q.tz;
    const slope = Math.asin(Math.max(-1, Math.min(1, q.ty))) * along;
    this.pitchTarget = this.airborne ? Math.max(-0.35, Math.min(0.35, -this.vy * 0.03)) : -slope;

    // Wrong way / stuck
    if (this.controlEnabled && !this.finished) {
      const dot = fx * q.tx + fz * q.tz;
      if (dot < -0.35 && Math.abs(vF) > 4) this.wrongWayTimer += dt; else this.wrongWayTimer = Math.max(0, this.wrongWayTimer - dt * 2);
      this.wrongWay = this.wrongWayTimer > CAR.WRONG_WAY_TIME;
      if (Math.abs(vF) < 2 && (throttle > 0 || brake > 0)) this.stuckTimer += dt; else this.stuckTimer = 0;
      if (this.stuckTimer > CAR.STUCK_TIME) this.respawn();
      if (c.respawn && can) { c.respawn = false; this.respawn(); }
    } else { this.wrongWay = false; }

    this.wheelSpin += (vF / this.model.dims.r) * dt;
  }

  /**
   * Player drift assist: close to a wall the slide is pulled back onto the road and the nose is turned
   * away from the barrier, so a drift that is held a bit too long ends on the kerb, not in the fence.
   */
  driftAssist(vF, vR, yawRate, fx, fz, rx, rz, dt) {
    const q = this.track.closest(this.x, this.z, this.trackIndex);
    const side = Math.sign(q.lateral) || 1;
    const edge = this.track.half - 0.45 - Math.abs(q.lateral);
    const k = 1 - edge / CAR.DRIFT_WALL_ASSIST;
    if (k <= 0) return [vF, vR, yawRate];
    const w = Math.min(1, k);
    // velocity towards the wall (track right axis × side)
    const vx = fx * vF + rx * vR, vz = fz * vF + rz * vR;
    const vn = (vx * q.rx + vz * q.rz) * side;
    if (vn > 0) {
      const cut = vn * Math.min(1, w * 10 * dt);
      const nvx = vx - q.rx * side * cut, nvz = vz - q.rz * side * cut;
      vF = nvx * fx + nvz * fz;
      vR = nvx * rx + nvz * rz;
    }
    // nose pointing into the wall → ease the yaw that keeps turning it there and steer it back
    // (heading -= yawRate·dt, so a positive yawRate swings the nose towards the track's right)
    const into = (fx * q.rx + fz * q.rz) * side * Math.sign(vF || 1);
    if (into > 0.05) {
      if (yawRate * side > 0) yawRate *= 1 - w * 0.6;
      yawRate -= side * w * 0.9 * Math.min(1, into * 3);
    }
    return [vF, vR, yawRate];
  }

  endDrift(award) {
    if (award && this.driftLevel > 0) {
      this.giveBoost(CAR.DRIFT_BOOST_TIME[this.driftLevel - 1]);
    }
    this.drifting = false;
    this.driftTime = 0;
    this.driftLevel = 0;
  }

  /** Sync meshes + emit visual effects. */
  updateVisual(dt, time = 0) {
    const m = this.model;
    m.root.visible = !this.eliminated;
    if (this.eliminated) return;
    m.root.position.set(this.x, this.y, this.z);
    this.visPitch += (this.pitchTarget - this.visPitch) * Math.min(1, dt * 8);
    m.root.rotation.order = 'YXZ';
    m.root.rotation.set(this.visPitch, this.heading, 0);

    // body angle follows the real sideways slip: a deep slide looks deep, a shallow one shallow
    const targetDrift = this.drifting ? this.driftDir * CAR.DRIFT_VISUAL_ANGLE * (0.65 + 0.6 * Math.min(1, Math.abs(this.lateralSpeed) / 7)) : 0;
    this.visDrift += (targetDrift - this.visDrift) * Math.min(1, dt * 7);
    const rollTarget = -this.steerVis * Math.min(1, Math.abs(this.speed) / 40) * 0.06 - (this.drifting ? this.driftDir * 0.05 : 0);
    this.visRoll += (rollTarget - this.visRoll) * Math.min(1, dt * 6);
    this.hop = Math.max(0, this.hop - dt);
    m.body.rotation.set(0, -this.visDrift, this.visRoll);
    m.body.position.y = Math.sin((this.hop / 0.18) * Math.PI) * 0.25 * (this.hop > 0 ? 1 : 0);

    for (const w of m.wheels) {
      w.spin.rotation.x = this.wheelSpin;
      if (w.front) w.pivot.rotation.y = -this.steerVis * 0.42 + this.visDrift * 0.8;
    }
    // ghost blink after respawn
    if (this.ghostTime > 0) m.root.visible = Math.floor(time * 12) % 2 === 0;

    const boost = this.boosting;
    const pop = this.backfire > 0;
    for (const f of m.flames) {
      f.visible = boost || pop;
      if (boost) f.scale.set(1, 1, 1.2 + Math.random() * 1.4);
      else if (pop) f.scale.set(1.6, 1.6, 0.5 + Math.random() * 0.6);
    }
    m.flameMat.color.setHex(this.nitroActive ? 0xff5ad8 : boost ? 0x6fd8ff : 0xff8a20).multiplyScalar(3);
    m.tailMat.color.setRGB(1, 0.015, 0.06).multiplyScalar(this.controls.brake > 0 || !this.controlEnabled ? 3.2 : 1.1);
    m.glow.material.opacity = 0.65 + Math.sin(time * 6 + this.id) * 0.12 + (boost ? 0.3 : 0);
    m.shield.visible = this.shieldTime > 0;
    if (m.shield.visible) m.shieldMat.uniforms.uTime.value = time;
    if (m.shadow) m.shadow.position.y = 0.04 - (this.airborne ? 0 : 0);

    if (dt <= 0) return;
    // ---- FX emission ----
    const fx = Math.sin(this.heading), fz = Math.cos(this.heading);
    const rx = -fz, rz = fx;
    const rear = m.dims.rear + 0.3;
    const halfW = m.dims.W / 2 - 0.1;
    const slip = Math.abs(this.lateralSpeed);
    const wheelsDown = !this.airborne;
    const sliding = wheelsDown && (this.drifting || slip > 5 || this.spinTime > 0);
    const lw = { x: this.x + fx * rear - rx * halfW, z: this.z + fz * rear - rz * halfW };
    const rw = { x: this.x + fx * rear + rx * halfW, z: this.z + fz * rear + rz * halfW };
    if (sliding && this.fx) {
      const col = this.drifting ? DRIFT_COLORS[this.driftLevel] : this.color;
      if (this.lastWheel) {
        this.fx.skids.add(this.lastWheel.lx, this.y, this.lastWheel.lz, lw.x, this.y, lw.z, this.drifting ? col : 0x303040, this.drifting && this.driftLevel ? 0.28 : 0.12);
        this.fx.skids.add(this.lastWheel.rx, this.y, this.lastWheel.rz, rw.x, this.y, rw.z, this.drifting ? col : 0x303040, this.drifting && this.driftLevel ? 0.28 : 0.12);
      }
      this.lastWheel = { lx: lw.x, lz: lw.z, rx: rw.x, rz: rw.z };
      if (Math.random() < 0.7) {
        for (const w of [lw, rw]) {
          this.fx.smoke.emit({
            x: w.x, y: this.y + 0.3, z: w.z, vx: this.vx * 0.15 + (Math.random() - 0.5) * 2, vy: 1 + Math.random(), vz: this.vz * 0.15 + (Math.random() - 0.5) * 2,
            color: 0x9a90b0, size: 1.6, sizeEnd: 5, life: 0.9, alpha: 0.18, drag: 1.5,
          });
        }
      }
      if (this.drifting && this.driftLevel > 0) {
        for (const w of [lw, rw]) {
          this.fx.sparks.emit({
            x: w.x, y: this.y + 0.15, z: w.z,
            // carried along with the car (world-still sparks left a dotted line of blobs on the road)
            vx: this.vx * 0.85 - fx * 4 + (Math.random() - 0.5) * 6, vy: 2 + Math.random() * 3, vz: this.vz * 0.85 - fz * 4 + (Math.random() - 0.5) * 6,
            color: DRIFT_COLORS[this.driftLevel], size: 0.38, sizeEnd: 0.04, life: 0.22, gravity: 14, drag: 0,
          });
        }
      }
    } else this.lastWheel = null;

    if (boost && this.fx) {
      const col = this.nitroActive ? 0xff4ad0 : 0x4ad8ff;
      for (const side of [-1, 1]) {
        _v.set(this.x + fx * (m.dims.rear - 0.5) + rx * side * 0.42, this.y + 0.42, this.z + fz * (m.dims.rear - 0.5) + rz * side * 0.42);
        // tight exhaust sparks that stay at the pipes (big slow puffs used to hang between car and camera as blobs)
        this.fx.sparks.emit({
          x: _v.x, y: _v.y, z: _v.z, vx: this.vx * 0.93 - fx * 3, vy: Math.random() * 0.6, vz: this.vz * 0.93 - fz * 3,
          color: col, size: 0.5, sizeEnd: 0.05, life: 0.14, drag: 0,
        });
      }
    }
    if (this.scraping && Math.abs(this.speed) > 8 && this.fx) {
      const side = Math.sign(this.lateral);
      for (let k = 0; k < 3; k++) {
        this.fx.sparks.emit({
          x: this.x + rx * side * 1.0, y: this.y + 0.4, z: this.z + rz * side * 1.0,
          vx: this.vx * 0.8 + (Math.random() - 0.5) * 8, vy: 3 + Math.random() * 5, vz: this.vz * 0.8 + (Math.random() - 0.5) * 8,
          color: 0xffc040, size: 0.35, sizeEnd: 0.04, life: 0.3, gravity: 18, drag: 0.5,
        });
      }
    }
    if (this.slipstream && this.fx && Math.random() < 0.6) {
      // wind streaks start ahead of the car and die before they reach the chase camera (no blobs on the lens)
      const sx = (Math.random() - 0.5) * 3, ahead = 1 + Math.random() * 3;
      this.fx.sparks.emit({
        x: this.x + fx * ahead + rx * sx, y: this.y + 0.5 + Math.random() * 1.2, z: this.z + fz * ahead + rz * sx,
        vx: this.vx * 0.55, vy: 0, vz: this.vz * 0.55, color: 0xaaddff, size: 0.22, sizeEnd: 0.05, life: 0.16, drag: 0,
      });
    }
  }

  /** Elimination explosion. */
  eliminate() {
    this.eliminated = true;
    this.controlEnabled = false;
    if (this.fx) {
      this.fx.sparks.burst(140, { x: this.x, y: this.y + 1, z: this.z, color: this.color, size: 1.4, sizeEnd: 0.1, life: 1.1, gravity: 8, drag: 1 }, 30);
      this.fx.sparks.burst(80, { x: this.x, y: this.y + 1, z: this.z, color: 0xffffff, size: 0.8, sizeEnd: 0.1, life: 0.7, gravity: 0, drag: 2 }, 40);
      this.fx.smoke.burst(30, { x: this.x, y: this.y + 1, z: this.z, color: 0x302838, size: 4, sizeEnd: 12, life: 2, alpha: 0.5, drag: 2 }, 8);
    }
    this.model.root.visible = false;
  }

  dispose() {
    this.scene.remove(this.model.root);
    disposeCarModel(this.model);
  }
}
