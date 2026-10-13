import * as THREE from 'three';
import { TRACK } from '../core/Constants.js';
import {
  roadTexture, roadEmissiveTexture, wallEmissiveTexture, checkerTexture, boostPadTexture, bannerTexture,
} from './Textures.js';

const RAMP_HEIGHT = 1.7;

/**
 * Closed spline track: centre-line samples + spatial queries + mesh building.
 * Coordinates: x right, y up, z forward. Heading h → forward (sin h, cos h).
 */
export class Track {
  constructor(def, mirror = false) {
    this.def = def;
    let pts = def.points.map((p) => new THREE.Vector3(p[0], p[2], p[1]));
    if (mirror) pts = [pts[0], ...pts.slice(1).reverse()];
    this.curve = new THREE.CatmullRomCurve3(pts, true, 'centripetal');
    this.length = this.curve.getLength();
    const n = Math.round(this.length / TRACK.SAMPLE_STEP);
    this.n = n;
    this.step = this.length / n;
    this.width = TRACK.WIDTH;
    this.half = TRACK.WIDTH / 2;

    const sp = this.curve.getSpacedPoints(n);
    this.px = new Float32Array(n); this.py = new Float32Array(n); this.pz = new Float32Array(n);
    this.tx = new Float32Array(n); this.ty = new Float32Array(n); this.tz = new Float32Array(n);
    this.rx = new Float32Array(n); this.rz = new Float32Array(n);
    this.curv = new Float32Array(n); // signed curvature rad/m (positive = turning right)
    for (let i = 0; i < n; i++) { this.px[i] = sp[i].x; this.py[i] = sp[i].y; this.pz[i] = sp[i].z; }
    for (let i = 0; i < n; i++) {
      const a = this.wrap(i - 1), b = this.wrap(i + 1);
      let dx = this.px[b] - this.px[a], dy = this.py[b] - this.py[a], dz = this.pz[b] - this.pz[a];
      const l3 = Math.hypot(dx, dy, dz);
      this.tx[i] = dx / l3; this.ty[i] = dy / l3; this.tz[i] = dz / l3;
      const l2 = Math.hypot(dx, dz);
      this.rx[i] = -dz / l2; this.rz[i] = dx / l2;
    }
    const K = 5;
    for (let i = 0; i < n; i++) {
      const a = this.wrap(i - K), b = this.wrap(i + K);
      const ha = Math.atan2(this.tx[a], this.tz[a]);
      const hb = Math.atan2(this.tx[b], this.tz[b]);
      this.curv[i] = -angleDiff(hb, ha) / (2 * K * this.step);
    }

    this.ramps = [];
    this.boostPads = [];
    this.itemRows = [];
    this.layoutFeatures();
    this._q = { index: 0, s: 0, lateral: 0, y: 0, rx: 0, rz: 0, tx: 0, tz: 0, ty: 0, heading: 0, x: 0, z: 0 };
  }

  wrap(i) { return ((i % this.n) + this.n) % this.n; }

  heading(i) { i = this.wrap(i); return Math.atan2(this.tx[i], this.tz[i]); }

  /** Centre-line point at arc length s with lateral offset. */
  pointAt(s, lateral = 0, out = {}) {
    const f = (((s % this.length) + this.length) % this.length) / this.step;
    const i = Math.floor(f) % this.n, j = (i + 1) % this.n, t = f - Math.floor(f);
    out.x = lerp(this.px[i], this.px[j], t) + this.rx[i] * lateral;
    out.y = lerp(this.py[i], this.py[j], t);
    out.z = lerp(this.pz[i], this.pz[j], t) + this.rz[i] * lateral;
    out.heading = Math.atan2(this.tx[i], this.tz[i]);
    out.index = i;
    return out;
  }

  /** Nearest centre-line projection. hint = last index (or -1 for global search). */
  closest(x, z, hint = -1, out = this._q) {
    let best = 0, bd = Infinity;
    if (hint < 0) {
      for (let i = 0; i < this.n; i++) {
        const d = (this.px[i] - x) ** 2 + (this.pz[i] - z) ** 2;
        if (d < bd) { bd = d; best = i; }
      }
    } else {
      for (let k = -TRACK.SEARCH_WINDOW; k <= TRACK.SEARCH_WINDOW; k++) {
        const i = this.wrap(hint + k);
        const d = (this.px[i] - x) ** 2 + (this.pz[i] - z) ** 2;
        if (d < bd) { bd = d; best = i; }
      }
    }
    // project on the segment ahead or behind
    let i = best, j = this.wrap(best + 1);
    let sx = this.px[j] - this.px[i], sz = this.pz[j] - this.pz[i];
    let t = ((x - this.px[i]) * sx + (z - this.pz[i]) * sz) / (sx * sx + sz * sz);
    if (t < 0) {
      i = this.wrap(best - 1); j = best;
      sx = this.px[j] - this.px[i]; sz = this.pz[j] - this.pz[i];
      t = ((x - this.px[i]) * sx + (z - this.pz[i]) * sz) / (sx * sx + sz * sz);
    }
    t = Math.min(1, Math.max(0, t));
    const cx = this.px[i] + sx * t, cz = this.pz[i] + sz * t;
    const rx = lerp(this.rx[i], this.rx[j], t), rz = lerp(this.rz[i], this.rz[j], t);
    out.index = best;
    out.s = (i + t) * this.step;
    out.lateral = (x - cx) * rx + (z - cz) * rz;
    out.y = lerp(this.py[i], this.py[j], t);
    out.rx = rx; out.rz = rz;
    out.tx = this.tx[i]; out.tz = this.tz[i]; out.ty = this.ty[i];
    out.heading = Math.atan2(out.tx, out.tz);
    out.x = cx; out.z = cz;
    return out;
  }

