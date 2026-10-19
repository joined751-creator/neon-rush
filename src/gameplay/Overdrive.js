import * as THREE from 'three';
import { CAR, GAME } from '../core/Constants.js';
import { eventBus, Events } from '../core/EventBus.js';

/*
 * OVERDRIVE — the "wow" moment: fill the nitro tank to 100% and fire it in one go.
 * For a few seconds the car turns into a neon comet: rainbow energy trail, electric sparks, wide FOV warp,
 * rivals that get touched spin away. Plus a cinematic orbit camera when a player crosses the finish line.
 */

const N = 26; // trail points
const _dir = new THREE.Vector3();
const FW_COLORS = [0xff2bd6, 0x00e5ff, 0xffd400, 0x39ff88, 0x8a5cff, 0xff6a3d];
const VERT = /* glsl */`
  attribute float aK;
  attribute float aA;
  varying float vK;
  varying float vA;
  void main() { vK = aK; vA = aA; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`;
const FRAG = /* glsl */`
  uniform float uTime;
  varying float vK;
  varying float vA;
  vec3 hue(float h) { return clamp(abs(mod(h * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0); }
  void main() {
    vec3 c = hue(fract(vK * 0.9 - uTime * 0.8));
    float core = 1.0 - vK;
    gl_FragColor = vec4(mix(c, vec3(1.0), 0.25 * core) * 2.2, vA * core * core);
  }
`;

const CSS = `
.phud.overdrive .vignette { opacity: 1 !important; box-shadow: inset 0 0 50px 6px rgba(255,43,214,0.28), inset 0 0 24px 2px rgba(0,229,255,0.3); animation: odPulse 0.5s ease-in-out infinite alternate; }
.phud.overdrive .speedlines { opacity: 1 !important; filter: hue-rotate(0deg) saturate(1.6); animation: odHue 0.8s linear infinite; }
@keyframes odPulse { from { filter: hue-rotate(0deg); } to { filter: hue-rotate(60deg); } }
@keyframes odHue { to { filter: hue-rotate(360deg) saturate(1.6); } }
.nitro-m.od-ready .nv { color: var(--gold); animation: odBlink 0.6s steps(2) infinite; }
.nitro-m.od-ready .mb i { background: linear-gradient(90deg, #ff2bd6, #ffd400, #00e5ff) !important; }
@keyframes odBlink { 50% { opacity: 0.4; } }
.tbtn.c-nitro.od-ready { box-shadow: 0 0 0 3px #ffd400, 0 0 26px 6px rgba(255,212,0,0.55); animation: odBtn 0.9s ease-in-out infinite; }
.tbtn.c-nitro.od-ready span::after { content: 'ОВЕРДРАЙВ'; display: block; font-size: 9px; letter-spacing: 0.08em; color: #ffd400; margin-top: 2px; }
@keyframes odBtn { 50% { box-shadow: 0 0 0 3px #ff2bd6, 0 0 34px 10px rgba(255,43,214,0.6); } }
.tbtn.c-nitro.od-on { background: radial-gradient(circle, #ffd400, #ff2bd6) !important; color: #1a0624; }
`;

export class OverdriveFX {
  constructor() {
    const st = document.createElement('style');
    st.id = 'overdrive-style';
    st.textContent = CSS;
    document.head.appendChild(st);
    this.items = [];
    this.race = null;
    this.time = 0;
    this.cine = null;
    this.tipShown = false;
    eventBus.on(Events.CAR_OVERDRIVE, ({ car }) => this.onStart(car));
    eventBus.on(Events.CAR_CAR_HIT, ({ a, b }) => this.ram(a, b) || this.ram(b, a));
    eventBus.on(Events.CAR_FINISH, ({ car, place }) => {
      if (!car.human || !this.race || !this.race.cars.includes(car)) return;
      // neon fireworks over the track for a podium finish (more for a win)
      if (place <= 3 && !this.race.demo) this.fw = { car, t: 0, next: 0.15, left: place === 1 ? 16 : 9, rockets: [] };
      if (this.race.humans.length !== 1) return;
      this.cine = { car, t: 0, a0: car.heading + Math.PI * 0.55 };
    });
  }

