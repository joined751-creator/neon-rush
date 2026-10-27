import * as THREE from 'three';
import { eventBus, Events } from '../core/EventBus.js';

/*
 * v5.2 digital-world effects:
 *  - derez: a wrecked / knocked-out car bursts into glowing light cubes ("pixels") in its colour;
 *  - rez-in: at the start of a race every car materialises — it grows up out of a scan line, with a ring of cubes;
 *  - re-spawn: a column of rising cubes where a car is put back on the road.
 * All cubes are one InstancedMesh (one draw call), additive and fading.
 */
const MAX = 700;
const GRAV = 14;

export class VoxelFX {
  constructor(scene, cars, { rezIn = true } = {}) {
    this.scene = scene;
    this.cars = cars;
    this.geo = new THREE.BoxGeometry(1, 1, 1);
    this.mat = new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: true });
    this.mesh = new THREE.InstancedMesh(this.geo, this.mat, MAX);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAX * 3), 3).setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 6;
    this.mesh.count = 0;
    scene.add(this.mesh);
    this.p = []; // live particles
    this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._e = new THREE.Euler();
    this._v = new THREE.Vector3(); this._s = new THREE.Vector3(); this._c = new THREE.Color();
    this.unsub = [];
    const on = (e, fn) => this.unsub.push(eventBus.on(e, fn));
    on(Events.CAR_ELIMINATED, ({ car }) => this.derez(car, 1));
    on(Events.ITEM_HIT, ({ car }) => car && this.derez(car, 0.35));
    on(Events.CAR_SPINOUT, ({ car, source }) => { if (source !== 'drift' && source !== 'shield') this.derez(car, 0.18); });
    on(Events.CAR_CAR_HIT, ({ a, b, impact }) => { if (impact > 12) { this.spark(a, b); } });
    on('chase:busted', ({ car }) => this.derez(car, 0.6));
    // rez-in at the start
    this.rez = rezIn ? cars.map((car, i) => ({ car, t: -0.15 - i * 0.12, done: false })) : [];
    for (const r of this.rez) r.car.model.root.scale.y = 0.001;
    this.ghost = new Map(cars.map((c) => [c, c.ghostTime || 0]));
  }

  emit(x, y, z, vx, vy, vz, size, life, color, k = 1) {
    if (this.p.length >= MAX) this.p.shift();
    this.p.push({ x, y, z, vx, vy, vz, s: size, life, t: 0, c: new THREE.Color(color).multiplyScalar(k), rx: Math.random() * 6, ry: Math.random() * 6, spin: (Math.random() - 0.5) * 8, g: 1 });
  }

  /** Car breaks into light cubes; amt 1 = full derez, smaller = a chunk knocked off. */
  derez(car, amt = 1) {
    if (!car?.model) return;
    const d = car.model.dims;
    const n = Math.round(10 + 70 * amt);
    const col = car.color;
    for (let i = 0; i < n; i++) {
      const lx = (Math.random() - 0.5) * d.W, lz = (Math.random() - 0.5) * d.L, ly = 0.2 + Math.random() * 1.0;
      const fx = Math.sin(car.heading), fz = Math.cos(car.heading);
      const x = car.x + lx * fz + lz * fx, z = car.z - lx * fx + lz * fz, y = car.y + ly;
      const sp = 3 + Math.random() * 9 * (0.5 + amt);
      const a = Math.random() * Math.PI * 2;
      this.emit(x, y, z, Math.cos(a) * sp + car.vx * 0.4, 2 + Math.random() * 8 * (0.4 + amt), Math.sin(a) * sp + car.vz * 0.4,
        0.14 + Math.random() * 0.26, 0.8 + Math.random() * 1.1 * (0.5 + amt), i % 6 === 0 ? 0xffffff : col, i % 6 === 0 ? 0.7 : 1.1);
    }
  }

  spark(a, b) {
    const x = (a.x + b.x) / 2, y = (a.y + b.y) / 2 + 0.6, z = (a.z + b.z) / 2;
    for (let i = 0; i < 10; i++) {
      const s = Math.random() < 0.5 ? a : b;
      this.emit(x, y, z, (Math.random() - 0.5) * 10, 2 + Math.random() * 5, (Math.random() - 0.5) * 10, 0.1 + Math.random() * 0.12, 0.6 + Math.random() * 0.4, s.color, 1.1);
    }
  }

  column(car) {
    for (let i = 0; i < 26; i++) {
      const a = (i / 26) * Math.PI * 2, r = 1.6 + Math.random() * 0.6;
      const p = { x: car.x + Math.cos(a) * r, y: car.y + Math.random() * 0.4, z: car.z + Math.sin(a) * r };
      this.emit(p.x, p.y, p.z, -Math.cos(a) * 0.6, 3 + Math.random() * 4, -Math.sin(a) * 0.6, 0.12 + Math.random() * 0.1, 0.9 + Math.random() * 0.4, car.color, 1.1);
      this.p[this.p.length - 1].g = -0.15; // floats upward
    }
  }

  update(dt) {
    // rez-in: grow each car out of a scan line, ring of cubes at the line
    for (const r of this.rez) {
      if (r.done) continue;
      r.t += dt;
      const root = r.car.model.root;
      if (r.t < 0) { root.scale.y = 0.001; continue; }
      const k = Math.min(1, r.t / 0.7);
      const e = 1 - (1 - k) ** 3;
      root.scale.y = Math.max(0.001, e);
      if (Math.random() < 0.6) {
        const car = r.car, d = car.model.dims;
        const a = Math.random() * Math.PI * 2;
        this.emit(car.x + Math.cos(a) * d.W * 0.7, car.y + 1.3 * e, car.z + Math.sin(a) * d.L * 0.45, 0, 0.6, 0, 0.1 + Math.random() * 0.1, 0.5, car.color, 1.2);
        this.p[this.p.length - 1].g = 0;
      }
      if (k >= 1) { root.scale.y = 1; r.done = true; }
    }
    // re-spawn columns
    for (const car of this.cars) {
      const g = car.ghostTime || 0, prev = this.ghost.get(car) || 0;
      if (g > 1.5 && g > prev + 0.5 && !car.eliminated) this.column(car);
      this.ghost.set(car, g);
    }
    // particles
    const m = this._m, q = this._q, e = this._e, v = this._v, s = this._s;
    let n = 0;
    for (let i = this.p.length - 1; i >= 0; i--) {
      const p = this.p[i];
      p.t += dt;
      if (p.t >= p.life) { this.p.splice(i, 1); continue; }
      p.vy -= GRAV * p.g * dt;
      const drag = Math.exp(-1.6 * dt);
      p.vx *= drag; p.vz *= drag;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      p.rx += p.spin * dt; p.ry += p.spin * 0.7 * dt;
      const f = 1 - p.t / p.life;
      e.set(p.rx, p.ry, 0); q.setFromEuler(e);
      const sz = p.s * (0.35 + 0.65 * f);
      m.compose(v.set(p.x, p.y, p.z), q, s.set(sz, sz, sz));
      this.mesh.setMatrixAt(n, m);
      this._c.copy(p.c).multiplyScalar(f);
      this.mesh.setColorAt(n, this._c);
      n++;
    }
    this.mesh.count = n;
    this.mesh.visible = n > 0;
    if (n) { this.mesh.instanceMatrix.needsUpdate = true; this.mesh.instanceColor.needsUpdate = true; }
  }

  dispose() {
    for (const u of this.unsub) u();
    for (const r of this.rez) r.car.model.root.scale.y = 1;
    this.scene.remove(this.mesh);
    this.mesh.dispose();
    this.geo.dispose();
    this.mat.dispose();
  }
}
