import * as THREE from 'three';

const N = 10; // history points per trail
const VERT = /* glsl */`
  attribute float aFade;
  varying float vFade;
  void main() { vFade = aFade; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`;
const FRAG = /* glsl */`
  uniform vec3 uColor;
  varying float vFade;
  void main() { gl_FragColor = vec4(uColor, vFade); }
`;

/**
 * Cleaner look: hide the old fake headlight cones (grey wedges on the road), calm the underglow and soften the
 * metallic-flake normal map (with nearest filtering it showed up as black speckles on phone screens).
 */
export function tidyModel(m) {
  m.body.traverse((o) => {
    if (!o.isMesh) return;
    if (o.geometry?.type === 'ConeGeometry' && o.geometry.parameters.radius > 1) o.visible = false;
    const mat = o.material;
    if (mat?.normalMap && !mat.userData.tidy) {
      mat.userData.tidy = true;
      mat.normalScale.multiplyScalar(0.3);
      if (mat.normalMap.magFilter !== THREE.LinearFilter) { mat.normalMap.magFilter = THREE.LinearFilter; mat.normalMap.needsUpdate = true; }
    }
  });
  if (m.glow) { m.glow.scale.set(0.78, 0.86, 1); m.glow.material.color.multiplyScalar(0.55); }
}

/**
 * Neon taillight streaks: two thin additive ribbons per car that trail behind at speed
 * (the classic long-exposure look of night racing). One draw call per car.
 */
const STREAKS = false;

export class LightTrails {
  constructor(scene, cars) {
    this.scene = scene;
    cars.forEach((car) => tidyModel(car.model));
    // v5.4: no light stripes behind the cars any more — the «Неоновое эхо» (NeonEcho) is the game's own speed effect
    this.items = cars.filter((car) => STREAKS && !car.human).map((car) => {
      const geo = new THREE.BufferGeometry();
      const pos = new Float32Array(2 * N * 2 * 3); // 2 trails × N points × 2 verts
      const fade = new Float32Array(2 * N * 2);
      const idx = [];
      for (let t = 0; t < 2; t++) {
        for (let i = 0; i < N - 1; i++) {
          const a = (t * N + i) * 2;
          idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
        }
      }
      geo.setIndex(idx);
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
      geo.setAttribute('aFade', new THREE.BufferAttribute(fade, 1).setUsage(THREE.DynamicDrawUsage));
      geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);
      const mat = new THREE.ShaderMaterial({
        vertexShader: VERT, fragmentShader: FRAG,
        uniforms: { uColor: { value: new THREE.Color(1, 0.06, 0.12).multiplyScalar(2.4) } },
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.frustumCulled = false;
      mesh.renderOrder = 4;
      scene.add(mesh);
      return { car, mesh, geo, pos, fade, hist: [[], []], acc: 0, strength: 0 };
    });
  }

  update(dt) {
    for (const it of this.items) {
      const c = it.car;
      const m = c.model;
      const fast = !c.eliminated && Math.abs(c.speed) > 30;
      it.strength += ((fast ? Math.min(1, (Math.abs(c.speed) - 30) / 25) : 0) - it.strength) * Math.min(1, dt * 4);
      it.mesh.visible = it.strength > 0.02 && m.root.visible;
      const fx = Math.sin(c.heading), fz = Math.cos(c.heading);
      const rx = -fz, rz = fx;
      const rear = m.dims.rear - 0.02;
      const half = m.dims.W / 2 - 0.22;
      it.acc += dt;
      const push = it.acc > 1 / 60;
      if (push) it.acc = 0;
      for (let t = 0; t < 2; t++) {
        const side = t ? 1 : -1;
        const x = c.x + fx * rear + rx * side * half, z = c.z + fz * rear + rz * side * half, y = c.y + 0.72;
        const h = it.hist[t];
        if (!fast || h.length === 0 || Math.hypot(h[0][0] - x, h[0][2] - z) > 12) { h.length = 0; for (let i = 0; i < N; i++) h.push([x, y, z]); }
        if (push) { const last = h.pop(); last[0] = x; last[1] = y; last[2] = z; h.unshift(last); } else { h[0][0] = x; h[0][1] = y; h[0][2] = z; }
        for (let i = 0; i < N; i++) {
          const k = i / (N - 1);
          const w = 0.045 * (1 - k * 0.6);
          const p = h[i];
          const o = ((t * N + i) * 2) * 3;
          it.pos[o] = p[0]; it.pos[o + 1] = p[1] + w; it.pos[o + 2] = p[2];
          it.pos[o + 3] = p[0]; it.pos[o + 4] = p[1] - w; it.pos[o + 5] = p[2];
          const f = (1 - k) * (1 - k) * 0.45 * it.strength;
          it.fade[(t * N + i) * 2] = f; it.fade[(t * N + i) * 2 + 1] = f;
        }
      }
      it.geo.attributes.position.needsUpdate = true;
      it.geo.attributes.aFade.needsUpdate = true;
    }
  }

  dispose() {
    for (const it of this.items) { this.scene.remove(it.mesh); it.geo.dispose(); it.mesh.material.dispose(); }
    this.items = [];
  }
}
