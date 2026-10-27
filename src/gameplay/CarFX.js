import * as THREE from 'three';
import { eventBus, Events } from '../core/EventBus.js';
import { NeonEcho } from './NeonEcho.js';
import { VoxelFX } from './VoxelFX.js';

/**
 * v4.2 cars & effects:
 *  - live reflections: a cube camera next to the camera's car renders the world (one or two faces per frame),
 *    and every car's paint, glass, chrome and rims reflect the real track, neon and sky instead of a fixed map;
 *  - animated shader flames from the exhausts (hot white core → nitro / boost colour, flickering) + exhaust glow;
 *  - spray from the tyres on the wet Neon City road, thicker neon-tinted drift smoke;
 *  - landing dust ring after jumps, fireball + shockwave on rocket hits, fireworks with crackle and gold "willow".
 */

export let glowTex = null;

function radial() {
  const S = 64;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  gr.addColorStop(0, 'rgba(255,255,255,1)');
  gr.addColorStop(0.25, 'rgba(255,255,255,0.55)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, S, S);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const FLAME_VERT = /* glsl */`
  varying vec2 vUv; varying vec3 vN; varying vec3 vV;
  void main() {
    vUv = uv;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vN = normalize(normalMatrix * normal);
    vV = normalize(-mv.xyz);
    gl_Position = projectionMatrix * mv;
  }`;
const FLAME_FRAG = /* glsl */`
  uniform vec3 uColor; uniform float uTime;
  varying vec2 vUv; varying vec3 vN; varying vec3 vV;
  float h(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float n2(vec2 p) {
    vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(h(i), h(i + vec2(1, 0)), f.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), f.x), f.y);
  }
  void main() {
    float t = vUv.y; // 0 at the pipe, 1 at the tip
    float n = n2(vec2(vUv.x * 7.0, t * 5.0 - uTime * 22.0)) * 0.6 + n2(vec2(vUv.x * 15.0, t * 11.0 - uTime * 37.0)) * 0.4;
    float a = pow(1.0 - t, 1.25) * (0.45 + 0.75 * n);
    a *= smoothstep(1.0, 0.75, t + (n - 0.5) * 0.35); // ragged, flickering tip
    float edge = pow(abs(dot(normalize(vN), normalize(vV))), 0.8); // soft silhouette edges
    vec3 core = vec3(1.0, 0.96, 0.9) * 2.6;
    vec3 col = mix(core, uColor, smoothstep(0.0, 0.42, t));
    gl_FragColor = vec4(col * a * edge * 0.7, 1.0);
  }`;

export class CarFX {
  constructor({ scene, renderer, cars, theme, fx, items, quality }) {
    this.scene = scene;
    this.renderer = renderer;
    this.cars = cars;
    this.theme = theme;
    this.fx = fx;
    this.time = 0;
    this.unsub = [];
    this.blasts = [];
    this.pending = [];
    glowTex ||= radial();
    const touch = typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches;

    // ---- live reflections
    // v4.4.1: phones get a small cube refreshed every other frame (the reflections still move, at a fraction of the cost)
    const res = quality === 'low' || touch ? 64 : quality === 'high' ? 256 : 128;
    this.facesPerFrame = quality === 'high' && !touch ? 2 : 1;
    this.captureEvery = touch || quality === 'low' ? 2 : 1;
    this.frame = 0;
    this.cubeRT = new THREE.WebGLCubeRenderTarget(res, { type: THREE.HalfFloatType });
    this.cubeCam = new THREE.CubeCamera(0.5, 1200, this.cubeRT);
    this.face = 0;
    this.primed = false;
    for (const car of cars) {
      car.model.root.traverse((o) => {
        const m = o.material;
        if (!o.isMesh || !m || !m.isMeshStandardMaterial || m.userData.liveEnv) return;
        m.userData.liveEnv = true;
        m.envMap = this.cubeRT.texture;
        m.envMapIntensity = (m.envMapIntensity ?? 1) * 1.7; // the real night world is darker than the old studio map
        m.needsUpdate = true;
      });
    }

    // ---- shader flames + exhaust glow
    this.flames = cars.map((car) => {
      const m = car.model;
      const mat = new THREE.ShaderMaterial({
        vertexShader: FLAME_VERT, fragmentShader: FLAME_FRAG,
        uniforms: { uColor: { value: new THREE.Color(0x6fd8ff) }, uTime: { value: Math.random() * 10 } },
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      });
      mat.color = mat.uniforms.uColor.value; // Car.updateVisual sets flameMat.color each frame
      const old = m.flameMat;
      for (const f of m.flames) f.material = mat;
      m.flameMat = mat;
      old?.dispose();
      const sMat = new THREE.SpriteMaterial({ map: glowTex, color: 0x6fd8ff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
      const glows = m.flames.map((f) => {
        const s = new THREE.Sprite(sMat);
        s.position.copy(f.position);
        s.position.z -= 0.08;
        s.scale.setScalar(0.9);
        s.visible = false;
        f.parent.add(s);
        return s;
      });
      return { car, mat, sMat, glows };
    });

    // ---- events: landing dust, rocket blasts, fireworks
    this.unsub.push(eventBus.on(Events.CAR_LAND, ({ car, impact }) => { if (impact > 5) this.landing(car, impact); }));
    this.unsub.push(eventBus.on(Events.FIREWORK, ({ x, y, z, color }) => this.firework(x, y, z, color)));
    if (items?.explode) {
      const orig = items.explode.bind(items);
      items.explode = (x, y, z, color) => { orig(x, y, z, color); this.blast(x, y, z, color); };
    }

    // v4.4.1 level of detail: cars far from every player's camera drop the small wheel parts (rim spokes, brake disc,
    // caliper, hub light) and the headlight cones — a car 40 m away looks the same, at a third of the draw calls
    this.lod = cars.map((car) => {
      const detail = [];
      for (const w of car.model.wheels) {
        detail.push(...w.spin.children.slice(1));
        for (const o of w.pivot.children) if (o !== w.spin) detail.push(o);
      }
      for (const o of car.model.body.children) {
        if (o.isMesh && o.geometry?.type === 'ConeGeometry' && o.material.blending === THREE.AdditiveBlending && o.visible) detail.push(o);
      }
      return { car, detail, near: true };
    });
    this.smokeTint = new THREE.Color(0x8a84a0).lerp(new THREE.Color(theme.wall), 0.22).getHex();
    this.wet = (theme.wet ?? 0) > 0;
    // v5.4 «Неоновое эхо»: holographic echoes of the car on nitro / boost / high drift (replaces the light ribbons)
    this.echo = new NeonEcho(scene, cars);
    // v5.2: light-cube effects (rez-in at the start, derez on wrecks, re-spawn columns)
    this.voxels = theme.digital ? new VoxelFX(scene, cars) : null;
  }

  // ---------------------------------------------------------------- reflections
  capture(focus) {
    if (!focus) return;
    const r = this.renderer, cam = this.cubeCam;
    cam.position.set(focus.x, focus.y + 1.1, focus.z);
    cam.updateMatrixWorld();
    const vis = focus.model.root.visible;
    focus.model.root.visible = false; // don't film the inside of our own car
    const pv = this.fx.sparks.points.visible, sv = this.fx.smoke.points.visible;
    this.fx.sparks.points.visible = this.fx.smoke.points.visible = false; // nor the smoke / spray right around it
    if (!this.primed) {
      cam.update(r, this.scene); // first frame: the whole cube at once
      this.primed = true;
    } else if (++this.frame % this.captureEvery === 0) {
      const prev = r.getRenderTarget(), pf = r.getActiveCubeFace(), pm = r.getActiveMipmapLevel();
      for (let k = 0; k < this.facesPerFrame; k++) {
        r.setRenderTarget(this.cubeRT, this.face);
        r.render(this.scene, cam.children[this.face]);
        this.face = (this.face + 1) % 6;
        if (this.face === 0) this.cubeRT.texture.needsPMREMUpdate = true; // re-blur once all six faces are fresh
      }
      r.setRenderTarget(prev, pf, pm);
    }
    focus.model.root.visible = vis;
    this.fx.sparks.points.visible = pv;
    this.fx.smoke.points.visible = sv;
  }

  // ---------------------------------------------------------------- per frame
  update(dt, focus) {
    this.time += dt;
    this.voxels?.update(dt);
    for (const fl of this.flames) {
      fl.mat.uniforms.uTime.value += dt;
      const fls = fl.car.model.flames;
      if (fl.car.model.ev) {
        // v4.4 electric car: no backfire pops, and the boost is a blue / violet plasma instead of fire
        for (const f of fls) if (!fl.car.boosting) f.visible = false;
        fl.mat.uniforms.uColor.value.setHex(fl.car.nitroActive ? 0xb36bff : 0x46c8ff).multiplyScalar(3);
      }
      const on = fls.length && fls[0].visible && !fl.car.eliminated;
      fl.sMat.color.copy(fl.mat.uniforms.uColor.value).multiplyScalar(0.5);
      const k = 0.75 + Math.random() * 0.5;
      for (const g of fl.glows) { g.visible = on; g.scale.setScalar(k * (fl.car.boosting ? 1.1 : 0.7)); }
    }
    const viewers = this.cars.filter((c) => c.human);
    if (!viewers.length && focus) viewers.push(focus);
    this.echo.update(dt, viewers);
    for (const L of this.lod) {
      let d2 = Infinity;
      for (const v of viewers) d2 = Math.min(d2, (v.x - L.car.x) ** 2 + (v.z - L.car.z) ** 2);
      const near = d2 < (L.near ? 42 * 42 : 36 * 36); // a little hysteresis so nothing flickers at the edge
      if (near !== L.near) { L.near = near; for (const o of L.detail) o.visible = near; }
    }
    const F = this.fx;
    for (const car of this.cars) {
      if (car.eliminated || car.airborne) continue;
      if (focus && (car.x - focus.x) ** 2 + (car.z - focus.z) ** 2 > 90 * 90) continue; // effects only near the camera
      const fx = Math.sin(car.heading), fz = Math.cos(car.heading);
      const rx = -fz, rz = fx;
      const d = car.model.dims, rear = d.rear + 0.35, half = d.W / 2 - 0.15;
      const spd = Math.abs(car.speed);
      // tyre spray on the wet road
      if (this.wet && spd > 18) {
        for (const side of [-1, 1]) {
          if (Math.random() > 0.35) continue;
          const x = car.x + fx * rear + rx * side * half, z = car.z + fz * rear + rz * side * half;
          F.smoke.emit({
            x, y: car.y + 0.25, z, vx: car.vx * 0.35 + rx * side * 1.5 + (Math.random() - 0.5) * 2, vy: 1.2 + Math.random() * 1.6,
            vz: car.vz * 0.35 + rz * side * 1.5 + (Math.random() - 0.5) * 2,
            color: 0xb8c6e0, size: 0.8, sizeEnd: 3.6 + spd * 0.03, life: 0.55, alpha: 0.14, drag: 2.6,
          });
        }
      }
      // thick, slightly neon-tinted drift smoke
      if (car.drifting && Math.random() < 0.45) {
        const side = Math.random() < 0.5 ? -1 : 1;
        F.smoke.emit({
          x: car.x + fx * rear + rx * side * half, y: car.y + 0.4, z: car.z + fz * rear + rz * side * half,
          vx: car.vx * 0.12 + (Math.random() - 0.5) * 2.5, vy: 0.7 + Math.random(), vz: car.vz * 0.12 + (Math.random() - 0.5) * 2.5,
          color: this.smokeTint, size: 2.2, sizeEnd: 8.5, life: 1.7, alpha: 0.13, drag: 1.3,
        });
      }
    }
    // shockwaves / flashes
    for (let i = this.blasts.length - 1; i >= 0; i--) {
      const b = this.blasts[i];
      b.t += dt;
      const k = b.t / b.life;
      if (k >= 1) { this.scene.remove(b.obj); b.obj.geometry?.dispose(); b.obj.material.dispose(); this.blasts.splice(i, 1); continue; }
      const s = b.s0 + (b.s1 - b.s0) * (1 - Math.pow(1 - k, 2.2));
      b.obj.scale.setScalar(s);
      b.obj.material.opacity = b.a0 * (1 - k) * (1 - k);
    }
    // delayed firework crackle
    for (let i = this.pending.length - 1; i >= 0; i--) {
      const p = this.pending[i];
      p.t -= dt;
      if (p.t > 0) continue;
      this.pending.splice(i, 1);
      p.fn();
    }
  }

  // ---------------------------------------------------------------- one-shot effects
  addBlast(obj, life, s0, s1, a0) {
    obj.scale.setScalar(s0);
    obj.renderOrder = 6;
    this.scene.add(obj);
    this.blasts.push({ obj, life, s0, s1, a0, t: 0 });
  }

  flash(x, y, z, color, size, life = 0.3, a0 = 1) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: new THREE.Color(color).multiplyScalar(2.2), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    s.position.set(x, y, z);
    this.addBlast(s, life, size * 0.4, size, a0);
  }

  ring(x, y, z, color, size, life = 0.55, a0 = 1, inner = 0.82) {
    const m = new THREE.Mesh(
      new THREE.RingGeometry(inner, 1, 48).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(1.6), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }),
    );
    m.position.set(x, y, z);
    this.addBlast(m, life, 0.6, size, a0);
  }

  blast(x, y, z, color) {
    const F = this.fx;
    // fireball: bright core that swells and dies fast, hot embers flung out, then dark smoke rolling up
    for (let k = 0; k < 6; k++) {
      F.sparks.emit({ x: x + (Math.random() - 0.5), y: y + Math.random() * 0.8, z: z + (Math.random() - 0.5), vy: 2 + Math.random() * 2,
        color: k % 2 ? 0xffd070 : 0xff6a20, size: 2.5, sizeEnd: 7, life: 0.35, drag: 3 });
    }
    F.sparks.burst(40, { x, y: y + 0.5, z, color: 0xffa040, size: 0.45, sizeEnd: 0.05, life: 0.9, gravity: 16, drag: 0.6 }, 34);
    F.smoke.burst(10, { x, y: y + 1, z, vy: 3, color: 0x2a2228, size: 3, sizeEnd: 11, life: 1.8, alpha: 0.4, drag: 1.4 }, 5);
    this.flash(x, y + 1, z, 0xffa050, 16, 0.32);
    this.ring(x, y + 0.15, z, color ?? 0xff6030, 13, 0.5);
  }

  landing(car, impact) {
    const F = this.fx;
    const n = Math.min(26, 10 + Math.round(impact));
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2;
      const v = 5 + Math.random() * 4;
      F.smoke.emit({ x: car.x + Math.cos(a) * 1.2, y: car.y + 0.3, z: car.z + Math.sin(a) * 1.2,
        vx: Math.cos(a) * v + car.vx * 0.3, vy: 0.4 + Math.random() * 0.6, vz: Math.sin(a) * v + car.vz * 0.3,
        color: this.smokeTint, size: 1.4, sizeEnd: 4.5, life: 0.75, alpha: 0.24, drag: 3.2 });
    }
    F.sparks.burst(14, { x: car.x, y: car.y + 0.2, z: car.z, vx: car.vx * 0.6, vz: car.vz * 0.6, color: 0xaee8ff, size: 0.4, sizeEnd: 0.05, life: 0.35, gravity: 14 }, 12);
    if (impact > 7) this.ring(car.x, car.y + 0.12, car.z, this.theme.wall2, 6, 0.4, 0.35, 0.93);
  }

  firework(x, y, z, color) {
    if (y === undefined) return;
    const F = this.fx;
    this.flash(x, y, z, color ?? 0xffffff, 26, 0.45, 0.8);
    // crackle: white/gold twinkles all over the shell a moment after the burst
    this.pending.push({ t: 0.38 + Math.random() * 0.15, fn: () => {
      for (let k = 0; k < 28; k++) {
        const a = Math.random() * Math.PI * 2, e = Math.random() * Math.PI - Math.PI / 2, r = 5 + Math.random() * 9;
        F.sparks.emit({ x: x + Math.cos(a) * Math.cos(e) * r, y: y + Math.sin(e) * r - 2, z: z + Math.sin(a) * Math.cos(e) * r,
          color: k % 3 ? 0xffffff : 0xffd27a, size: 0.9, sizeEnd: 0.05, life: 0.18 + Math.random() * 0.25, drag: 2 });
      }
    } });
    // willow: slow gold embers that drift down and fade
    F.sparks.burst(22, { x, y, z, color: 0xffb54a, size: 0.55, sizeEnd: 0.05, life: 2.4, gravity: 3.2, drag: 0.9 }, 12);
  }

  dispose() {
    for (const u of this.unsub) u();
    for (const b of this.blasts) { this.scene.remove(b.obj); b.obj.geometry?.dispose(); b.obj.material.dispose(); }
    this.blasts = [];
    for (const fl of this.flames) { fl.mat.dispose(); fl.sMat.dispose(); }
    this.cubeRT.dispose();
    this.echo.dispose();
    this.voxels?.dispose();
  }
}
