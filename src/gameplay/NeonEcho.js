import * as THREE from 'three';

/*
 * v5.4 «Неоновое эхо» — NEON RUSH's own signature effect (replaces the light ribbons behind the cars).
 * On nitro / boost and in a high-level drift a car leaves holographic copies of itself on the road: glowing
 * outlines in its colour with fine scan lines that keep most of its speed and fade in ~0.4 s, so a fast
 * car is followed by a short fan of "echoes". In Overdrive the echoes run through the rainbow.
 * Plus «Неоновый рывок»: while boosting, light arrows flash up on the road ahead and the car runs over them.
 * Normal driving leaves nothing behind — the effect is a reward for speed and skill.
 * One InstancedMesh per car (drawn only while it has echoes), no extra geometry: it reuses the car's body.
 */

const MAX = 12;
const LIFE = 0.42;

const VERT = /* glsl */`
  varying vec3 vN, vV, vW;
  varying vec3 vCol;
  varying float vDist;
  void main() {
    mat4 m = modelMatrix * instanceMatrix;
    vec4 w = m * vec4(position, 1.0);
    vW = w.xyz;
    vN = normalize(mat3(m) * normal);
    vV = normalize(cameraPosition - w.xyz);
    vDist = length(cameraPosition - w.xyz);
    vCol = vec3(1.0);
    #ifdef USE_INSTANCING_COLOR
      vCol = instanceColor;
    #endif
    gl_Position = projectionMatrix * viewMatrix * w;
  }
`;
const FRAG = /* glsl */`
  uniform float uTime;
  varying vec3 vN, vV, vW;
  varying vec3 vCol;
  varying float vDist;
  void main() {
    float f = 1.0 - abs(dot(normalize(vN), normalize(vV)));
    float rim = pow(f, 1.8);
    float scan = 0.55 + 0.45 * step(0.5, fract(vW.y * 14.0 - uTime * 3.0)); // fine hologram scan lines
    float a = (0.1 + rim * 1.35) * scan * smoothstep(1.5, 6.0, vDist); // no echo flashing right in front of the camera
    gl_FragColor = vec4(vCol * a, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

const _m = new THREE.Matrix4();
const _c = new THREE.Color();
const _q = new THREE.Quaternion();
const _v = new THREE.Vector3();
const _s = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);
const _p = {};

// «Неоновый рывок»: on nitro / boost, light arrows flash up on the road AHEAD of the car and it runs over them
const ARROWS = 72;
const ARROW_LIFE = 0.6;
function arrowGeometry() {
  const sh = new THREE.Shape();
  sh.moveTo(0, 0.6);
  sh.lineTo(1.3, -0.5);
  sh.lineTo(1.3, -0.95);
  sh.lineTo(0, 0.12);
  sh.lineTo(-1.3, -0.95);
  sh.lineTo(-1.3, -0.5);
  sh.closePath();
  return new THREE.ShapeGeometry(sh).rotateX(Math.PI / 2); // flat on the road, tip pointing forward (+z)
}

export class NeonEcho {
  constructor(scene, cars) {
    this.scene = scene;
    this.time = 0;
    this.mat = new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: FRAG, uniforms: { uTime: { value: 0 } },
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    this.slots = cars.map((car) => ({ car, mesh: null, src: null, echoes: [], t: 0, nextS: null }));
    this.arrows = [];
    this.aGeo = arrowGeometry();
    this.aMat = new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    this.aMesh = new THREE.InstancedMesh(this.aGeo, this.aMat, ARROWS);
    this.aMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.aMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(ARROWS * 3), 3).setUsage(THREE.DynamicDrawUsage);
    this.aMesh.frustumCulled = false;
    this.aMesh.renderOrder = 3;
    this.aMesh.count = 0;
    this.aMesh.visible = false;
    scene.add(this.aMesh);
  }

  /** Arrows ahead of a boosting car: one every ~7 m of road, 12–32 m in front of it, in its lane. */
  spawnArrows(s, rainbow) {
    const car = s.car, tr = car.track;
    if (!tr) return;
    const L = tr.length;
    const ahead = Math.min(32, Math.max(12, Math.abs(car.speed) * 0.33));
    const target = car.s + ahead;
    if (s.nextS === null || s.nextS < car.s || s.nextS > target + 20) s.nextS = car.s + 8;
    while (s.nextS <= target) {
      const at = ((s.nextS % L) + L) % L;
      s.nextS += 7;
      if (tr.ramps.some((r) => Math.abs(r.s - at) < r.len + 4)) continue; // never on a jump ramp
      const lat = Math.max(-tr.half + 2, Math.min(tr.half - 2, car.lateral));
      tr.pointAt(at, lat, _p);
      if (this.arrows.length >= ARROWS) this.arrows.shift();
      const col = rainbow ? new THREE.Color().setHSL((this.time * 1.3 + at * 0.01) % 1, 1, 0.6) : new THREE.Color(car.color);
      this.arrows.push({ x: _p.x, y: _p.y + 0.07, z: _p.z, h: _p.heading, age: 0, col, big: rainbow ? 1.35 : 1 });
    }
  }

  updateArrows(dt) {
    let n = 0;
    for (let i = this.arrows.length - 1; i >= 0; i--) {
      const a = this.arrows[i];
      a.age += dt;
      if (a.age >= ARROW_LIFE) this.arrows.splice(i, 1);
    }
    for (const a of this.arrows) {
      const k = a.age / ARROW_LIFE;
      const f = Math.min(1, a.age / 0.07) * (1 - k) * (1 - k); // flash in, then fade
      const sc = a.big * (0.85 + 0.25 * Math.min(1, a.age / 0.12));
      _q.setFromAxisAngle(_up, a.h);
      _m.compose(_v.set(a.x, a.y, a.z), _q, _s.set(sc, 1, sc));
      this.aMesh.setMatrixAt(n, _m);
      this.aMesh.setColorAt(n, _c.copy(a.col).multiplyScalar(2.2 * f));
      n++;
    }
    this.aMesh.count = n;
    this.aMesh.visible = n > 0;
    if (n) { this.aMesh.instanceMatrix.needsUpdate = true; this.aMesh.instanceColor.needsUpdate = true; }
  }

  /** The car's main body panel (largest physical-material mesh) — the echo reuses its geometry. */
  init(s) {
    let best = null, n = 0;
    s.car.model.body.traverse((o) => {
      if (!o.isMesh || !o.material?.isMeshPhysicalMaterial) return;
      const c = o.geometry.attributes.position.count;
      if (c > n) { n = c; best = o; }
    });
    if (!best) { s.src = false; return; }
    s.src = best;
    const mesh = new THREE.InstancedMesh(best.geometry, this.mat, MAX);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAX * 3), 3).setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled = false;
    mesh.renderOrder = 5;
    mesh.count = 0;
    mesh.visible = false;
    this.scene.add(mesh);
    s.mesh = mesh;
  }

  update(dt, viewers = []) {
    this.time += dt;
    this.mat.uniforms.uTime.value = this.time;
    for (const s of this.slots) {
      const car = s.car;
      // when does this car leave echoes?
      let every = 0, k = 1;
      if (!car.eliminated && Math.abs(car.speed) > 12) {
        if (car.overdrive > 0) every = 0.035;
        else if (car.boosting) every = car.nitroActive ? 0.045 : 0.055;
        else if (car.drifting && car.driftLevel >= 2) { every = 0.08; k = 0.6 + 0.2 * (car.driftLevel - 2); }
      }
      if (every && viewers.length && !viewers.some((v) => (v.x - car.x) ** 2 + (v.z - car.z) ** 2 < 140 * 140)) every = 0;
      if (every && (car.boosting || car.overdrive > 0) && !car.airborne) this.spawnArrows(s, car.overdrive > 0);
      else s.nextS = null;
      s.t += dt;
      if (every && s.t >= every) {
        s.t = 0;
        if (s.src === null) this.init(s);
        if (s.src && car.model.root.visible) {
          s.src.updateWorldMatrix(true, false);
          if (s.echoes.length >= MAX) s.echoes.shift();
          const col = car.overdrive > 0 ? _c.setHSL((this.time * 1.3) % 1, 1, 0.6).clone() : new THREE.Color(car.color);
          s.echoes.push({ m: s.src.matrixWorld.clone(), age: 0, col: col.multiplyScalar(k), vx: car.vx * 0.88, vz: car.vz * 0.88 });
        }
      }
      if (!s.mesh) continue;
      let n = 0;
      for (let i = s.echoes.length - 1; i >= 0; i--) {
        const e = s.echoes[i];
        e.age += dt;
        if (e.age >= LIFE) { s.echoes.splice(i, 1); continue; }
      }
      for (const e of s.echoes) {
        const f = 1 - e.age / LIFE;
        // the echo swells a touch and lifts as it fades — it "lets go" of the road
        const sc = 1 + (1 - f) * 0.12;
        _m.makeScale(sc, sc, sc).premultiply(e.m);
        // the echo keeps most of the car's speed, so the copies hang just behind it in a short fan
        _m.elements[12] += e.vx * e.age; _m.elements[13] += (1 - f) * 0.25; _m.elements[14] += e.vz * e.age;
        s.mesh.setMatrixAt(n, _m);
        s.mesh.setColorAt(n, _c.copy(e.col).multiplyScalar(f * f * 1.4));
        n++;
      }
      s.mesh.count = n;
      s.mesh.visible = n > 0;
      if (n) { s.mesh.instanceMatrix.needsUpdate = true; s.mesh.instanceColor.needsUpdate = true; }
    }
    this.updateArrows(dt);
  }

  dispose() {
    this.scene.remove(this.aMesh);
    this.aMesh.dispose();
    this.aGeo.dispose();
    this.aMat.dispose();
    for (const s of this.slots) {
      if (!s.mesh) continue;
      this.scene.remove(s.mesh);
      s.mesh.dispose(); // the geometry belongs to the car
    }
    this.mat.dispose();
  }
}