  /** Bind to a new race (also called for the title-screen demo race). */
  attach(race) {
    this.detach();
    this.race = race;
    this.cine = null;
    this.fw = null;
    this.items = race.humans.map((car) => this.makeTrail(race.scene, car));
    if (race.humans.length && !this.tipShown) {
      this.tipShown = true;
      setTimeout(() => {
        if (this.race === race) eventBus.emit(Events.UI_POPUP, { player: 0, text: 'Новое: накопи нитро до 100% и жми — ОВЕРДРАЙВ!', color: '#ffd400' });
      }, 5200);
    }
  }

  detach() {
    for (const it of this.items) { it.mesh.parent?.remove(it.mesh); it.geo.dispose(); it.mat.dispose(); }
    this.items = [];
    document.querySelectorAll('.phud.overdrive').forEach((e) => e.classList.remove('overdrive'));
  }

  makeTrail(scene, car) {
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(2 * N * 2 * 3);
    const k = new Float32Array(2 * N * 2);
    const a = new Float32Array(2 * N * 2);
    const idx = [];
    for (let t = 0; t < 2; t++) {
      for (let i = 0; i < N; i++) { k[(t * N + i) * 2] = k[(t * N + i) * 2 + 1] = i / (N - 1); }
      for (let i = 0; i < N - 1; i++) { const b = (t * N + i) * 2; idx.push(b, b + 1, b + 2, b + 1, b + 3, b + 2); }
    }
    geo.setIndex(idx);
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aK', new THREE.BufferAttribute(k, 1));
    geo.setAttribute('aA', new THREE.BufferAttribute(a, 1).setUsage(THREE.DynamicDrawUsage));
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);
    const mat = new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: FRAG, uniforms: { uTime: { value: 0 } },
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.frustumCulled = false;
    mesh.renderOrder = 5;
    mesh.visible = false;
    scene.add(mesh);
    return { car, geo, mat, mesh, pos, a, hist: [[], []], acc: 0, level: 0, fov: 0, glowBase: null };
  }

  onStart(car) {
    if (!this.race || !this.race.cars.includes(car)) return;
    eventBus.emit(Events.UI_POPUP, { player: car.player, text: 'ОВЕРДРАЙВ!', color: '#ffd400', big: true });
    eventBus.emit(Events.ITEM_USE, { car, item: 'emp' }); // electric whoosh
    eventBus.emit(Events.CAR_BOOST, { car, time: CAR.OVERDRIVE_TIME });
    this.race.rigs[car.player]?.addShake(0.7);
    this.race.fx.sparks.burst(90, { x: car.x, y: car.y + 0.8, z: car.z, color: 0xffd400, size: 1.1, sizeEnd: 0.05, life: 0.7, gravity: 3, drag: 1.4 }, 22);
    this.race.fx.sparks.burst(60, { x: car.x, y: car.y + 0.8, z: car.z, color: 0xff2bd6, size: 0.9, sizeEnd: 0.05, life: 0.6, gravity: 3, drag: 1.6 }, 18);
  }

  /** An overdriving car knocks whatever it touches into a spin. */
  ram(a, b) {
    if (!(a.overdrive > 0) || b.overdrive > 0 || !this.race?.cars.includes(a)) return false;
    if (b.spinOut('overdrive')) {
      const dx = b.x - a.x, dz = b.z - a.z, d = Math.hypot(dx, dz) || 1;
      b.vx += (dx / d) * 9; b.vz += (dz / d) * 9;
      eventBus.emit(Events.ITEM_HIT, { car: b, by: a, item: 'ram' });
      this.race.fx.sparks.burst(40, { x: b.x, y: b.y + 0.8, z: b.z, color: 0x00e5ff, size: 0.9, sizeEnd: 0.05, life: 0.5, gravity: 8 }, 16);
    }
    return true;
  }

  update(dt) {
    const race = this.race;
    if (!race) return;
    this.time += dt;
    const panes = document.querySelectorAll('.phud');
    const nitroBtns = document.querySelectorAll('.c-nitro');
    for (const it of this.items) {
      const car = it.car;
      const on = car.overdrive > 0;
      it.level += ((on ? 1 : 0) - it.level) * Math.min(1, dt * (on ? 8 : 2.5));
      const p = car.player;
      panes[p]?.classList.toggle('overdrive', on);
      const ready = !on && !car.finished && car.nitro >= CAR.OVERDRIVE_FULL && race.phase === 'racing';
      nitroBtns[p]?.classList.toggle('od-ready', ready);
      nitroBtns[p]?.classList.toggle('od-on', on);
      const meter = panes[p]?.querySelector('.nitro-m');
      if (meter) {
        meter.classList.toggle('od-ready', ready);
        if (ready) { const nv = meter.querySelector('.nv'); if (nv && nv.textContent !== 'ОВЕРДРАЙВ') nv.textContent = 'ОВЕРДРАЙВ'; }
      }
      // underglow turns into a rainbow aura
      const glow = car.model.glow;
      if (glow) {
        if (!it.glowBase) it.glowBase = { s: glow.scale.clone(), c: glow.material.color.clone() };
        const s = 1 + it.level * 0.35;
        glow.scale.set(it.glowBase.s.x * s, it.glowBase.s.y * s, 1);
        if (it.level > 0.01) glow.material.color.setHSL((this.time * 0.9) % 1, 1, 0.5).multiplyScalar(0.6 + it.level * 0.6);
        else if (car.rainbowGlow) glow.material.color.setHSL((this.time * 0.3) % 1, 1, 0.5).multiplyScalar(0.7);
        else glow.material.color.copy(it.glowBase.c);
      }
      // warp FOV + speed FX
      const rig = race.rigs[p];
      if (rig && it.level > 0.01) {
        // absolute floor (the chase rig keeps easing toward its own target every frame)
        rig.camera.fov = Math.max(rig.camera.fov, GAME.FOV_BOOST + 12 * it.level);
        rig.camera.updateProjectionMatrix();
        race.fxStrength[p] = Math.max(race.fxStrength[p], 1.2 * it.level);
        if (on) rig.addShake(dt * 0.6);
      }
      // electric sparks
      if (on && Math.random() < 0.9) {
        const ang = Math.random() * Math.PI * 2;
        race.fx.sparks.emit({
          x: car.x + Math.cos(ang) * 1.3, y: car.y + 0.4 + Math.random() * 1.1, z: car.z + Math.sin(ang) * 1.3,
          vx: car.vx * 0.7 + (Math.random() - 0.5) * 6, vy: Math.random() * 3, vz: car.vz * 0.7 + (Math.random() - 0.5) * 6,
          color: Math.random() < 0.5 ? 0x00e5ff : 0xff2bd6, size: 0.6, sizeEnd: 0.05, life: 0.3, drag: 2,
        });
      }
      this.updateTrail(it, dt);
    }
    this.updateCinematic(dt);
    this.updateFireworks(dt);
  }

  updateFireworks(dt) {
    const fw = this.fw;
    if (!fw) return;
    const sparks = this.race.fx.sparks;
    fw.t += dt;
    fw.next -= dt;
    if (fw.left > 0 && fw.next <= 0) {
      fw.left--;
      fw.next = 0.22 + Math.random() * 0.3;
      // in front of that player's camera, where the (still rolling) car will be when the shell bursts
      const c = fw.car, cam = this.race.rigs[c.player]?.camera, fuse = 0.8 + Math.random() * 0.25;
      if (cam) cam.getWorldDirection(_dir); else _dir.set(Math.sin(c.heading), 0, Math.cos(c.heading));
      const dl = Math.hypot(_dir.x, _dir.z) || 1, dx = _dir.x / dl, dz = _dir.z / dl;
      const d = 45 + Math.random() * 30, side = (Math.random() - 0.5) * 2 * (6 + d * 0.25);
      fw.rockets.push({
        x: c.x + c.vx * fuse + dx * d - dz * side, y: c.y + 1, z: c.z + c.vz * fuse + dz * d + dx * side,
        vy: 11.5 + Math.random() * 2.5, age: 0, fuse,
        col: FW_COLORS[(Math.random() * FW_COLORS.length) | 0],
      });
    }
    for (let i = fw.rockets.length - 1; i >= 0; i--) {
      const r = fw.rockets[i];
      r.age += dt;
      r.vy -= 9 * dt;
      r.y += r.vy * dt;
      sparks.emit({ x: r.x, y: r.y, z: r.z, vx: (Math.random() - 0.5), vy: -2, vz: (Math.random() - 0.5), color: 0xffd9a0, size: 0.45, sizeEnd: 0.05, life: 0.35, drag: 1 });
      if (r.age >= r.fuse) {
        sparks.burst(90, { x: r.x, y: r.y, z: r.z, color: r.col, size: 3, sizeEnd: 0.1, life: 1.3, gravity: 4, drag: 1.3 }, 30);
        sparks.burst(24, { x: r.x, y: r.y, z: r.z, color: 0xffffff, size: 0.9, sizeEnd: 0.05, life: 0.5, gravity: 2, drag: 2 }, 22);
        fw.rockets.splice(i, 1);
      }
    }
    if (fw.left <= 0 && !fw.rockets.length) this.fw = null;
  }

  updateTrail(it, dt) {
    const car = it.car;
    it.mesh.visible = it.level > 0.02 && car.model.root.visible;
    if (!it.mesh.visible) { it.hist[0].length = it.hist[1].length = 0; return; }
    it.mat.uniforms.uTime.value = this.time;
    const fx = Math.sin(car.heading), fz = Math.cos(car.heading), rx = -fz, rz = fx;
    const rear = car.model.dims.rear - 0.1, half = car.model.dims.W / 2 - 0.15;
    it.acc += dt;
    const push = it.acc > 1 / 60;
    if (push) it.acc = 0;
    for (let t = 0; t < 2; t++) {
      const side = t ? 1 : -1;
      const x = car.x + fx * rear + rx * side * half, z = car.z + fz * rear + rz * side * half, y = car.y + 0.45;
      const h = it.hist[t];
      if (!h.length || Math.hypot(h[0][0] - x, h[0][2] - z) > 15) { h.length = 0; for (let i = 0; i < N; i++) h.push([x, y, z]); }
      if (push) { const last = h.pop(); last[0] = x; last[1] = y; last[2] = z; h.unshift(last); } else { h[0][0] = x; h[0][1] = y; h[0][2] = z; }
      for (let i = 0; i < N; i++) {
        const w = 0.32 * (1 - (i / (N - 1)) * 0.7);
        const q = h[i];
        const o = ((t * N + i) * 2) * 3;
        it.pos[o] = q[0]; it.pos[o + 1] = q[1] + w; it.pos[o + 2] = q[2];
        it.pos[o + 3] = q[0]; it.pos[o + 4] = q[1] - w * 0.6; it.pos[o + 5] = q[2];
        it.a[(t * N + i) * 2] = it.a[(t * N + i) * 2 + 1] = 0.85 * it.level;
      }
    }
    it.geo.attributes.position.needsUpdate = true;
    it.geo.attributes.aA.needsUpdate = true;
  }

  /** After the player's finish: slow orbiting showcase shot around the car (keeps going behind the results). */
  updateCinematic(dt) {
    const c = this.cine;
    if (!c) return;
    const rig = this.race.rigs[c.car.player];
    if (!rig) return;
    c.t += dt;
    const car = c.car;
    const a = c.a0 + c.t * 0.45;
    const r = 7.5 - Math.min(1.5, c.t * 0.4);
    const cam = rig.camera;
    cam.position.set(car.x + Math.sin(a) * r, car.y + 1.4 + Math.sin(c.t * 0.5) * 0.4, car.z + Math.cos(a) * r);
    cam.lookAt(car.x, car.y + 0.7, car.z);
    cam.fov = 48;
    cam.updateProjectionMatrix();
  }
}
