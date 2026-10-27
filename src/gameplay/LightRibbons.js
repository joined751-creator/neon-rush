import * as THREE from 'three';

/*
 * v5.0 digital world: every car draws a low glowing ribbon of light behind it in its own colour
 * (bright at the car, fading out over ~1.5 s). Purely visual — nothing collides with it.
 * All cars share one dynamic mesh: a single draw call.
 */
const N = 28; // history points per car
const STEP = 0.05; // seconds between points

const VERT = /* glsl */`
  attribute vec3 aCol;
  attribute float aFade;
  varying vec3 vCol;
  varying float vFade, vV;
  attribute float aV;
  void main() { vCol = aCol; vFade = aFade; vV = aV; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`;
const FRAG = /* glsl */`
  varying vec3 vCol;
  varying float vFade, vV;
  void main() {
    float edge = 0.35 + 0.65 * smoothstep(0.55, 1.0, vV) + 0.5 * (1.0 - smoothstep(0.0, 0.12, vV)); // bright top rim
    gl_FragColor = vec4(vCol * edge * vFade, 1.0);
  }
`;

export class LightRibbons {
  constructor(scene, cars) {
    this.scene = scene;
    this.cars = cars;
    const nc = cars.length;
    const verts = nc * N * 2;
    this.pos = new Float32Array(verts * 3);
    this.col = new Float32Array(verts * 3);
    this.fade = new Float32Array(verts);
    const v = new Float32Array(verts);
    const idx = [];
    for (let c = 0; c < nc; c++) {
      for (let i = 0; i < N; i++) { const o = (c * N + i) * 2; v[o] = 0; v[o + 1] = 1; }
      for (let i = 0; i < N - 1; i++) { const a = (c * N + i) * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    }
    const g = new THREE.BufferGeometry();
    g.setIndex(idx);
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aCol', new THREE.BufferAttribute(this.col, 3));
    g.setAttribute('aFade', new THREE.BufferAttribute(this.fade, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aV', new THREE.BufferAttribute(v, 1));
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);
    this.geo = g;
    this.mat = new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false,
      blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    });
    this.mesh = new THREE.Mesh(g, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 4;
    scene.add(this.mesh);
    const tmp = new THREE.Color();
    this.hist = cars.map((car, c) => {
      tmp.set(car.color).multiplyScalar(1.8);
      for (let i = 0; i < N * 2; i++) { const o = (c * N * 2 + i) * 3; this.col[o] = tmp.r; this.col[o + 1] = tmp.g; this.col[o + 2] = tmp.b; }
      return { pts: [], acc: 0 };
    });
  }

  update(dt) {
    const H = 0.75;
    this.cars.forEach((car, c) => {
      const h = this.hist[c];
      const m = car.model;
      const back = m.dims.rear - 0.15;
      const x = car.x + Math.sin(car.heading) * back, z = car.z + Math.cos(car.heading) * back, y = car.y + 0.05;
      const alive = !car.eliminated && m.root.visible && !car.airborne;
      if (!alive || (h.pts.length && Math.hypot(h.pts[0][0] - x, h.pts[0][2] - z) > 14)) h.pts.length = 0; // teleport / respawn
      if (alive) {
        h.acc += dt;
        if (!h.pts.length) h.pts.unshift([x, y, z]);
        else if (h.acc >= STEP) { h.acc = 0; h.pts.unshift([x, y, z]); if (h.pts.length > N) h.pts.length = N; } else { h.pts[0][0] = x; h.pts[0][1] = y; h.pts[0][2] = z; }
      }
      const speedK = Math.min(1, Math.abs(car.speed) / 25);
      for (let i = 0; i < N; i++) {
        const p = h.pts[Math.min(i, h.pts.length - 1)];
        const o = (c * N + i) * 2;
        if (!p) { this.fade[o] = this.fade[o + 1] = 0; continue; }
        this.pos[o * 3] = p[0]; this.pos[o * 3 + 1] = p[1]; this.pos[o * 3 + 2] = p[2];
        this.pos[o * 3 + 3] = p[0]; this.pos[o * 3 + 4] = p[1] + H; this.pos[o * 3 + 5] = p[2];
        const k = i / (N - 1);
        const f = i < h.pts.length ? (1 - k) ** 1.6 * (0.25 + 0.75 * speedK) * 0.5 : 0;
        this.fade[o] = this.fade[o + 1] = f;
      }
    });
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.aFade.needsUpdate = true;
  }

  dispose() {
    this.scene.remove(this.mesh);
    this.geo.dispose();
    this.mat.dispose();
  }
}
