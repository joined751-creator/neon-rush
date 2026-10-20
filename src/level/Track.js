import * as THREE from 'three';
import { TRACK } from '../core/Constants.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { wallEmissiveTexture, boostPadTexture } from './Textures.js';
import { qualityProfile } from './WorldKit.js';
import { roadMaterial, barrierMaterial } from './RoadMaterials.js';

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
    // low gravity = longer flights: put the ramp early in the straight so cars land before the next bend
    const at = (this.def.gravity ?? 1) < 1 ? 0.28 : 0.5;
    for (const r of cand.slice(0, this.def.ramps ?? 1)) {
      this.ramps.push({ s: (r.a + (r.b - r.a) * at) * this.step, len: TRACK.RAMP_LENGTH });
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

  /** Builds visible geometry into a group (purely visual; physics only uses the centre-line data). */
  build(theme, envMap) {
    const group = new THREE.Group();
    const h = this.half;
    const wallOff = h + TRACK.WALL_OFFSET;
    const qp = qualityProfile();

    // Road: one ribbon with a procedural asphalt + markings shader
    const road = new THREE.Mesh(this.roadGeometry(wallOff + 0.05), roadMaterial(this, theme, envMap, qp));
    road.matrixAutoUpdate = false;
    group.add(road);

    // Barriers: inner face + neon top cap + outer skirt down to the ground, both sides in one mesh
    const bar = new THREE.Mesh(this.barrierGeometry(wallOff, theme.floating), barrierMaterial(theme, envMap));
    bar.matrixAutoUpdate = false;
    group.add(bar);

    // Viaduct pillars + cross beams where the road is elevated (shaded by the barrier material)
    const piers = theme.floating ? null : this.pierGeometry();
    if (piers) group.add(new THREE.Mesh(piers, bar.material));
    if (theme.floating) {
      // hover-track look: glowing neon strips along the bottom edge of the floating deck
      for (const [side, c] of [[-1, theme.wall], [1, theme.wall2]]) {
        const strip = new THREE.Mesh(this.ribbonVertical(side * (wallOff + 0.37), -2.0, -1.72), new THREE.MeshBasicMaterial({ color: new THREE.Color(c).multiplyScalar(2.2), side: THREE.DoubleSide }));
        strip.matrixAutoUpdate = false;
        group.add(strip);
      }
    }

    // Underside
    const under = this.ribbon((i, side) => [side * (wallOff + 0.4), -0.4], { vScale: 0.05 });
    group.add(new THREE.Mesh(under, new THREE.MeshBasicMaterial({ color: 0x050308, side: THREE.BackSide })));

    // Boost pads (one merged mesh; Race animates padMaterial.map.offset)
    const padTex = boostPadTexture();
    this.padMaterial = new THREE.MeshBasicMaterial({
      map: padTex, color: new THREE.Color(theme.wall2).multiplyScalar(2.5), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    });
    padTex.repeat.set(1, 2);
    const pads = [];
    const m4 = new THREE.Matrix4(), e = new THREE.Euler(), q = new THREE.Quaternion(), v = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1);
    for (const pad of this.boostPads) {
      const p = this.pointAt(pad.s, pad.lateral);
      const g = new THREE.PlaneGeometry(TRACK.BOOST_PAD_WIDTH, TRACK.BOOST_PAD_LENGTH);
      e.set(-Math.PI / 2, p.heading + Math.PI, 0, 'YXZ');
      g.applyMatrix4(m4.compose(v.set(p.x, p.y + 0.06, p.z), q.setFromEuler(e), one));
      pads.push(g);
    }
    if (pads.length) {
      const merged = mergeGeometries(pads, false);
      pads.forEach((g) => g.dispose());
      const mesh = new THREE.Mesh(merged, this.padMaterial);
      mesh.renderOrder = 3;
      group.add(mesh);
    } else padTex.dispose();

    // Ramps
    const wallEm = this.ramps.length ? wallEmissiveTexture() : null;
    for (const r of this.ramps) {
      const geo = this.rampGeometry(r);
      const ramp = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({
        color: 0x1a1428, emissive: new THREE.Color(theme.wall), emissiveMap: wallEm, emissiveIntensity: 1.2, metalness: 0.5, roughness: 0.4, side: THREE.DoubleSide,
      }));
      group.add(ramp);
    }

    return group;
  }

  /** Road ribbon with per-vertex data for the road shader: aRoad = (lateral m, s m, kerbLeft, kerbRight), aRoad2 = (racing-line lateral, 0). */
  roadGeometry(halfW) {
    const n = this.n;
    const { kerbL, kerbR, wear } = this.visualProfile();
    const pos = new Float32Array((n + 1) * 2 * 3);
    const a1 = new Float32Array((n + 1) * 2 * 4);
    const a2 = new Float32Array((n + 1) * 2 * 2);
    const idx = new Uint32Array(n * 6);
    for (let k = 0; k <= n; k++) {
      const i = k % n;
      for (let sd = 0; sd < 2; sd++) {
        const lat = sd ? halfW : -halfW;
        const vtx = k * 2 + sd;
        pos[vtx * 3] = this.px[i] + this.rx[i] * lat;
        pos[vtx * 3 + 1] = this.py[i] + 0.02;
        pos[vtx * 3 + 2] = this.pz[i] + this.rz[i] * lat;
        a1.set([lat, k * this.step, kerbL[i], kerbR[i]], vtx * 4);
        a2.set([wear[i], 0], vtx * 2);
      }
      if (k < n) idx.set([k * 2, k * 2 + 1, k * 2 + 2, k * 2 + 1, k * 2 + 3, k * 2 + 2], k * 6);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aRoad', new THREE.BufferAttribute(a1, 4));
    g.setAttribute('aRoad2', new THREE.BufferAttribute(a2, 2));
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    g.computeVertexNormals();
    return g;
  }

  /** Smoothed curvature-driven data for visuals: kerbs on corners, racing-line wear, corner list. Cached. */
  visualProfile() {
    if (this._vis) return this._vis;
    const n = this.n;
    const smooth = (src, R) => {
      const out = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        let s = 0;
        for (let k = -R; k <= R; k++) s += src[this.wrap(i + k)];
        out[i] = s / (2 * R + 1);
      }
      return out;
    };
    const cs = smooth(this.curv, 4);
    const cw = smooth(this.curv, 14);
    const inL = new Float32Array(n), inR = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const c = cs[i];
      if (Math.abs(c) > 0.0105) {
        // inside of a right turn (c > 0) is the +lateral side; the exit-side outer kerb only on sharp bends
        if (c > 0) { inR[i] = 1; if (c > 0.017) inL[i] = 1; } else { inL[i] = 1; if (c < -0.017) inR[i] = 1; }
      }
    }
    const dilate = (src, R) => {
      const out = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        let m = 0;
        for (let k = -R; k <= R && !m; k++) m = src[this.wrap(i + k)];
        out[i] = m;
      }
      return out;
    };
    const R = Math.round(10 / this.step);
    const kerbL = dilate(inL, R), kerbR = dilate(inR, R);
    // keep the start straight clean (grid boxes + checkered band)
    for (let i = 0; i < n; i++) {
      const s = i * this.step;
      if (s < 40 || s > this.length - 60) { kerbL[i] = 0; kerbR[i] = 0; }
    }
    const wear = new Float32Array(n);
    for (let i = 0; i < n; i++) wear[i] = Math.max(-5.5, Math.min(5.5, cw[i] * 420));
    this._vis = { kerbL, kerbR, wear, curvSmooth: cs };
    return this._vis;
  }

  /** Pillars every ~16 m under elevated road sections (aBar attribute so the barrier material can shade them). */
  pierGeometry() {
    const every = Math.max(1, Math.round(16 / this.step));
    const geos = [];
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1);
    const addBox = (w, h, d, x, y, z, i, s) => {
      const g = new THREE.BoxGeometry(w, h, d);
      g.translate(0, h / 2, 0);
      e.set(0, Math.atan2(this.tx[i], this.tz[i]), 0);
      g.applyMatrix4(m.compose(v.set(x, y, z), q.setFromEuler(e), one));
      const n = g.attributes.position.count;
      const a = new Float32Array(n * 4);
      for (let k = 0; k < n; k++) a.set([s + 6, 5 + (g.attributes.position.getY(k) - y), 2, 0], k * 4);
      g.setAttribute('aBar', new THREE.BufferAttribute(a, 4));
      g.deleteAttribute('uv');
      geos.push(g);
    };
    for (let i = 0; i < this.n; i += every) {
      const y = this.py[i];
      if (y < 2.6) continue;
      const s = i * this.step;
      for (const side of [-1, 1]) {
        const lat = side * this.half * 0.55;
        addBox(1.3, y - 1.2 + 0.6, 1.3, this.px[i] + this.rx[i] * lat, -0.6, this.pz[i] + this.rz[i] * lat, i, s);
      }
      addBox(this.width * 0.8, 0.9, 1.5, this.px[i], y - 1.3, this.pz[i], i, s);
    }
    if (!geos.length) return null;
    const merged = mergeGeometries(geos, false);
    geos.forEach((g) => g.dispose());
    return merged;
  }

  /** Barrier profile swept along the track: inner face, top cap, outer skirt to the ground. aBar = (s, v, face, side). */
  barrierGeometry(wallOff, floating = false) {
    const n = this.n;
    const H = TRACK.WALL_HEIGHT, T = 0.35, GROUND = -1.0;
    const faces = 3, perSide = faces * (n + 1) * 2;
    const pos = new Float32Array(perSide * 2 * 3);
    const bar = new Float32Array(perSide * 2 * 4);
    const idx = [];
    let vtx = 0;
    for (const side of [-1, 1]) {
      const s01 = side > 0 ? 1 : 0;
      for (let f = 0; f < faces; f++) {
        const base = vtx;
        for (let k = 0; k <= n; k++) {
          const i = k % n;
          const s = k * this.step;
          const y = this.py[i];
          let A, B; // [lateral, y, v]
          if (f === 0) { A = [wallOff, y, 0]; B = [wallOff, y + H, H]; }
          else if (f === 1) { A = [wallOff, y + H, 0]; B = [wallOff + T, y + H, T]; }
          else {
            // outer fascia: reaches the ground near ground level, becomes a 2 m viaduct edge when elevated
            const bot = floating ? y - 2.0 : Math.max(GROUND, y - 2.0);
            A = [wallOff + T, y + H, 0]; B = [wallOff + T, bot, y + H - bot];
          }
          for (const P of [A, B]) {
            const lat = side * P[0];
            pos[vtx * 3] = this.px[i] + this.rx[i] * lat;
            pos[vtx * 3 + 1] = P[1];
            pos[vtx * 3 + 2] = this.pz[i] + this.rz[i] * lat;
            bar[vtx * 4] = s; bar[vtx * 4 + 1] = P[2]; bar[vtx * 4 + 2] = f; bar[vtx * 4 + 3] = s01;
            vtx++;
          }
          if (k < n) {
            const a = base + k * 2, b = a + 1, c = a + 2, d = a + 3;
            // winding: face 0 normal points at the road, face 1 up, face 2 away from the road
            if (side > 0) idx.push(a, b, c, b, d, c); else idx.push(a, c, b, b, c, d);
          }
        }
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aBar', new THREE.BufferAttribute(bar, 4));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
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