  /** Extra height from ramps at arc length s (only within road). */
  rampHeight(s) {
    for (const r of this.ramps) {
      const d = s - r.s;
      if (d >= 0 && d <= r.len) return (d / r.len) * RAMP_HEIGHT;
    }
    return 0;
  }

  /** Returns the ramp whose end lies between s0 and s1 (forward crossing). */
  rampLaunch(s0, s1) {
    for (const r of this.ramps) {
      const end = r.s + r.len;
      if (s0 <= end && s1 > end && s1 - s0 < 20) return r;
    }
    return null;
  }

  get rampSlope() { return RAMP_HEIGHT / TRACK.RAMP_LENGTH; }

  /** Finds straight runs and places ramps, boost pads, item rows. */
  layoutFeatures() {
    const runs = [];
    let start = -1;
    for (let k = 0; k <= this.n; k++) {
      const i = k % this.n;
      const straight = k < this.n && Math.abs(this.curv[i]) < 0.0045;
      if (straight && start < 0) start = k;
      if (!straight && start >= 0) { runs.push({ a: start, b: k - 1 }); start = -1; }
    }
    const L = this.length;
    const runLen = (r) => (r.b - r.a) * this.step;
    // Exclude the start straight zone for ramps
    const cand = runs.filter((r) => runLen(r) > 70 && r.a * this.step > L * 0.12 && r.b * this.step < L * 0.92)
      .sort((p, q) => runLen(q) - runLen(p));
    if (cand[0]) {
      const r = cand[0];
      this.ramps.push({ s: ((r.a + r.b) / 2) * this.step, len: TRACK.RAMP_LENGTH });
    }
    // Boost pads near the start of each decent straight
    for (const r of runs) {
      if (runLen(r) < 50) continue;
      const s = r.a * this.step + 12;
      if (s < 40 || s > L - 60) continue;
      if (this.ramps.some((rp) => Math.abs(rp.s - s) < 40)) continue;
      this.boostPads.push({ s, lateral: (this.boostPads.length % 2 ? 1 : -1) * 4.5 });
    }
    for (const f of TRACK.ITEM_ROW_FRACTIONS) {
      let s = f * L;
      // nudge item rows away from ramps/pads
      for (const p of [...this.ramps, ...this.boostPads]) if (Math.abs(p.s - s) < 30) s += 40;
      this.itemRows.push(s);
    }
  }

