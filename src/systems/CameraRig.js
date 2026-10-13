import * as THREE from 'three';
import { CAMERA, GAME } from '../core/Constants.js';

const MODES = ['far', 'near', 'hood'];

/** Spring chase camera with speed FOV, shake and drift swing. */
export class CameraRig {
  constructor(aspect = 1) {
    this.camera = new THREE.PerspectiveCamera(GAME.FOV, aspect, GAME.NEAR, GAME.FAR);
    this.pos = new THREE.Vector3();
    this.look = new THREE.Vector3();
    this.shake = 0;
    this.mode = 0;
    this.yaw = 0;
    this.initialized = false;
    this._t = new THREE.Vector3();
    this._l = new THREE.Vector3();
  }

  cycle() { this.mode = (this.mode + 1) % MODES.length; }

  snap(car) { this.initialized = false; this.update(car, 1); }

  update(car, dt) {
    const mode = MODES[this.mode];
    // Camera follows a smoothed yaw that lags the car heading (shows drift angle)
    const target = car.heading;
    let d = target - this.yaw;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    if (!this.initialized) d = target - this.yaw;
    this.yaw += d * Math.min(1, dt * (car.drifting ? 3.2 : 6));
    if (!this.initialized) this.yaw = target;

    const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
    const speedK = Math.min(1, Math.abs(car.speed) / 60);
    let dist = mode === 'near' ? CAMERA.NEAR_DIST : CAMERA.DIST;
    let height = mode === 'near' ? CAMERA.NEAR_HEIGHT : CAMERA.HEIGHT;
    dist += speedK * 1.4 + (car.boosting ? 1 : 0);
    if (mode === 'hood') {
      const hx = Math.sin(car.heading), hz = Math.cos(car.heading);
      this._t.set(car.x + hx * 0.4, car.y + 1.25, car.z + hz * 0.4);
      this._l.set(car.x + hx * 20, car.y + 1.0, car.z + hz * 20);
      this.pos.copy(this._t);
      this.look.copy(this._l);
    } else {
      this._t.set(car.x - fx * dist, car.y + height, car.z - fz * dist);
      this._l.set(car.x + fx * CAMERA.LOOK_AHEAD, car.y + CAMERA.LOOK_HEIGHT, car.z + fz * CAMERA.LOOK_AHEAD);
      if (!this.initialized) { this.pos.copy(this._t); this.look.copy(this._l); }
      const kp = 1 - Math.exp(-CAMERA.POS_LERP * dt * 1.6);
      this.pos.x += (this._t.x - this.pos.x) * Math.min(1, kp * 1.6);
      this.pos.z += (this._t.z - this.pos.z) * Math.min(1, kp * 1.6);
      this.pos.y += (this._t.y - this.pos.y) * kp;
      const kl = 1 - Math.exp(-CAMERA.LOOK_LERP * dt);
      this.look.lerp(this._l, kl);
    }
    this.initialized = true;

    this.shake = Math.max(0, this.shake - dt * CAMERA.SHAKE_DECAY * Math.max(0.2, this.shake));
    const s = this.shake * 0.35;
    this.camera.position.set(
      this.pos.x + (Math.random() - 0.5) * s,
      this.pos.y + (Math.random() - 0.5) * s,
      this.pos.z + (Math.random() - 0.5) * s,
    );
    this.camera.lookAt(this.look);
    const fov = GAME.FOV + (GAME.FOV_BOOST - GAME.FOV) * (speedK * 0.55 + (car.boosting ? 0.45 : 0));
    this.camera.fov += (fov - this.camera.fov) * Math.min(1, dt * 4);
    this.camera.updateProjectionMatrix();
  }

  addShake(a) { this.shake = Math.min(1.5, this.shake + a); }
}
