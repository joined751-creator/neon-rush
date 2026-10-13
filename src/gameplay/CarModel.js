import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { radialTexture, labelTexture } from '../level/Textures.js';

/*
 * Procedural sports cars built by lofting cross-sections along the car's length.
 * Every body has: sculpted side profile, plan-view taper, flared fenders, cut wheel arches,
 * separate greenhouse (glass) and roof panel, LED headlights and light bars, grille, splitter,
 * diffuser, mirrors, exhausts and per-type kits (wing, scoop, side intakes, roof spoiler).
 * Forward = +z, up = +y, origin on the ground under the car centre.
 */

// ----------------------------------------------------------------------------------- body specs
const SPECS = {
  // GT coupe: long hood, fastback roof
  comet: {
    L: 4.5, W: 1.98, r: 0.355, tireW: 0.3, wf: 1.42, wr: -1.36, bot: 0.2,
    top: [[-2.25, 0.86], [-1.65, 0.93], [-1.0, 0.95], [0.55, 0.88], [1.6, 0.74], [2.12, 0.6], [2.25, 0.5]],
    cabin: { zA: 0.6, zB: -0.1, zC: -0.75, zD: -1.7, roof: 1.3, tumble: 0.7 },
    plan: { front: 0.75, frontK: 0.36, rear: 0.55, rearK: 0.22 },
    flare: 0.055, frontPeak: 0.02, rearHaunch: 0.05,
    kit: { spoiler: 'lip', exhaust: 2, caliper: 0xff3040, rimStyle: 5 },
  },
  // Mid-engine hypercar: cab-forward, low nose, big rear haunches, wing
  viper: {
    L: 4.65, W: 2.06, r: 0.36, tireW: 0.33, wf: 1.5, wr: -1.42, bot: 0.17,
    top: [[-2.32, 0.9], [-1.9, 0.98], [-0.6, 0.98], [0.95, 0.76], [1.7, 0.6], [2.2, 0.44], [2.32, 0.36]],
    cabin: { zA: 0.98, zB: 0.32, zC: -0.25, zD: -1.25, roof: 1.15, tumble: 0.62 },
    plan: { front: 0.8, frontK: 0.42, rear: 0.4, rearK: 0.14 },
    flare: 0.1, frontPeak: 0.07, rearHaunch: 0.1,
    kit: { spoiler: 'wing', exhaust: 4, caliper: 0xffd000, rimStyle: 10, intakes: true, engineVents: true },
  },
  // Muscle car: tall square body, notchback, hood scoop
  titan: {
    L: 4.85, W: 2.06, r: 0.39, tireW: 0.34, wf: 1.52, wr: -1.46, bot: 0.22,
    top: [[-2.42, 0.98], [-1.8, 1.0], [-1.25, 1.0], [0.25, 0.98], [1.6, 0.92], [2.3, 0.86], [2.42, 0.78]],
    cabin: { zA: 0.25, zB: -0.35, zC: -0.95, zD: -1.42, roof: 1.42, tumble: 0.8 },
    plan: { front: 0.35, frontK: 0.12, rear: 0.3, rearK: 0.1 },
    flare: 0.07, frontPeak: 0.0, rearHaunch: 0.06,
    kit: { spoiler: 'duck', exhaust: 2, caliper: 0xff8a00, rimStyle: 6, scoop: true, stripes: true },
  },
  // Hot hatch: short, tall, roof spoiler
  spark: {
    L: 3.95, W: 1.88, r: 0.335, tireW: 0.28, wf: 1.25, wr: -1.2, bot: 0.21,
    top: [[-1.97, 1.0], [-1.7, 1.02], [0.7, 0.92], [1.5, 0.8], [1.88, 0.68], [1.97, 0.58]],
    cabin: { zA: 0.72, zB: 0.12, zC: -1.45, zD: -1.85, roof: 1.46, tumble: 0.78 },
    plan: { front: 0.55, frontK: 0.3, rear: 0.35, rearK: 0.16 },
    flare: 0.065, frontPeak: 0.02, rearHaunch: 0.05,
    kit: { spoiler: 'roof', exhaust: 1, caliper: 0x00d0ff, rimStyle: 7, hatch: true },
  },
};

// ----------------------------------------------------------------------------------- helpers
/** Catmull-Rom interpolation over sorted [x, y] pairs, clamped at the ends. */
function curve1D(pts, x) {
  if (x <= pts[0][0]) return pts[0][1];
  const n = pts.length;
  if (x >= pts[n - 1][0]) return pts[n - 1][1];
  let i = 0;
  while (i < n - 2 && x > pts[i + 1][0]) i++;
  const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(n - 1, i + 2)];
  const t = (x - p1[0]) / (p2[0] - p1[0]);
  const m1 = (p2[1] - p0[1]) / Math.max(1e-4, p2[0] - p0[0]) * (p2[0] - p1[0]);
  const m2 = (p3[1] - p1[1]) / Math.max(1e-4, p3[0] - p1[0]) * (p2[0] - p1[0]);
  const t2 = t * t, t3 = t2 * t;
  return (2 * t3 - 3 * t2 + 1) * p1[1] + (t3 - 2 * t2 + t) * m1 + (-2 * t3 + 3 * t2) * p2[1] + (t3 - t2) * m2;
}
const gauss = (x, s) => Math.exp(-(x * x) / (s * s));
const clamp01 = (x) => Math.min(1, Math.max(0, x));