  /** Builds visible geometry into a group. */
  build(theme, envMap) {
    const group = new THREE.Group();
    const n = this.n;
    const h = this.half;
    const wallOff = h + TRACK.WALL_OFFSET;
    this.disposables = [];

    // Road ribbon
    const roadMap = roadTexture();
    const roadEm = roadEmissiveTexture();
    const road = this.ribbon((i, side) => [side * (wallOff + 0.05), 0.02], { vScale: 1 / 22, uFlip: false });
    const roadMat = new THREE.MeshStandardMaterial({
      map: roadMap, emissiveMap: roadEm, emissive: new THREE.Color(theme.roadLine), emissiveIntensity: 1.6,
      roughness: theme.particles === 'rain' ? 0.18 : 0.42, metalness: theme.particles === 'rain' ? 0.55 : 0.25,
      envMap, envMapIntensity: 0.6,
    });
    group.add(new THREE.Mesh(road, roadMat));

    // Walls (both sides, inner faces) + neon top
    const wallEm = wallEmissiveTexture();
    const wallMatA = new THREE.MeshStandardMaterial({
      color: 0x0d0a16, emissive: new THREE.Color(theme.wall), emissiveMap: wallEm, emissiveIntensity: 1.5,
      roughness: 0.5, metalness: 0.4, side: THREE.DoubleSide,
    });
    const wallMatB = wallMatA.clone();
    wallMatB.emissive = new THREE.Color(theme.wall2);
    for (const side of [-1, 1]) {
      const wall = this.ribbonVertical(side * wallOff, 0, TRACK.WALL_HEIGHT);
      group.add(new THREE.Mesh(wall, side < 0 ? wallMatA : wallMatB));
      // dark skirt down to the ground so elevated road never floats
      const skirt = this.ribbonVertical(side * (wallOff + 0.05), -60, 0.0, true);
      group.add(new THREE.Mesh(skirt, new THREE.MeshBasicMaterial({ color: 0x050308, side: THREE.DoubleSide })));
    }
    // Underside
    const under = this.ribbon((i, side) => [side * (wallOff + 0.05), -0.4], { vScale: 0.05 });
    group.add(new THREE.Mesh(under, new THREE.MeshBasicMaterial({ color: 0x050308, side: THREE.BackSide })));

    // Light posts every ~50 m: emissive rings on poles
    const poleGeo = new THREE.CylinderGeometry(0.12, 0.16, 7, 6);
    poleGeo.translate(0, 3.5, 0);
    const ringGeo = new THREE.TorusGeometry(0.7, 0.09, 6, 16);
    const every = Math.max(1, Math.round(50 / this.step));
    const count = Math.floor(n / every) * 2;
    const poles = new THREE.InstancedMesh(poleGeo, new THREE.MeshStandardMaterial({ color: 0x1a1426, metalness: 0.7, roughness: 0.4 }), count);
    const rings = new THREE.InstancedMesh(ringGeo, new THREE.MeshBasicMaterial({ color: new THREE.Color(theme.wall2).multiplyScalar(2.2) }), count);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
    let c = 0;
    for (let i = 0; i < n && c < count; i += every) {
      for (const side of [-1, 1]) {
        const x = this.px[i] + this.rx[i] * side * (wallOff + 1.2);
        const z = this.pz[i] + this.rz[i] * side * (wallOff + 1.2);
        m.makeTranslation(x, this.py[i], z);
        poles.setMatrixAt(c, m);
        e.set(0, Math.atan2(this.tx[i], this.tz[i]), 0);
        q.setFromEuler(e);
        m.compose(new THREE.Vector3(x, this.py[i] + 7.2, z), q, new THREE.Vector3(1, 1, 1));
        rings.setMatrixAt(c, m);
        c++;
      }
    }
    poles.count = rings.count = c;
    group.add(poles, rings);

    // Start/finish line + gantry
    const p0 = this.pointAt(0);
    const line = new THREE.Mesh(new THREE.PlaneGeometry(this.width + 1.2, 3), new THREE.MeshBasicMaterial({ map: checkerTexture() }));
    line.rotation.order = 'YXZ';
    line.rotation.set(-Math.PI / 2, p0.heading, 0);
    line.position.set(p0.x, p0.y + 0.04, p0.z);
    group.add(line);
    const gantry = new THREE.Group();
    const pillarGeo = new THREE.BoxGeometry(1.2, 9, 1.2);
    const pillarMat = new THREE.MeshStandardMaterial({ color: 0x14101e, metalness: 0.8, roughness: 0.3, envMap });
    for (const side of [-1, 1]) {
      const pl = new THREE.Mesh(pillarGeo, pillarMat);
      pl.position.set(side * (wallOff + 1.4), 4.5, 0);
      gantry.add(pl);
    }
    const bannerTex = bannerTexture('NEON RUSH', theme.wall, 'СТАРТ  ·  ФИНИШ');
    const banner = new THREE.Mesh(new THREE.BoxGeometry(this.width + 4.4, 2.6, 0.6), [
      pillarMat, pillarMat, pillarMat, pillarMat,
      new THREE.MeshBasicMaterial({ map: bannerTex }), new THREE.MeshBasicMaterial({ map: bannerTex }),
    ]);
    banner.position.y = 9.2;
    gantry.add(banner);
    gantry.position.set(p0.x, p0.y, p0.z);
    gantry.rotation.y = p0.heading;
    group.add(gantry);

    // Boost pads
    const padTex = boostPadTexture();
    this.padMaterial = new THREE.MeshBasicMaterial({
      map: padTex, color: new THREE.Color(theme.wall2).multiplyScalar(2.5), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
    });
    padTex.repeat.set(1, 2);
    for (const pad of this.boostPads) {
      const p = this.pointAt(pad.s, pad.lateral);
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(TRACK.BOOST_PAD_WIDTH, TRACK.BOOST_PAD_LENGTH), this.padMaterial);
      mesh.rotation.order = 'YXZ';
      mesh.rotation.set(-Math.PI / 2, p.heading + Math.PI, 0);
      mesh.position.set(p.x, p.y + 0.06, p.z);
      mesh.renderOrder = 3;
      group.add(mesh);
    }

