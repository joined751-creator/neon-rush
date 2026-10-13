import * as THREE from 'three';

/** Neon drift trails: ring buffer of quads drawn in a single mesh. */
export class SkidMarks {
  constructor(scene, maxQuads = 3000) {
    this.max = maxQuads;
    this.cursor = 0;
    this.pos = new Float32Array(maxQuads * 6 * 3);
    this.col = new Float32Array(maxQuads * 6 * 3);
    const g = new THREE.BufferGeometry();
    this.posAttr = new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage);
    this.colAttr = new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('position', this.posAttr);
    g.setAttribute('color', this.colAttr);
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);
    this.mesh = new THREE.Mesh(g, new THREE.MeshBasicMaterial({
      vertexColors: true, transparent: true, opacity: 1, depthWrite: false,
      blending: THREE.AdditiveBlending, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    }));
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 2;
    scene.add(this.mesh);
    this._c = new THREE.Color();
    this.dirty = false;
  }

  /** Adds a quad from (x0,y0,z0) to (x1,y1,z1). */
  add(x0, y0, z0, x1, y1, z1, color, intensity = 0.35, width = 0.32) {
    const dx = x1 - x0, dz = z1 - z0;
    const len = Math.hypot(dx, dz);
    if (len < 0.05 || len > 6) return;
    const px = (-dz / len) * width, pz = (dx / len) * width;
    const i = this.cursor * 18;
    this.cursor = (this.cursor + 1) % this.max;
    const y0b = y0 + 0.04, y1b = y1 + 0.04;
    const v = [
      x0 - px, y0b, z0 - pz, x0 + px, y0b, z0 + pz, x1 + px, y1b, z1 + pz,
      x0 - px, y0b, z0 - pz, x1 + px, y1b, z1 + pz, x1 - px, y1b, z1 - pz,
    ];
    this.pos.set(v, i);
    this._c.set(color).multiplyScalar(intensity);
    for (let k = 0; k < 6; k++) {
      this.col[i + k * 3] = this._c.r; this.col[i + k * 3 + 1] = this._c.g; this.col[i + k * 3 + 2] = this._c.b;
    }
    this.dirty = true;
  }

  update() {
    if (!this.dirty) return;
    this.posAttr.needsUpdate = true;
    this.colAttr.needsUpdate = true;
    this.dirty = false;
  }

  clear() { this.pos.fill(0); this.col.fill(0); this.dirty = true; }

  dispose() {
    this.mesh.parent?.remove(this.mesh);
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
  }
}
