import * as THREE from 'three';

const VERT = /* glsl */`
  attribute float aSize;
  attribute float aAlpha;
  attribute vec3 aColor;
  uniform float uScale;
  varying float vAlpha;
  varying vec3 vColor;
  void main() {
    vAlpha = aAlpha;
    vColor = aColor;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = aSize * uScale / max(0.5, -mv.z);
    gl_Position = projectionMatrix * mv;
  }
`;
const FRAG = /* glsl */`
  varying float vAlpha;
  varying vec3 vColor;
  uniform float uSoft;
  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float d = length(c) * 2.0;
    if (d > 1.0) discard;
    float a = mix(1.0 - d, pow(1.0 - d, 0.5), uSoft);
    gl_FragColor = vec4(vColor, a * vAlpha);
  }
`;

/**
 * Pooled GPU point particles. One draw call per system.
 * emit() takes a plain object; no per-frame allocations.
 */
export class ParticleSystem {
  constructor(scene, max, { additive = true, soft = 0 } = {}) {
    this.max = max;
    this.count = 0;
    this.cursor = 0;
    this.pos = new Float32Array(max * 3);
    this.vel = new Float32Array(max * 3);
    this.col = new Float32Array(max * 3);
    this.size = new Float32Array(max);
    this.alpha = new Float32Array(max);
    this.life = new Float32Array(max);
    this.maxLife = new Float32Array(max);
    this.s0 = new Float32Array(max);
    this.s1 = new Float32Array(max);
    this.a0 = new Float32Array(max);
    this.drag = new Float32Array(max);
    this.grav = new Float32Array(max);

    const g = new THREE.BufferGeometry();
    this.posAttr = new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage);
    this.colAttr = new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage);
    this.sizeAttr = new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage);
    this.alphaAttr = new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('position', this.posAttr);
    g.setAttribute('aColor', this.colAttr);
    g.setAttribute('aSize', this.sizeAttr);
    g.setAttribute('aAlpha', this.alphaAttr);
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);

    this.material = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: { uScale: { value: 500 }, uSoft: { value: soft } },
      transparent: true,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.points = new THREE.Points(g, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = 5;
    scene.add(this.points);
    this._c = new THREE.Color();
  }

  setViewportHeight(px) { this.material.uniforms.uScale.value = px * 0.75; }

  emit(o) {
    const i = this.cursor;
    this.cursor = (this.cursor + 1) % this.max;
    const i3 = i * 3;
    this.pos[i3] = o.x; this.pos[i3 + 1] = o.y; this.pos[i3 + 2] = o.z;
    this.vel[i3] = o.vx || 0; this.vel[i3 + 1] = o.vy || 0; this.vel[i3 + 2] = o.vz || 0;
    this._c.set(o.color ?? 0xffffff);
    this.col[i3] = this._c.r; this.col[i3 + 1] = this._c.g; this.col[i3 + 2] = this._c.b;
    this.life[i] = o.life || 0.6;
    this.maxLife[i] = this.life[i];
    this.s0[i] = o.size ?? 1;
    this.s1[i] = o.sizeEnd ?? this.s0[i];
    this.a0[i] = o.alpha ?? 1;
    this.drag[i] = o.drag ?? 1;
    this.grav[i] = o.gravity ?? 0;
    this.size[i] = this.s0[i];
    this.alpha[i] = this.a0[i];
  }

  burst(n, o, spread = 10) {
    for (let k = 0; k < n; k++) {
      this.emit({
        ...o,
        vx: (o.vx || 0) + (Math.random() - 0.5) * spread,
        vy: (o.vy || 0) + Math.random() * spread * 0.6,
        vz: (o.vz || 0) + (Math.random() - 0.5) * spread,
        life: (o.life || 0.6) * (0.6 + Math.random() * 0.8),
      });
    }
  }

  update(dt) {
    for (let i = 0; i < this.max; i++) {
      if (this.life[i] <= 0) { if (this.alpha[i] !== 0) { this.alpha[i] = 0; } continue; }
      this.life[i] -= dt;
      const t = 1 - Math.max(0, this.life[i]) / this.maxLife[i];
      const i3 = i * 3;
      const d = Math.exp(-this.drag[i] * dt);
      this.vel[i3] *= d; this.vel[i3 + 1] = this.vel[i3 + 1] * d - this.grav[i] * dt; this.vel[i3 + 2] *= d;
      this.pos[i3] += this.vel[i3] * dt;
      this.pos[i3 + 1] += this.vel[i3 + 1] * dt;
      this.pos[i3 + 2] += this.vel[i3 + 2] * dt;
      this.size[i] = this.s0[i] + (this.s1[i] - this.s0[i]) * t;
      this.alpha[i] = this.life[i] > 0 ? this.a0[i] * (1 - t) : 0;
    }
    this.posAttr.needsUpdate = true;
    this.colAttr.needsUpdate = true;
    this.sizeAttr.needsUpdate = true;
    this.alphaAttr.needsUpdate = true;
  }

  clear() { this.life.fill(0); this.alpha.fill(0); }

  dispose() {
    this.points.parent?.remove(this.points);
    this.points.geometry.dispose();
    this.material.dispose();
  }
}