    // Ramps
    for (const r of this.ramps) {
      const geo = this.rampGeometry(r);
      const ramp = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({
        color: 0x1a1428, emissive: new THREE.Color(theme.wall), emissiveMap: wallEm, emissiveIntensity: 1.2, metalness: 0.5, roughness: 0.4, side: THREE.DoubleSide,
      }));
      group.add(ramp);
    }

    return group;
  }

  /** Flat ribbon across the road. fn(i, side) -> [lateral, yOffset]. */
  ribbon(fn, { vScale = 1 / 20 } = {}) {
    const n = this.n;
    const pos = new Float32Array((n + 1) * 2 * 3);
    const uv = new Float32Array((n + 1) * 2 * 2);
    const idx = [];
    for (let k = 0; k <= n; k++) {
      const i = k % n;
      for (let s = 0; s < 2; s++) {
        const side = s === 0 ? -1 : 1;
        const [lat, yo] = fn(i, side);
        const v = (k * 2 + s);
        pos[v * 3] = this.px[i] + this.rx[i] * lat;
        pos[v * 3 + 1] = this.py[i] + yo;
        pos[v * 3 + 2] = this.pz[i] + this.rz[i] * lat;
        uv[v * 2] = s;
        uv[v * 2 + 1] = k * this.step * vScale;
      }
      if (k < n) {
        const a = k * 2, b = a + 1, c = a + 2, d = a + 3;
        idx.push(a, b, c, b, d, c);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  }

  /** Vertical ribbon at a lateral offset between y0 and y1 (relative to road, or absolute bottom). */
  ribbonVertical(lat, y0, y1, absoluteBottom = false) {
    const n = this.n;
    const pos = new Float32Array((n + 1) * 2 * 3);
    const uv = new Float32Array((n + 1) * 2 * 2);
    const idx = [];
    for (let k = 0; k <= n; k++) {
      const i = k % n;
      const x = this.px[i] + this.rx[i] * lat, z = this.pz[i] + this.rz[i] * lat;
      const base = k * 2;
      pos.set([x, absoluteBottom ? y0 : this.py[i] + y0, z, x, this.py[i] + y1, z], base * 3);
      uv.set([k * this.step / 4, 0, k * this.step / 4, 1], base * 2);
      if (k < n) idx.push(base, base + 2, base + 1, base + 1, base + 2, base + 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  }

  rampGeometry(r) {
    const segs = 8;
    const pos = [], uv = [], idx = [];
    const h = this.half;
    for (let k = 0; k <= segs; k++) {
      const s = r.s + (k / segs) * r.len;
      const ht = (k / segs) * RAMP_HEIGHT;
      for (const side of [-1, 1]) {
        const p = this.pointAt(s, side * h);
        pos.push(p.x, p.y + ht + 0.03, p.z);
        uv.push(side < 0 ? 0 : 4, k / segs);
      }
      // front face bottom
    }
    for (let k = 0; k < segs; k++) {
      const a = k * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    // vertical back face
    const end = this.pointAt(r.s + r.len, 0);
    const base = pos.length / 3;
    for (const side of [-1, 1]) {
      const p = this.pointAt(r.s + r.len, side * h);
      pos.push(p.x, end.y + 0.02, p.z, p.x, end.y + RAMP_HEIGHT + 0.03, p.z);
      uv.push(0, 0, 0, 1);
    }
    idx.push(base, base + 1, base + 2, base + 2, base + 1, base + 3);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  }

  /** Normalised 2D outline for the minimap. */
  outline(samples = 200) {
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (let i = 0; i < this.n; i++) {
      minX = Math.min(minX, this.px[i]); maxX = Math.max(maxX, this.px[i]);
      minZ = Math.min(minZ, this.pz[i]); maxZ = Math.max(maxZ, this.pz[i]);
    }
    const pts = [];
    for (let k = 0; k < samples; k++) {
      const i = Math.floor((k / samples) * this.n);
      pts.push([this.px[i], this.pz[i]]);
    }
    return { pts, minX, maxX, minZ, maxZ };
  }

  bounds() {
    const o = this.outline(10);
    return { cx: (o.minX + o.maxX) / 2, cz: (o.minZ + o.maxZ) / 2, r: Math.max(o.maxX - o.minX, o.maxZ - o.minZ) / 2 };
  }

  /** Min distance from (x,z) to centre-line (coarse). */
  distanceTo(x, z) {
    let bd = Infinity;
    for (let i = 0; i < this.n; i += 2) {
      const d = (this.px[i] - x) ** 2 + (this.pz[i] - z) ** 2;
      if (d < bd) bd = d;
    }
    return Math.sqrt(bd);
  }
}

export function lerp(a, b, t) { return a + (b - a) * t; }
export function angleDiff(a, b) {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}
