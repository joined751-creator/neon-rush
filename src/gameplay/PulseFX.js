import * as THREE from 'three';
import { eventBus, Events } from '../core/EventBus.js';

/** Pooled world-space light shockwaves. Visual only; never changes car physics. */
export class PulseFX {
  constructor() {
    this.race = null; this.pulses = [];
    this.reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    eventBus.on(Events.CAR_BOOST, ({ car }) => this.spawn(car, 'boost'));
    eventBus.on(Events.CAR_OVERDRIVE, ({ car }) => this.spawn(car, 'overdrive'));
    eventBus.on(Events.CAR_LAND, ({ car, airTime }) => { if (airTime > 0.6) this.spawn(car, 'land'); });
  }
  attach(race) {
    this.detach(); this.race = race;
    if (this.reduced || race.demo) return;
    // Twelve reusable meshes; shared geometry, no new lights or render targets.
    this.geo = new THREE.RingGeometry(0.9, 1, 48).rotateX(-Math.PI / 2);
    this.pulses = Array.from({ length:12 }, () => {
      const mat = new THREE.MeshBasicMaterial({ color:0x8deeff, transparent:true, opacity:0, depthWrite:false, side:THREE.DoubleSide, blending:THREE.AdditiveBlending });
      const mesh = new THREE.Mesh(this.geo, mat); mesh.visible = false;
      race.scene.add(mesh);
      return { mesh, mat, age:1, life:0.7, size:1, car:null };
    });
  }
  spawn(car, kind) {
    if (!this.race || this.race.demo || this.race.phase !== 'racing' || !car.human || car.finished || car.eliminated || !this.race.humans.includes(car)) return;
    if (kind !== 'land' && car.airborne) return;
    if (this.pulses.some((p) => p.car === car && p.age < 0.15)) return;
    const p = this.pulses.find((p) => p.age >= p.life);
    if (!p) return;
    p.age = 0; p.life = kind === 'overdrive' ? 0.95 : 0.7;
    p.size = kind === 'land' ? 7 : kind === 'overdrive' ? 10 : 6;
    p.car = car;
    p.mesh.position.set(car.x, car.y + 0.12, car.z);
    p.mat.color.set(kind === 'land' ? 0xffb566 : kind === 'overdrive' ? 0xb18cff : 0x7ceeff);
    p.mesh.visible = true; p.mesh.scale.setScalar(1.4); p.mat.opacity = 0.65;
  }
  update(dt) {
    for (const p of this.pulses) {
      if (p.age >= p.life) continue;
      p.age = Math.min(p.life, p.age + dt);
      const t = p.age / p.life;
      p.mesh.scale.setScalar(1.4 + p.size * (1 - (1 - t) ** 2));
      p.mat.opacity = 0.65 * (1 - t) ** 2;
      p.mesh.visible = t < 1;
    }
  }
  detach() {
    for (const p of this.pulses) { this.race?.scene.remove(p.mesh); p.mat.dispose(); }
    this.geo?.dispose(); this.geo = null;
    this.pulses = []; this.race = null;
  }
}