class BodyShape {
  constructor(S) {
    this.S = S;
    this.nose = S.L / 2;
    this.tail = -S.L / 2;
    this.wheelY = S.r;
  }
  top(z) {
    const S = this.S;
    let y = curve1D(S.top, z);
    // fender peaks over the wheels
    y += S.frontPeak * gauss(z - S.wf, 0.45) + S.rearHaunch * 0.6 * gauss(z - S.wr, 0.55);
    return y;
  }
  bot(z) {
    const S = this.S;
    let b = S.bot;
    if (z > S.wf + S.r) b += (z - S.wf - S.r) * 0.06; // front overhang lift
    if (z < S.wr - S.r) b += (S.wr - S.r - z) * 0.22; // diffuser rise
    return b;
  }
  hw(z) {
    const S = this.S, P = S.plan;
    let w = S.W / 2 - S.flare;
    const fz = z - (this.nose - P.front);
    if (fz > 0) w *= Math.sqrt(Math.max(0.05, 1 - (fz / P.front) ** 2 * P.frontK * 2));
    const rz = this.tail + P.rear - z;
    if (rz > 0) w *= Math.sqrt(Math.max(0.05, 1 - (rz / P.rear) ** 2 * P.rearK * 2));
    return w;
  }
  flare(z) {
    const S = this.S;
    return S.flare * Math.max(gauss(z - S.wf, 0.62), gauss(z - S.wr, 0.68) * (1 + S.rearHaunch * 4));
  }
  /** Height of the wheel-arch cut at z (or -1 when outside arches). */
  arch(z) {
    const S = this.S;
    const R = S.r + 0.075;
    for (const wz of [S.wf, S.wr]) {
      const d = Math.abs(z - wz);
      if (d < R) return this.wheelY + Math.sqrt(R * R - d * d) * 0.98;
    }
    return -1;
  }
  /** Right-half cross-section points [x, y, shade] bottom→top. */
  section(z) {
    const top = this.top(z), bot = this.bot(z), hw = this.hw(z), fl = this.flare(z);
    const mid = bot + (top - bot) * 0.42;
    const sh = top - Math.min(0.14, (top - bot) * 0.25);
    const crown = 0.035;
    const pts = [
      [0, bot, 0.12],
      [hw * 0.72, bot, 0.12],
      [hw * 0.94, bot + 0.035, 0.2],
      [hw * 0.985 + fl * 0.85, bot + 0.13, 0.9],
      [hw + fl, mid, 1],
      [hw * 0.995 + fl * 0.75, sh, 1],
      [hw * 0.955 + fl * 0.35, top - 0.025, 1],
      [hw * 0.8, top + crown * 0.55 + fl * 0.5, 1],
      [hw * 0.45, top + crown * 0.9, 1],
      [0, top + crown, 1],
    ];
    const a = this.arch(z);
    if (a > 0) {
      for (let k = 1; k <= 4; k++) {
        if (pts[k][1] < a) { pts[k][1] = a + (k === 4 ? 0.02 : 0); pts[k][2] = k >= 3 ? 0.35 : 0.08; }
      }
      // keep the profile monotone upwards
      for (let k = 5; k < pts.length; k++) if (pts[k][1] < pts[k - 1][1] + 0.01) pts[k][1] = pts[k - 1][1] + 0.01;
    }
    return pts;
  }
  /** Greenhouse height at z (belt when outside the cabin). */
  glassTop(z) {
    const C = this.S.cabin;
    if (z >= C.zA || z <= C.zD) return this.top(z);
    const pts = [[C.zD, this.top(C.zD)], [C.zC, C.roof - 0.03], [(C.zB + C.zC) / 2, C.roof], [C.zB, C.roof - 0.02], [C.zA, this.top(C.zA)]];
    if (this.S.kit.hatch) pts.splice(1, 1, [C.zC + 0.05, C.roof - 0.01]);
    return curve1D(pts, z);
  }
}

