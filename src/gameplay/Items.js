import * as THREE from 'three';
import { ITEMS, TRACK } from '../core/Constants.js';
import { eventBus, Events } from '../core/EventBus.js';
import { angleDiff } from '../level/Track.js';
import { radialTexture } from '../level/Textures.js';

const ITEM_IDS = ['rocket', 'oil', 'shield', 'emp', 'nitro'];
const WEIGHTS = {
  front: { rocket: 10, oil: 35, shield: 35, emp: 10, nitro: 10 },
  mid: { rocket: 30, oil: 20, shield: 15, emp: 15, nitro: 20 },
  back: { rocket: 35, oil: 5, shield: 10, emp: 20, nitro: 30 },
};

export class ItemSystem {
  constructor(scene, track, fx, enabled = true) {
    this.scene = scene;
    this.track = track;
    this.fx = fx;
    this.enabled = enabled;
    this.group = new THREE.Group();
    scene.add(this.group);
    this.boxes = [];
    this.rockets = [];
    this.oils = [];
    this.emps = [];
    this.time = 0;

    this.boxGeo = new THREE.IcosahedronGeometry(1.0, 0);
    this.coreGeo = new THREE.OctahedronGeometry(0.45, 0);
    this.boxMat = new THREE.MeshStandardMaterial({
      color: 0x111122, emissive: 0xff2bd6, emissiveIntensity: 1.4, metalness: 0.3, roughness: 0.2,
      transparent: true, opacity: 0.75, flatShading: true,
    });
    this.coreMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffffff).multiplyScalar(2) });
    this.rocketGeo = new THREE.CapsuleGeometry(0.22, 1.1, 4, 8).rotateX(Math.PI / 2);
    this.rocketMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff3355).multiplyScalar(2.5) });
    this.oilTex = radialTexture('rgba(255,255,255,1)', 'rgba(255,255,255,0)');
    this.oilGeo = new THREE.CircleGeometry(ITEMS.OIL_RADIUS, 24).rotateX(-Math.PI / 2);
    this.oilMat = new THREE.MeshBasicMaterial({ color: 0x8a2cff, map: this.oilTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
    this.oilCoreMat = new THREE.MeshBasicMaterial({ color: 0x050208, transparent: true, opacity: 0.9, depthWrite: false });
    this.empGeo = new THREE.TorusGeometry(1, 0.08, 6, 48).rotateX(Math.PI / 2);

    if (enabled) {
      for (const s of track.itemRows) {
        for (const lat of [-6.5, -2.2, 2.2, 6.5]) {
          const p = track.pointAt(s, lat);
          const mesh = new THREE.Mesh(this.boxGeo, this.boxMat);
          mesh.add(new THREE.Mesh(this.coreGeo, this.coreMat));
          mesh.position.set(p.x, p.y + 1.4, p.z);
          this.group.add(mesh);
          this.boxes.push({ x: p.x, y: p.y, z: p.z, mesh, respawn: 0, phase: Math.random() * 6 });
        }
      }
    }
  }

  roll(place, total) {
    const pf = total > 1 ? (place - 1) / (total - 1) : 0.5;
    const w = pf < 0.3 ? WEIGHTS.front : pf > 0.7 ? WEIGHTS.back : WEIGHTS.mid;
    let sum = 0;
    for (const id of ITEM_IDS) sum += w[id];
    let r = Math.random() * sum;
    for (const id of ITEM_IDS) { r -= w[id]; if (r <= 0) return id; }
    return 'nitro';
  }

  use(car, cars) {
    const id = car.item;
    if (!id) return;
    car.item = null;
    const fx = Math.sin(car.heading), fz = Math.cos(car.heading);
    if (id === 'rocket') {
      const target = cars.filter((c) => !c.eliminated && !c.finished && c.place === car.place - 1)[0] || null;
      const mesh = new THREE.Mesh(this.rocketGeo, this.rocketMat);
      this.group.add(mesh);
      this.rockets.push({
        x: car.x + fx * 3, y: car.y + 0.8, z: car.z + fz * 3, heading: car.heading,
        owner: car, target, life: ITEMS.ROCKET_LIFE, mesh, idx: car.trackIndex, s: car.s, age: 0,
      });
    } else if (id === 'oil') {
      const ox = car.x - fx * 5, oz = car.z - fz * 5;
      const q = this.track.closest(ox, oz, car.trackIndex);
      const mesh = new THREE.Group();
      const core = new THREE.Mesh(this.oilGeo, this.oilCoreMat);
      core.scale.setScalar(0.8);
      const rim = new THREE.Mesh(this.oilGeo, this.oilMat);
      rim.scale.setScalar(1.3);
      mesh.add(core, rim);
      mesh.position.set(ox, q.y + 0.07, oz);
      core.renderOrder = rim.renderOrder = 3;
      this.group.add(mesh);
      this.oils.push({ x: ox, z: oz, y: q.y, life: ITEMS.OIL_LIFE, mesh, hit: new Set() });
    } else if (id === 'shield') {
      car.shieldTime = ITEMS.SHIELD_TIME;
    } else if (id === 'emp') {
      const mesh = new THREE.Mesh(this.empGeo, new THREE.MeshBasicMaterial({ color: new THREE.Color(0x5af0ff).multiplyScalar(3), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
      mesh.position.set(car.x, car.y + 0.6, car.z);
      this.group.add(mesh);
      this.emps.push({ mesh, life: 0.6 });
      for (const c of cars) {
        if (c === car || c.eliminated) continue;
        if ((c.x - car.x) ** 2 + (c.z - car.z) ** 2 > ITEMS.EMP_RADIUS ** 2) continue;
        if (c.shieldTime > 0) { c.shieldTime = 0; eventBus.emit(Events.SHIELD_BLOCK, { car: c }); continue; }
        c.empTime = 2.6;
        c.drifting = false;
        eventBus.emit(Events.ITEM_HIT, { car: c, by: car, item: 'emp' });
        this.fx.sparks.burst(25, { x: c.x, y: c.y + 1, z: c.z, color: 0x5af0ff, size: 0.6, sizeEnd: 0.05, life: 0.5, gravity: 4 }, 12);
      }
    } else if (id === 'nitro') {
      car.nitro = 100;
      car.giveBoost(0.6);
    }
    eventBus.emit(Events.ITEM_USE, { car, item: id });
  }

  update(dt, cars, raceActive) {
    this.time += dt;
    const hue = (this.time * 0.15) % 1;
    this.boxMat.emissive.setHSL(hue, 1, 0.5);

    for (const b of this.boxes) {
      if (b.respawn > 0) {
        b.respawn -= dt;
        if (b.respawn <= 0) { b.mesh.visible = true; b.mesh.scale.setScalar(0.01); }
        continue;
      }
      const sc = b.mesh.scale.x;
      if (sc < 1) b.mesh.scale.setScalar(Math.min(1, sc + dt * 3));
      b.mesh.rotation.y += dt * 1.6;
      b.mesh.rotation.x += dt * 0.7;
      b.mesh.position.y = b.y + 1.4 + Math.sin(this.time * 2.5 + b.phase) * 0.25;
      if (!raceActive) continue;
      for (const c of cars) {
        if (c.eliminated || c.airborne && c.y - b.y > 3) continue;
        if ((c.x - b.x) ** 2 + (c.z - b.z) ** 2 < 2.9 ** 2) {
          b.respawn = TRACK.ITEM_RESPAWN;
          b.mesh.visible = false;
          this.fx.sparks.burst(30, { x: b.x, y: b.y + 1.4, z: b.z, color: this.boxMat.emissive.getHex(), size: 0.7, sizeEnd: 0.05, life: 0.6, gravity: 6 }, 14);
          if (!c.item && !c.itemLock) {
            c.itemLock = true;
            c.item = this.roll(c.place, cars.length);
            c.itemLock = false;
            eventBus.emit(Events.ITEM_PICKUP, { car: c, item: c.item });
          }
          break;
        }
      }
    }

    // Rockets
    for (let i = this.rockets.length - 1; i >= 0; i--) {
      const r = this.rockets[i];
      r.life -= dt; r.age += dt;
      const q = this.track.closest(r.x, r.z, r.idx);
      r.idx = q.index;
      let ax, az;
      const t = r.target;
      if (t && !t.eliminated && (t.x - r.x) ** 2 + (t.z - r.z) ** 2 < 70 ** 2) { ax = t.x; az = t.z; }
      else { const p = this.track.pointAt(q.s + 18, t ? t.lateral * 0.5 : 0); ax = p.x; az = p.z; }
      const desired = Math.atan2(ax - r.x, az - r.z);
      const d = angleDiff(desired, r.heading);
      r.heading += Math.max(-ITEMS.ROCKET_TURN * dt, Math.min(ITEMS.ROCKET_TURN * dt, d));
      r.x += Math.sin(r.heading) * ITEMS.ROCKET_SPEED * dt;
      r.z += Math.cos(r.heading) * ITEMS.ROCKET_SPEED * dt;
      r.y += (q.y + 0.8 - r.y) * Math.min(1, dt * 6);
      r.mesh.position.set(r.x, r.y, r.z);
      r.mesh.rotation.y = r.heading;
      this.fx.sparks.emit({ x: r.x, y: r.y, z: r.z, vx: (Math.random() - 0.5) * 2, vy: Math.random() * 2, vz: (Math.random() - 0.5) * 2, color: 0xff8040, size: 1.1, sizeEnd: 0.1, life: 0.35 });
      this.fx.smoke.emit({ x: r.x, y: r.y, z: r.z, color: 0x605070, size: 0.8, sizeEnd: 3, life: 0.8, alpha: 0.25, drag: 2 });
      let hit = null;
      for (const c of cars) {
        if (c.eliminated || (c === r.owner && r.age < 0.6)) continue;
        if ((c.x - r.x) ** 2 + (c.z - r.z) ** 2 < 2.4 ** 2 && Math.abs(c.y + 0.6 - r.y) < 2.5) { hit = c; break; }
      }
      const wall = Math.abs(q.lateral) > this.track.half + 0.4;
      if (hit || wall || r.life <= 0) {
        this.explode(r.x, r.y, r.z, 0xff5030);
        if (hit) {
          const spun = hit.spinOut('rocket');
          if (spun) eventBus.emit(Events.ITEM_HIT, { car: hit, by: r.owner, item: 'rocket' });
        }
        this.group.remove(r.mesh);
        this.rockets.splice(i, 1);
      }
    }

    // Oil
    for (let i = this.oils.length - 1; i >= 0; i--) {
      const o = this.oils[i];
      o.life -= dt;
      o.mesh.children[1].material.opacity = Math.min(1, o.life) * (0.6 + 0.4 * Math.sin(this.time * 4));
      for (const c of cars) {
        if (c.eliminated || c.airborne || o.hit.has(c)) continue;
        if ((c.x - o.x) ** 2 + (c.z - o.z) ** 2 < (ITEMS.OIL_RADIUS + 0.6) ** 2) {
          o.hit.add(c);
          if (c.spinOut('oil')) eventBus.emit(Events.ITEM_HIT, { car: c, item: 'oil' });
        }
      }
      if (o.life <= 0) { this.group.remove(o.mesh); this.oils.splice(i, 1); }
    }

    // EMP rings
    for (let i = this.emps.length - 1; i >= 0; i--) {
      const e = this.emps[i];
      e.life -= dt;
      const k = 1 - e.life / 0.6;
      e.mesh.scale.setScalar(2 + k * ITEMS.EMP_RADIUS);
      e.mesh.material.opacity = 1 - k;
      if (e.life <= 0) { this.group.remove(e.mesh); e.mesh.material.dispose(); this.emps.splice(i, 1); }
    }
  }

  explode(x, y, z, color) {
    this.fx.sparks.burst(60, { x, y, z, color, size: 1.3, sizeEnd: 0.1, life: 0.7, gravity: 6, drag: 1.5 }, 26);
    this.fx.sparks.burst(30, { x, y, z, color: 0xffffff, size: 0.8, sizeEnd: 0.05, life: 0.4, drag: 2 }, 30);
    this.fx.smoke.burst(14, { x, y, z, color: 0x403848, size: 3, sizeEnd: 9, life: 1.4, alpha: 0.35, drag: 2 }, 6);
    eventBus.emit(Events.CAMERA_SHAKE, { x, z, amount: 0.6 });
  }

  dispose() {
    this.scene.remove(this.group);
    for (const g of [this.boxGeo, this.coreGeo, this.rocketGeo, this.oilGeo, this.empGeo]) g.dispose();
    for (const m of [this.boxMat, this.coreMat, this.rocketMat, this.oilMat, this.oilCoreMat]) m.dispose();
    this.oilTex.dispose();
  }
}