/** Builds a ring-lofted closed mesh from sections (array of rings of [x,y,z,shade]). */
function loftClosed(rings) {
  const n = rings.length, m = rings[0].length;
  const pos = [], col = [], idx = [];
  for (const ring of rings) for (const p of ring) { pos.push(p[0], p[1], p[2]); col.push(p[3], p[3], p[3]); }
  for (let i = 0; i < n - 1; i++) {
    for (let j = 0; j < m; j++) {
      const a = i * m + j, b = i * m + ((j + 1) % m), c = (i + 1) * m + j, d = (i + 1) * m + ((j + 1) % m);
      idx.push(a, b, c, b, d, c);
    }
  }
  // caps (fans)
  for (const [ri, flip] of [[0, true], [n - 1, false]]) {
    const ring = rings[ri];
    let cx = 0, cy = 0, cz = 0;
    for (const p of ring) { cx += p[0]; cy += p[1]; cz += p[2]; }
    const c = pos.length / 3;
    pos.push(cx / m, cy / m, cz / m); col.push(0.6, 0.6, 0.6);
    for (let j = 0; j < m; j++) {
      const a = ri * m + j, b = ri * m + ((j + 1) % m);
      if (flip) idx.push(c, b, a); else idx.push(c, a, b);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** Open strip loft (rings not closed). */
function loftOpen(rings) {
  const n = rings.length, m = rings[0].length;
  const pos = [], idx = [], uv = [];
  rings.forEach((ring, i) => ring.forEach((p, j) => { pos.push(p[0], p[1], p[2]); uv.push(j / (m - 1), i / (n - 1)); }));
  for (let i = 0; i < n - 1; i++) for (let j = 0; j < m - 1; j++) {
    const a = i * m + j, b = a + 1, c = a + m, d = c + 1;
    idx.push(a, b, c, b, d, c);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function tube(points, radius, seg = 24) {
  const c = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)));
  return new THREE.TubeGeometry(c, seg, radius, 6, false);
}

// ----------------------------------------------------------------------------------- textures
let flakeTex = null, treadTex = null, carbonTex = null, glowTex = null, shadowTex = null;
function flakeNormal() {
  if (flakeTex) return flakeTex;
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d');
  const img = g.createImageData(128, 128);
  for (let i = 0; i < img.data.length; i += 4) {
    img.data[i] = 128 + (Math.random() - 0.5) * 120;
    img.data[i + 1] = 128 + (Math.random() - 0.5) * 120;
    img.data[i + 2] = 255; img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  flakeTex = new THREE.CanvasTexture(c);
  flakeTex.wrapS = flakeTex.wrapT = THREE.RepeatWrapping;
  flakeTex.repeat.set(6, 6);
  flakeTex.magFilter = THREE.NearestFilter;
  return flakeTex;
}
function treadNormal() {
  if (treadTex) return treadTex;
  const c = document.createElement('canvas'); c.width = 64; c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = 'rgb(128,128,255)'; g.fillRect(0, 0, 64, 256);
  for (let y = 0; y < 256; y += 16) {
    g.fillStyle = 'rgb(128,40,200)'; g.fillRect(0, y, 64, 3);
    g.fillStyle = 'rgb(128,216,200)'; g.fillRect(0, y + 8, 64, 3);
    g.fillStyle = 'rgb(40,128,200)'; g.fillRect(20, y, 3, 16);
  }
  treadTex = new THREE.CanvasTexture(c);
  treadTex.wrapS = treadTex.wrapT = THREE.RepeatWrapping;
  treadTex.repeat.set(1, 3);
  return treadTex;
}
function carbon() {
  if (carbonTex) return carbonTex;
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  for (let y = 0; y < 64; y += 8) for (let x = 0; x < 64; x += 8) {
    const odd = ((x + y) / 8) % 2;
    const gr = g.createLinearGradient(x, y, odd ? x + 8 : x, odd ? y : y + 8);
    gr.addColorStop(0, '#1b1c22'); gr.addColorStop(0.5, '#383a44'); gr.addColorStop(1, '#16171c');
    g.fillStyle = gr; g.fillRect(x, y, 8, 8);
  }
  carbonTex = new THREE.CanvasTexture(c);
  carbonTex.wrapS = carbonTex.wrapT = THREE.RepeatWrapping;
  carbonTex.repeat.set(4, 4);
  carbonTex.colorSpace = THREE.SRGBColorSpace;
  return carbonTex;
}

// ----------------------------------------------------------------------------------- geometry cache
const geoCache = new Map();
function shared(g) { g.userData.shared = true; return g; }

function buildGeometries(typeId) {
  if (geoCache.has(typeId)) return geoCache.get(typeId);
  const S = SPECS[typeId];
  const B = new BodyShape(S);
  const N = 72;
  const zs = [];
  for (let i = 0; i <= N; i++) {
    // denser sampling near the ends for smooth nose/tail
    const t = i / N;
    const u = 0.5 - 0.5 * Math.cos(t * Math.PI);
    zs.push(B.tail + 0.01 + (B.nose - B.tail - 0.02) * (t * 0.35 + u * 0.65));
  }
  const rings = zs.map((z) => {
    const half = B.section(z);
    const ring = half.map(([x, y, s]) => [x, y, z, s]);
    for (let k = half.length - 2; k >= 1; k--) ring.push([-half[k][0], half[k][1], z, half[k][2]]);
    return ring;
  });
  // close nose & tail a bit more: shrink the extreme rings toward their centre
  for (const [ri, k] of [[0, 0.82], [rings.length - 1, 0.86]]) {
    const r = rings[ri];
    let cy = 0; for (const p of r) cy += p[1]; cy /= r.length;
    for (const p of r) { p[0] *= k; p[1] = cy + (p[1] - cy) * k; }
  }
  const body = shared(loftClosed(rings));

  // Greenhouse
  const C = S.cabin;
  const gz = [];
  const GN = 40;
  for (let i = 0; i <= GN; i++) gz.push(C.zD + (C.zA - C.zD) * (i / GN));
  const gRings = gz.map((z) => {
    const belt = B.top(z) - 0.012;
    const gt = B.glassTop(z);
    const hb = B.hw(z) * 0.9 + B.flare(z) * 0.2;
    const hr = hb * S.cabin.tumble;
    const h = Math.max(0, gt - belt);
    const ptsR = [[hb, belt], [hb * 0.985, belt + h * 0.3], [hr + (hb - hr) * 0.25, belt + h * 0.82], [hr, gt - Math.min(0.03, h * 0.2)], [hr * 0.55, gt], [0, gt + 0.008]];
    const ring = ptsR.map(([x, y]) => [x, y, z]);
    for (let k = ptsR.length - 2; k >= 0; k--) ring.push([-ptsR[k][0], ptsR[k][1], z]);
    return ring;
  });
  const glass = shared(loftOpen(gRings));
  // Roof panel (painted) — inner part of the greenhouse, slightly raised
  const roofRings = gRings.filter((_, i) => {
    const z = gz[i];
    return z < C.zB + 0.06 && z > C.zC - (S.kit.hatch ? 0.0 : 0.06);
  }).map((ring) => ring.slice(3, ring.length - 3).map(([x, y, z]) => [x * 1.006, y + 0.006, z]));
  const roof = roofRings.length > 1 ? shared(loftOpen(roofRings)) : null;

  // Light geometry
  const lights = {};
  const findZ = (x, fromNose) => {
    if (fromNose) { for (let z = B.nose; z > 0; z -= 0.01) if (B.hw(z) + B.flare(z) * 0.5 >= Math.abs(x) + 0.02) return z; }
    else { for (let z = B.tail; z < 0; z += 0.01) if (B.hw(z) + B.flare(z) * 0.5 >= Math.abs(x) + 0.02) return z; }
    return 0;
  };
  const head = [];
  for (const side of [-1, 1]) {
    const pts = [];
    for (let k = 0; k <= 6; k++) {
      const x = side * (0.38 + k * 0.08) * (S.W / 2);
      const z = findZ(x, true) - 0.02;
      const y = B.top(z) - 0.07 - k * 0.012;
      pts.push([x, y, z + 0.01]);
    }
    head.push(tube(pts, 0.026, 16));
    // lower DRL hook
    const z0 = findZ(side * 0.86 * S.W / 2, true);
    head.push(tube([[side * 0.86 * S.W / 2, B.top(z0) - 0.1, z0], [side * 0.8 * S.W / 2, B.top(z0) - 0.2, findZ(side * 0.8 * S.W / 2, true) + 0.01]], 0.02, 4));
  }
  lights.head = shared(mergeGeometries(head));
  const tail = [];
  {
    const pts = [];
    for (let k = -8; k <= 8; k++) {
      const x = (k / 8) * (S.W / 2) * 0.86;
      const z = findZ(x, false) + 0.01;
      pts.push([x, B.top(z) - 0.09, z - 0.012]);
    }
    tail.push(tube(pts, 0.028, 40));
    for (const side of [-1, 1]) {
      const x = side * S.W / 2 * 0.78;
      const z = findZ(x, false);
      tail.push(tube([[x, B.top(z) - 0.09, z - 0.01], [x * 0.95, B.top(z) - 0.2, findZ(x * 0.95, false) - 0.01]], 0.03, 4));
    }
  }
  lights.tail = shared(mergeGeometries(tail));

  // Window trims: belt line, roof edge and A-pillars (dark rubber/chrome look)
  const trim = [];
  for (const side of [-1, 1]) {
    const belt = gRings.map((ring) => [ring[0][0] * side * 1.01, ring[0][1] + 0.01, ring[0][2]]);
    trim.push(tube(belt, 0.018, 40));
    const edge = gRings.map((ring) => [ring[2][0] * side * 1.01, ring[2][1] + 0.005, ring[2][2]]);
    trim.push(tube(edge, 0.03, 40));
    // A-pillar: from belt at windshield base up to the roof front corner
    const front = gRings.filter((_, i) => gz[i] >= C.zB - 0.05);
    trim.push(tube(front.map((ring) => [ring[2][0] * side * 1.012, ring[2][1] + 0.01, ring[2][2]]), 0.045, 16));
    // C-pillar band
    const rear = gRings.filter((_, i) => gz[i] <= C.zC + 0.05);
    if (rear.length > 1) trim.push(tube(rear.map((ring) => [ring[2][0] * side * 1.012, ring[2][1] + 0.01, ring[2][2]]), 0.05, 16));
  }
  const trims = shared(mergeGeometries(trim));

  const out = { S, B, body, glass, roof, lights, trims, gz, gRings };
  geoCache.set(typeId, out);
  return out;
}

// ----------------------------------------------------------------------------------- wheels
const wheelGeoCache = new Map();
function wheelGeometries(r, tw, spokes) {
  const key = `${r}-${tw}-${spokes}`;
  if (wheelGeoCache.has(key)) return wheelGeoCache.get(key);
  // Tyre: lathe of a rounded profile, axis = x
  const prof = [];
  const rr = r * 0.66;
  const steps = 10;
  prof.push(new THREE.Vector2(rr, -tw / 2));
  for (let i = 0; i <= steps; i++) {
    const a = -Math.PI / 2 + (i / steps) * Math.PI;
    prof.push(new THREE.Vector2(r - 0.045 + Math.cos(a) * 0.045, Math.sin(a) * (tw / 2 - 0.01) * 1.0 + 0));
  }
  prof.push(new THREE.Vector2(rr, tw / 2));
  // lathe makes axis y; we need side bulge: build directly
  const tyre = new THREE.LatheGeometry(prof.map((p) => new THREE.Vector2(p.x, p.y)), 36);
  tyre.rotateZ(Math.PI / 2);
  // Rim: extruded spoke disc
  const shape = new THREE.Shape();
  shape.absarc(0, 0, rr * 0.99, 0, Math.PI * 2, false);
  const hub = r * 0.13;
  const holeR1 = r * 0.2, holeR2 = rr * 0.86;
  for (let k = 0; k < spokes; k++) {
    const a0 = (k / spokes) * Math.PI * 2 + (Math.PI / spokes) * 0.32;
    const a1 = ((k + 1) / spokes) * Math.PI * 2 - (Math.PI / spokes) * 0.32;
    const hole = new THREE.Path();
    hole.moveTo(Math.cos(a0) * holeR1, Math.sin(a0) * holeR1);
    hole.lineTo(Math.cos(a0) * holeR2, Math.sin(a0) * holeR2);
    hole.absarc(0, 0, holeR2, a0, a1, false);
    hole.lineTo(Math.cos(a1) * holeR1, Math.sin(a1) * holeR1);
    hole.absarc(0, 0, holeR1, a1, a0, true);
    shape.holes.push(hole);
  }
  const rim = new THREE.ExtrudeGeometry(shape, { depth: 0.05, bevelEnabled: true, bevelThickness: 0.015, bevelSize: 0.012, bevelSegments: 2, curveSegments: 18 });
  rim.rotateY(Math.PI / 2);
  const barrel = new THREE.CylinderGeometry(rr, rr, tw * 0.85, 24, 1, true).rotateZ(Math.PI / 2);
  const disc = new THREE.CylinderGeometry(rr * 0.82, rr * 0.82, 0.03, 28).rotateZ(Math.PI / 2);
  const cap = new THREE.CylinderGeometry(hub, hub, 0.08, 12).rotateZ(Math.PI / 2);
  const caliper = new THREE.BoxGeometry(0.07, r * 0.42, r * 0.24);
  const ring = new THREE.TorusGeometry(rr * 1.0, 0.012, 6, 40).rotateY(Math.PI / 2);
  const out = { tyre, rim, barrel, disc, cap, caliper, ring };
  for (const g of Object.values(out)) shared(g);
  wheelGeoCache.set(key, out);
  return out;
}

// ----------------------------------------------------------------------------------- materials
function materials(colorHex, ghost, kit) {
  const accent = new THREE.Color(colorHex);
  if (ghost) {
    const gm = new THREE.MeshBasicMaterial({ color: accent, transparent: true, opacity: 0.22, depthWrite: false, blending: THREE.AdditiveBlending });
    return { paint: gm, glass: gm, dark: gm, carbon: gm, chrome: gm, tyre: gm, rim: gm, caliper: gm, neon: gm, head: gm, tail: gm, disc: gm, roof: gm, accent };
  }
  const paintColor = accent.clone();
  const hsl = {}; paintColor.getHSL(hsl);
  paintColor.setHSL(hsl.h, Math.min(1, hsl.s * 0.95), Math.min(0.55, hsl.l * 0.8));
  const paint = new THREE.MeshPhysicalMaterial({
    color: paintColor, metalness: 0.65, roughness: 0.32, clearcoat: 1, clearcoatRoughness: 0.035,
    normalMap: flakeNormal(), normalScale: new THREE.Vector2(0.12, 0.12), vertexColors: true, envMapIntensity: 1.25,
  });
  const glass = new THREE.MeshPhysicalMaterial({
    color: 0x070a12, metalness: 0.2, roughness: 0.03, envMapIntensity: 2.4, clearcoat: 1, side: THREE.DoubleSide,
    transparent: true, opacity: 0.92,
  });
  const dark = new THREE.MeshStandardMaterial({ color: 0x0b0b10, metalness: 0.3, roughness: 0.6 });
  const carbonM = new THREE.MeshPhysicalMaterial({ map: carbon(), metalness: 0.4, roughness: 0.35, clearcoat: 1, clearcoatRoughness: 0.1 });
  const chrome = new THREE.MeshStandardMaterial({ color: 0xd8dce6, metalness: 1, roughness: 0.12, envMapIntensity: 1.6 });
  const tyre = new THREE.MeshStandardMaterial({ color: 0x141416, roughness: 0.92, normalMap: treadNormal(), normalScale: new THREE.Vector2(0.6, 0.6) });
  const rim = new THREE.MeshStandardMaterial({ color: kit.rimStyle === 10 ? 0x22242c : 0xb8bcc8, metalness: 1, roughness: 0.22, envMapIntensity: 1.5 });
  const caliper = new THREE.MeshStandardMaterial({ color: kit.caliper, metalness: 0.3, roughness: 0.35, emissive: kit.caliper, emissiveIntensity: 0.15 });
  const disc = new THREE.MeshStandardMaterial({ color: 0x5a5c64, metalness: 0.9, roughness: 0.45 });
  const neon = new THREE.MeshBasicMaterial({ color: accent.clone().multiplyScalar(2.4) });
  const head = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xe6f6ff).multiplyScalar(3.2) });
  const tail = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff1030).multiplyScalar(1.6) });
  const roof = kit.spoiler === 'wing' ? carbonM : paint;
  return { paint, glass, dark, carbon: carbonM, chrome, tyre, rim, caliper, neon, head, tail, disc, roof, accent };
}

// ----------------------------------------------------------------------------------- main builder
let flameGeo = null;

export function buildCarModel(typeId, colorHex, { label = null, ghost = false, tagLayer = 0, beams = true } = {}) {
  const geo = buildGeometries(SPECS[typeId] ? typeId : 'comet');
  const { S, B } = geo;
  const kit = S.kit;
  const M = materials(colorHex, ghost, kit);
  glowTex ||= radialTexture('rgba(255,255,255,1)', 'rgba(255,255,255,0)');
  shadowTex ||= radialTexture('rgba(0,0,0,0.9)', 'rgba(0,0,0,0)');

  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const add = (g, m, parent = body) => { const mesh = new THREE.Mesh(g, m); parent.add(mesh); return mesh; };

  add(geo.body, M.paint);
  add(geo.glass, M.glass);
  if (geo.roof) add(geo.roof, M.roof);
  add(geo.trims, kit.spoiler === 'wing' ? M.carbon : M.paint);
  add(geo.lights.head, M.head);
  add(geo.lights.tail, M.tail);

  const nose = B.nose, tail = B.tail;
  const half = S.W / 2;
  // Grille + splitter
  const grille = add(new THREE.BoxGeometry(half * 1.05, 0.16, 0.08), M.dark);
  grille.position.set(0, B.bot(nose) + 0.14, nose - 0.08);
  const splitter = add(new THREE.BoxGeometry(half * 1.7, 0.025, 0.22), M.carbon);
  splitter.position.set(0, B.bot(nose) - 0.01, nose - 0.12);
  // Side skirts
  for (const side of [-1, 1]) {
    const skirt = add(new THREE.BoxGeometry(0.05, 0.06, Math.abs(S.wf - S.wr) - S.r * 2 - 0.1), M.carbon);
    skirt.position.set(side * (B.hw(0) + B.flare(0) * 0.6 + 0.005), S.bot + 0.04, (S.wf + S.wr) / 2);
  }
  // Diffuser with fins
  const diff = add(new THREE.BoxGeometry(half * 1.45, 0.05, 0.4), M.carbon);
  diff.position.set(0, B.bot(tail + 0.25) - 0.01, tail + 0.22);
  diff.rotation.x = -0.22;
  for (let k = -2; k <= 2; k++) {
    const fin = add(new THREE.BoxGeometry(0.02, 0.12, 0.34), M.carbon);
    fin.position.set(k * 0.22, B.bot(tail + 0.25) + 0.03, tail + 0.2);
  }
  // Exhausts
  const exGeo = new THREE.CylinderGeometry(0.05, 0.055, 0.2, 14, 1, true).rotateX(Math.PI / 2);
  const exPos = kit.exhaust === 4 ? [-0.32, -0.2, 0.2, 0.32] : kit.exhaust === 2 ? [-0.55, 0.55] : [0.5];
  const exhausts = [];
  for (const x of exPos) {
    const e = add(exGeo, M.chrome);
    e.position.set(x, B.bot(tail + 0.1) + 0.08, tail + 0.04);
    const inner = add(new THREE.CircleGeometry(0.045, 12), M.dark);
    inner.position.set(x, B.bot(tail + 0.1) + 0.08, tail - 0.05);
    inner.rotation.y = Math.PI;
    exhausts.push(e.position.clone());
  }
  // Mirrors
  for (const side of [-1, 1]) {
    const z = S.cabin.zA - 0.12;
    const y = B.top(z) + 0.08;
    const x = side * (B.hw(z) * 0.92 + 0.12);
    const m = add(new THREE.SphereGeometry(0.1, 12, 8), M.paint);
    m.scale.set(0.7, 0.55, 1.1);
    m.position.set(x, y, z);
    const stalk = add(new THREE.BoxGeometry(0.12, 0.025, 0.05), M.dark);
    stalk.position.set(x - side * 0.08, y - 0.03, z);
  }
  // Kits
  if (kit.spoiler === 'wing') {
    const wz = tail + 0.35;
    const wing = add(new THREE.BoxGeometry(S.W * 0.96, 0.035, 0.42), M.carbon);
    wing.position.set(0, B.top(wz) + 0.36, wz);
    wing.rotation.x = -0.14;
    const lip = add(new THREE.BoxGeometry(S.W * 0.96, 0.012, 0.02), M.neon);
    lip.position.set(0, B.top(wz) + 0.39, wz - 0.2);
    for (const side of [-1, 1]) {
      const plate = add(new THREE.BoxGeometry(0.025, 0.18, 0.5), M.carbon);
      plate.position.set(side * S.W * 0.48, B.top(wz) + 0.36, wz);
      const strut = add(new THREE.BoxGeometry(0.04, 0.34, 0.12), M.carbon);
      strut.position.set(side * 0.42, B.top(wz) + 0.17, wz + 0.04);
      strut.rotation.x = 0.2;
    }
  } else if (kit.spoiler === 'lip') {
    const z = tail + 0.18;
    const lip = add(new THREE.BoxGeometry(S.W * 0.82, 0.03, 0.18), M.carbon);
    lip.position.set(0, B.top(z) + 0.05, z);
    lip.rotation.x = -0.3;
  } else if (kit.spoiler === 'duck') {
    const z = tail + 0.16;
    const duck = add(new THREE.BoxGeometry(S.W * 0.86, 0.06, 0.26), M.paint);
    duck.position.set(0, B.top(z) + 0.05, z);
    duck.rotation.x = -0.32;
  } else if (kit.spoiler === 'roof') {
    const z = S.cabin.zC - 0.02;
    const rs = add(new THREE.BoxGeometry(S.W * 0.62, 0.035, 0.3), M.carbon);
    rs.position.set(0, S.cabin.roof + 0.02, z - 0.06);
    rs.rotation.x = 0.18;
  }
  if (kit.scoop) {
    const sc = add(new THREE.BoxGeometry(0.62, 0.12, 0.9), M.paint);
    sc.position.set(0, B.top(1.15) + 0.04, 1.15);
    sc.rotation.x = 0.05;
    const mouth = add(new THREE.BoxGeometry(0.5, 0.07, 0.02), M.dark);
    mouth.position.set(0, B.top(1.15) + 0.07, 1.61);
  }
  if (kit.stripes && !ghost) {
    for (const off of [-0.18, 0.18]) {
      const stripePts = [];
      for (let z = S.cabin.zA + 0.05; z <= nose - 0.12; z += 0.08) stripePts.push([off, B.top(z) + 0.036 + 0.004, z]);
      const st = new THREE.Mesh(tube(stripePts, 0.006, 40), new THREE.MeshPhysicalMaterial({ color: 0x9a9aa6, clearcoat: 1, roughness: 0.4, metalness: 0.2 }));
      st.scale.set(14, 1, 1);
      st.position.x = off * -13;
      body.add(st);
    }
  }
  if (kit.intakes) {
    for (const side of [-1, 1]) {
      const z = -0.35;
      const intake = add(new THREE.SphereGeometry(0.3, 16, 10), M.dark);
      intake.scale.set(0.25, 0.45, 1.3);
      intake.position.set(side * (B.hw(z) + B.flare(z) * 0.6 + 0.0), (B.bot(z) + B.top(z)) / 2, z);
    }
  }
  if (kit.engineVents) {
    for (let k = 0; k < 5; k++) {
      const z = tail + 0.55 + k * 0.12;
      const v = add(new THREE.BoxGeometry(0.9, 0.02, 0.05), M.dark);
      v.position.set(0, B.top(z) + 0.04, z);
    }
  }
  // Rear licence plate (blank)
  const plate = add(new THREE.PlaneGeometry(0.46, 0.11), new THREE.MeshStandardMaterial({ color: 0xe8e8ee, roughness: 0.5 }));
  plate.position.set(0, B.bot(tail + 0.05) + 0.24, tail - 0.005);
  plate.rotation.y = Math.PI;

  // Wheels
  const W = wheelGeometries(S.r, S.tireW, kit.rimStyle);
  const wheels = [];
  for (const [side, z] of [[-1, S.wf], [1, S.wf], [-1, S.wr], [1, S.wr]]) {
    const pivot = new THREE.Group();
    const x = side * (B.hw(z) + B.flare(z) * 0.55 - S.tireW / 2 + 0.01);
    pivot.position.set(x, S.r, z);
    const spin = new THREE.Group();
    spin.add(new THREE.Mesh(W.tyre, M.tyre));
    const barrel = new THREE.Mesh(W.barrel, M.dark);
    spin.add(barrel);
    const disc = new THREE.Mesh(W.disc, M.disc);
    disc.position.x = -side * 0.03;
    spin.add(disc);
    const rim = new THREE.Mesh(W.rim, M.rim);
    rim.position.x = side * (S.tireW / 2 - 0.07);
    if (side < 0) { rim.rotation.y = Math.PI; rim.position.x = side * (S.tireW / 2 - 0.07); }
    spin.add(rim);
    const cap = new THREE.Mesh(W.cap, M.neon);
    cap.position.x = side * (S.tireW / 2 - 0.03);
    spin.add(cap);
    const ring = new THREE.Mesh(W.ring, M.neon);
    ring.position.x = side * (S.tireW / 2 - 0.035);
    spin.add(ring);
    pivot.add(spin);
    const caliper = new THREE.Mesh(W.caliper, M.caliper);
    caliper.position.set(side * 0.02, S.r * 0.28, z > 0 ? -S.r * 0.3 : S.r * 0.3);
    pivot.add(caliper);
    body.add(pivot);
    wheels.push({ pivot, spin, front: z > 0 });
  }

  // Underglow
  const glow = new THREE.Mesh(
    new THREE.PlaneGeometry(S.W * 2.2, S.L * 1.4),
    new THREE.MeshBasicMaterial({ map: glowTex, color: M.accent.clone().multiplyScalar(1.3), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: ghost ? 0.25 : 0.85 }),
  );
  glow.rotation.x = -Math.PI / 2;
  glow.position.y = 0.06;
  glow.renderOrder = 3;
  root.add(glow);

  let shadow = null;
  if (!ghost) {
    shadow = new THREE.Mesh(new THREE.PlaneGeometry(S.W * 1.45, S.L * 1.15), new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false }));
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.04;
    shadow.renderOrder = 2;
    root.add(shadow);
  }

  // Exhaust flames (boost / backfire)
  flameGeo ||= shared(new THREE.ConeGeometry(0.11, 1, 10, 1, true).rotateX(-Math.PI / 2).translate(0, 0, -0.5));
  const flames = [];
  const flameMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0x6fd8ff).multiplyScalar(3), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
  for (const p of exhausts) {
    const f = new THREE.Mesh(flameGeo, flameMat);
    f.position.set(p.x, p.y, tail - 0.04);
    f.visible = false;
    body.add(f);
    flames.push(f);
  }

  // Headlight beams (fake volumetric cones)
  const beamMat = new THREE.MeshBasicMaterial({ color: 0x9fd8ff, transparent: true, opacity: ghost ? 0 : 0.028, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  const beamGeo = new THREE.ConeGeometry(1.4, 8, 16, 1, true).rotateX(-Math.PI / 2).translate(0, 0, 4.5);
  for (const side of beams ? [-1, 1] : []) {
    const beam = new THREE.Mesh(beamGeo, beamMat);
    beam.position.set(side * half * 0.6, B.top(nose - 0.2) - 0.1, nose - 0.1);
    beam.rotation.x = 0.06;
    beam.renderOrder = 4;
    body.add(beam);
  }

  // Shield bubble
  const shieldMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    uniforms: { uColor: { value: new THREE.Color(0x6fe8ff) }, uTime: { value: 0 } },
    vertexShader: `varying vec3 vN; varying vec3 vV; varying vec3 vP;
      void main(){ vec4 mv = modelViewMatrix*vec4(position,1.); vN = normalize(normalMatrix*normal); vV = normalize(-mv.xyz); vP = position; gl_Position = projectionMatrix*mv; }`,
    fragmentShader: `uniform vec3 uColor; uniform float uTime; varying vec3 vN; varying vec3 vV; varying vec3 vP;
      void main(){ float f = pow(1.0 - abs(dot(vN, vV)), 2.2); float hex = 0.5 + 0.5*sin(vP.y*8.0 + uTime*6.0);
      gl_FragColor = vec4(uColor * (f*1.6 + hex*0.12), f*0.9 + 0.05); }`,
  });
  const shield = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 16), shieldMat);
  shield.scale.set(S.W * 0.9, 1.3, S.L * 0.62);
  shield.position.y = 0.75;
  shield.visible = false;
  root.add(shield);

  let tag = null;
  if (label) {
    tag = new THREE.Sprite(new THREE.SpriteMaterial({ map: labelTexture(label, colorHex), depthTest: false, transparent: true }));
    tag.scale.set(2.4, 1.2, 1);
    tag.position.y = 2.8;
    tag.renderOrder = 20;
    if (tagLayer) tag.layers.set(tagLayer);
    root.add(tag);
  }

  return {
    root, body, wheels, glow, shadow, flames, flameMat, shield, shieldMat, tailMat: M.tail, tag,
    dims: { L: S.L, W: S.W, r: S.r, rear: tail, front: nose },
  };
}

export function disposeCarModel(model) {
  const shared = new Set([flakeTex, treadTex, carbonTex, glowTex, shadowTex]);
  model.root.traverse((o) => {
    if (o.geometry && !o.geometry.userData.shared) o.geometry.dispose();
    if (o.material) {
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of mats) {
        if (m.map && !shared.has(m.map)) m.map.dispose();
        m.dispose();
      }
    }
  });
}
