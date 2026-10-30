import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { boxGeo, setViewHUniform } from './WorldKit.js';

/*
 * v5.3 "living grid": fills the digital world quietly, in its own language of right angles and light —
 *  - light runners: thin light walls drawn along the major ground-grid lines by fast runners, with 90° turns,
 *    each one appearing, racing across the plain and fading out (one shader mesh, no per-frame JS);
 *  - data streams: faint light packets sliding along long lines high in the sky (same mesh);
 *  - terraces: low stepped platforms aligned to the grid, black with a light outline on every tier;
 *  - circuit traces: light lines on the floor leading away from the road edge, bending at 45° / 90°,
 *    ending in a pulsing node — like a circuit board seen from very close;
 *  - pixel dust: sparse tiny light squares drifting up around the camera (gives depth to the dark air).
 * v5.5: searchlights — soft beams of light from beyond the skyline, slowly sweeping the night sky.
 * All of it is dim and thin, so the road and the cars stay the brightest things on screen.
 */

const GROUND_Y = -0.6;
const MAJOR = 40; // the ground shader draws its major lines every 40 m (x = 40k, z = 40k)

// ------------------------------------------------------------------ road distance field (cheap lookups)
function roadField(track, b) {
  const C = 4, R = 64;
  const ext = (b.rMax ?? b.r) + 760;
  const x0 = b.cx - ext, z0 = b.cz - ext, N = Math.ceil((ext * 2) / C);
  const f = new Float32Array(N * N).fill(R);
  const rc = Math.ceil(R / C);
  for (let i = 0; i < track.n; i += 2) {
    const px = track.px[i], pz = track.pz[i];
    const ci = Math.floor((px - x0) / C), cj = Math.floor((pz - z0) / C);
    for (let dj = -rc; dj <= rc; dj++) {
      const j = cj + dj;
      if (j < 0 || j >= N) continue;
      for (let di = -rc; di <= rc; di++) {
        const k = ci + di;
        if (k < 0 || k >= N) continue;
        const d = Math.hypot(x0 + (k + 0.5) * C - px, z0 + (j + 0.5) * C - pz);
        const o = j * N + k;
        if (d < f[o]) f[o] = d;
      }
    }
  }
  return (x, z) => {
    const k = Math.floor((x - x0) / C), j = Math.floor((z - z0) / C);
    if (k < 0 || j < 0 || k >= N || j >= N) return R;
    return f[j * N + k];
  };
}

// ------------------------------------------------------------------ runner / stream shader
const RUN_VERT = /* glsl */`
  attribute vec4 aRun;   // u (m along the path), path length, speed, phase
  attribute vec3 aCol;
  attribute vec2 aTrail; // trail length, v (0 bottom .. 1 top)
  uniform float uTime;
  varying float vD, vV, vDist;
  varying vec3 vCol;
  varying float vTrail;
  void main() {
    float period = aRun.y + aTrail.x * 1.6;
    float head = mod(uTime * aRun.z + aRun.w, period);
    vD = head - aRun.x;      // how far behind the head this vertex is
    vV = aTrail.y;
    vTrail = aTrail.x;
    vCol = aCol;
    vec4 w = modelMatrix * vec4(position, 1.0);
    vDist = length(w.xyz - cameraPosition);
    gl_Position = projectionMatrix * viewMatrix * w;
  }
`;
const RUN_FRAG = /* glsl */`
  uniform float uFogNear, uFogFar;
  varying float vD, vV, vDist;
  varying vec3 vCol;
  varying float vTrail;
  void main() {
    if (vD < 0.0 || vD > vTrail) discard;
    float k = 1.0 - vD / vTrail;
    float a = k * k * (0.22 + 0.78 * smoothstep(0.55, 1.0, vV)); // bright top edge, faint wall below
    vec3 col = vCol * a;
    col += vec3(1.0) * smoothstep(2.5, 0.0, vD) * 1.6;             // white-hot head
    col *= 1.0 - smoothstep(uFogNear, uFogFar, vDist);
    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

class RunBuilder {
  constructor() { this.pos = []; this.run = []; this.col = []; this.trail = []; this.idx = []; }
  /** pts: [[x,z],...] polyline; y0/y1: wall bottom/top. */
  add(pts, y0, y1, color, k, speed, trail, phase) {
    let total = 0;
    for (let i = 1; i < pts.length; i++) total += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    const c = new THREE.Color(color).multiplyScalar(k);
    let u = 0;
    for (let i = 0; i < pts.length; i++) {
      if (i) u += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
      const base = this.pos.length / 3;
      for (const [y, v] of [[y0, 0], [y1, 1]]) {
        this.pos.push(pts[i][0], y, pts[i][1]);
        this.run.push(u, total, speed, phase);
        this.col.push(c.r, c.g, c.b);
        this.trail.push(trail, v);
      }
      if (i) this.idx.push(base - 2, base - 1, base, base - 1, base + 1, base);
    }
  }
  build(theme, timeUniforms) {
    if (!this.idx.length) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('aRun', new THREE.Float32BufferAttribute(this.run, 4));
    g.setAttribute('aCol', new THREE.Float32BufferAttribute(this.col, 3));
    g.setAttribute('aTrail', new THREE.Float32BufferAttribute(this.trail, 2));
    g.setIndex(this.idx);
    const mat = new THREE.ShaderMaterial({
      vertexShader: RUN_VERT, fragmentShader: RUN_FRAG,
      uniforms: { uTime: { value: 0 }, uFogNear: { value: theme.fogNear * 1.5 }, uFogFar: { value: theme.fogFar * 1.05 } },
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    });
    timeUniforms.push(mat.uniforms.uTime);
    const m = new THREE.Mesh(g, mat);
    m.frustumCulled = false;
    m.renderOrder = 4;
    return m;
  }
}

// ------------------------------------------------------------------ pixel dust around the camera
const DUST_VERT = /* glsl */`
  attribute vec4 aSeed; // xyz in 0..1, w = phase
  uniform float uTime, uViewH;
  uniform vec3 uBox;
  varying float vA;
  varying float vTw;
  void main() {
    vec3 drift = vec3(sin(uTime * 0.11 + aSeed.w * 6.0) * 3.0, uTime * (0.6 + aSeed.w * 0.9), cos(uTime * 0.09 + aSeed.w * 5.0) * 3.0);
    vec3 p = cameraPosition - uBox * 0.5 + mod(aSeed.xyz * uBox + drift - cameraPosition, uBox);
    vec4 mv = viewMatrix * vec4(p, 1.0);
    float dist = -mv.z;
    vA = smoothstep(3.0, 9.0, dist) * (1.0 - smoothstep(uBox.x * 0.32, uBox.x * 0.5, length(p.xz - cameraPosition.xz)));
    vTw = 0.55 + 0.45 * sin(uTime * (1.0 + aSeed.w * 2.0) + aSeed.w * 40.0);
    gl_PointSize = clamp((0.09 + aSeed.w * 0.12) * projectionMatrix[1][1] * uViewH * 0.5 / max(dist, 0.1), 1.0, 6.0);
    if (vA < 0.01) gl_PointSize = 0.0;
    gl_Position = projectionMatrix * mv;
  }
`;
const DUST_FRAG = /* glsl */`
  uniform vec3 uC1, uC2;
  varying float vA;
  varying float vTw;
  void main() {
    vec2 c = abs(gl_PointCoord - 0.5);
    float sq = 1.0 - smoothstep(0.3, 0.5, max(c.x, c.y)); // little squares, not round blobs
    vec3 col = mix(uC1, vec3(1.0), 0.35) * sq * vA * vTw * 0.75;
    if (max(col.r, max(col.g, col.b)) < 0.003) discard;
    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

function buildDust(theme, qp, timeUniforms) {
  const n = qp.q === 'low' ? 110 : qp.q === 'high' ? 380 : 240;
  const seed = new Float32Array(n * 4);
  for (let i = 0; i < n * 4; i++) seed[i] = Math.random();
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
  g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 4));
  const mat = new THREE.ShaderMaterial({
    vertexShader: DUST_VERT, fragmentShader: DUST_FRAG,
    uniforms: {
      uTime: { value: 0 }, uViewH: { value: 720 }, uBox: { value: new THREE.Vector3(110, 36, 110) },
      uC1: { value: new THREE.Color(theme.wall) }, uC2: { value: new THREE.Color(theme.wall2) },
    },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  timeUniforms.push(mat.uniforms.uTime);
  const pts = new THREE.Points(g, mat);
  pts.frustumCulled = false;
  pts.renderOrder = 5;
  setViewHUniform(pts, mat.uniforms.uViewH);
  return pts;
}

// ------------------------------------------------------------------ v5.5 searchlights sweeping the sky
const BEAM_VERT = /* glsl */`
  attribute vec3 aBase;
  attribute vec4 aSweep; // phase, speed, yaw0, tilt
  attribute vec3 aCol;
  uniform float uTime;
  varying vec3 vN, vV, vCol;
  varying float vH, vDist;
  vec3 rot(vec3 p, float tilt, float yaw) {
    float ct = cos(tilt), st = sin(tilt);
    p = vec3(p.x, p.y * ct - p.z * st, p.y * st + p.z * ct);   // lean away from vertical
    float cy = cos(yaw), sy = sin(yaw);
    return vec3(p.x * cy + p.z * sy, p.y, -p.x * sy + p.z * cy); // turn around the base
  }
  void main() {
    float t = uTime * aSweep.y + aSweep.x;
    float yaw = aSweep.z + sin(t) * 0.7;
    float tilt = aSweep.w + sin(t * 0.63 + aSweep.x * 2.0) * 0.12;
    vec3 w = aBase + rot(position, tilt, yaw);
    vN = normalize(rot(normal, tilt, yaw));
    vV = normalize(cameraPosition - w);
    vH = position.y;
    vDist = length(w - cameraPosition);
    vCol = aCol;
    gl_Position = projectionMatrix * viewMatrix * vec4(w, 1.0);
  }
`;
const BEAM_FRAG = /* glsl */`
  uniform float uFogFar;
  varying vec3 vN, vV, vCol;
  varying float vH, vDist;
  void main() {
    float core = pow(abs(dot(normalize(vN), normalize(vV))), 2.2); // bright along the axis, soft at the edges
    float along = exp(-vH / 420.0) * smoothstep(0.0, 25.0, vH);   // strongest near the source, dissolving upwards
    vec3 col = vCol * core * along * (1.0 - 0.55 * smoothstep(uFogFar * 0.6, uFogFar * 1.4, vDist));
    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

function buildBeams(theme, b, R, rnd, qp, timeUniforms, floating) {
  const n = qp.q === 'low' ? 4 : 7;
  const cone = new THREE.CylinderGeometry(70, 4, 900, 24, 1, true).translate(0, 450, 0);
  const geos = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + rnd() * 0.6;
    const r = R + 240 + rnd() * 260;
    const g = cone.clone();
    const cnt = g.attributes.position.count;
    const base = [b.cx + Math.cos(a) * r, floating ? -120 : -2, b.cz + Math.sin(a) * r];
    const sweep = [rnd() * 6.28, 0.12 + rnd() * 0.1, -a + Math.PI / 2 + (rnd() - 0.5) * 0.8, 0.3 + rnd() * 0.25];
    const c = new THREE.Color(i % 3 === 2 ? theme.wall2 : theme.wall).lerp(new THREE.Color(0xffffff), 0.25).multiplyScalar(0.75);
    const fill = (arr, k) => { const out = new Float32Array(cnt * k); for (let j = 0; j < cnt; j++) out.set(arr, j * k); return out; };
    g.setAttribute('aBase', new THREE.BufferAttribute(fill(base, 3), 3));
    g.setAttribute('aSweep', new THREE.BufferAttribute(fill(sweep, 4), 4));
    g.setAttribute('aCol', new THREE.BufferAttribute(fill([c.r, c.g, c.b], 3), 3));
    g.deleteAttribute('uv');
    geos.push(g);
  }
  cone.dispose();
  const merged = mergeGeometries(geos, false);
  for (const g of geos) g.dispose();
  const mat = new THREE.ShaderMaterial({
    vertexShader: BEAM_VERT, fragmentShader: BEAM_FRAG,
    uniforms: { uTime: { value: 0 }, uFogFar: { value: theme.fogFar } },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  timeUniforms.push(mat.uniforms.uTime);
  const m = new THREE.Mesh(merged, mat);
  m.frustumCulled = false;
  m.renderOrder = 2;
  return m;
}

// ------------------------------------------------------------------ main
export function buildGridLife(ctx) {
  const { track, theme, qp, b, batch, glow, group, timeUniforms, rnd, exclude } = ctx;
  const C1 = theme.wall, C2 = theme.wall2;
  const floating = !!theme.floating;
  const dist = roadField(track, b);
  const R = b.rMax ?? b.r;
  const half = track.half;
  const clearOf = (x, z, m) => dist(x, z) > half + m && !exclude.some((e) => (e.x - x) ** 2 + (e.z - z) ** 2 < e.r * e.r);
  const runs = new RunBuilder();

  // ---- light runners on the major grid lines (in open space: on an invisible floor far below the track)
  const runY = floating ? -38 : GROUND_Y + 0.02;
  const nRun = Math.round((qp.q === 'low' ? 12 : qp.q === 'high' ? 32 : 22));
  let made = 0;
  for (let tries = 0; made < nRun && tries < nRun * 30; tries++) {
    const snap = (v) => Math.round(v / MAJOR) * MAJOR;
    const a = rnd() * Math.PI * 2, r = 60 + Math.sqrt(rnd()) * (R + 260);
    let x = snap(b.cx + Math.cos(a) * r), z = snap(b.cz + Math.sin(a) * r);
    const pts = [[x, z]];
    let dir = rnd() < 0.5 ? 0 : 1, sgn = rnd() < 0.5 ? -1 : 1, ok = true;
    const legs = 1 + Math.floor(rnd() * 3);
    for (let l = 0; l < legs && ok; l++) {
      const len = MAJOR * (2 + Math.floor(rnd() * (l ? 4 : 7)));
      const nx = x + (dir === 0 ? sgn * len : 0), nz = z + (dir === 1 ? sgn * len : 0);
      for (let s = 0; s <= len; s += 6) {
        const t = s / len, px = x + (nx - x) * t, pz = z + (nz - z) * t;
        if (!clearOf(px, pz, floating ? 6 : 22) || Math.hypot(px - b.cx, pz - b.cz) > R + 420) { ok = false; break; }
      }
      if (!ok) break;
      x = nx; z = nz; pts.push([x, z]);
      dir = 1 - dir; sgn = rnd() < 0.5 ? -1 : 1; // 90° turn
    }
    if (pts.length < 2) continue;
    const col = rnd() < 0.25 ? C2 : C1;
    const speed = 34 + rnd() * 30;
    runs.add(pts, runY, runY + 1.8, col, 1.6, speed, 50 + rnd() * 70, rnd() * 900);
    made++;
  }

  // ---- data streams high in the sky: long straight lines with light packets, very faint
  const nStream = qp.q === 'low' ? 4 : 8;
  for (let i = 0; i < nStream; i++) {
    const a = rnd() * Math.PI, off = (rnd() - 0.5) * (R + 300);
    const ca = Math.cos(a), sa = Math.sin(a), L = R + 650;
    const y = 85 + rnd() * 90;
    const cx = b.cx - sa * off, cz = b.cz + ca * off;
    const pts = [[cx - ca * L, cz - sa * L], [cx + ca * L, cz + sa * L]];
    for (let k = 0; k < 2; k++) { // two packets per line, flat ribbons 0.9 m tall
      runs.add(pts, y + k * 0.01, y + 0.9 + k * 0.01, k ? C2 : C1, 0.9, 70 + rnd() * 50, 70 + rnd() * 60, rnd() * 3000);
    }
  }
  const runMesh = runs.build(theme, timeUniforms);
  if (runMesh) group.add(runMesh);

  if (!floating) {
    // ---- terraces: grid-aligned stepped platforms with a light outline on every tier
    const snap8 = (v) => Math.round(v / 8) * 8;
    const nTer = Math.round(28 * qp.density) + 6;
    let placed = 0;
    for (let tries = 0; placed < nTer && tries < nTer * 40; tries++) {
      const a = rnd() * Math.PI * 2, r = Math.sqrt(rnd()) * (R + 150);
      const x = snap8(b.cx + Math.cos(a) * r), z = snap8(b.cz + Math.sin(a) * r);
      const d0 = dist(x, z);
      if (d0 < half + 24 || d0 > 150) continue;
      let w = 16 + Math.floor(rnd() * 4) * 8, d = 16 + Math.floor(rnd() * 4) * 8;
      if (![[-1, -1], [1, -1], [-1, 1], [1, 1], [0, 0]].every(([sx, sz]) => clearOf(x + sx * w / 2, z + sz * d / 2, 10))) continue;
      exclude.push({ x, z, r: Math.max(w, d) * 0.6 });
      const tiers = 1 + Math.floor(rnd() * 3);
      const col = rnd() < 0.2 ? C2 : C1;
      let y = GROUND_Y;
      for (let t = 0; t < tiers && w > 6 && d > 6; t++) {
        const h = 0.6 + rnd() * (t ? 1.6 : 1.0);
        const m = new THREE.Matrix4().makeTranslation(x, y, z);
        batch.add('neon', boxGeo(w, h, d, 0, h / 2, 0), m, 0x03070b); // unlit black glass: no stray reflections
        // light outline along the top edge of the tier (four thin bars)
        const e = 0.12, k = 1.15 - t * 0.1;
        batch.add('neon', boxGeo(w + e, e, e, 0, h, -d / 2), m, col, k);
        batch.add('neon', boxGeo(w + e, e, e, 0, h, d / 2), m, col, k);
        batch.add('neon', boxGeo(e, e, d + e, -w / 2, h, 0), m, col, k);
        batch.add('neon', boxGeo(e, e, d + e, w / 2, h, 0), m, col, k);
        y += h;
        w -= 8; d -= 8;
      }
      if (rnd() < 0.35) glow.add(x, y + 0.4, z, col, 0.55, 3.5, 3, 0.25 + rnd() * 0.3);
    }

    // ---- circuit traces leading away from the road edge
    const p = {};
    const gap = qp.q === 'low' ? 70 : 46;
    let side = 1;
    for (let s = 30; s < track.length - 20; s += gap * (0.7 + rnd() * 0.6)) {
      side = -side;
      track.pointAt(s, 0, p);
      if (p.y > 2 || track.ramps.some((r) => Math.abs(r.s - s) < 30)) continue;
      const h = p.heading, fx = Math.sin(h), fz = Math.cos(h), rx = -fz * side, rz = fx * side;
      const lanes = 1 + Math.floor(rnd() * 3);
      const fwd = rnd() < 0.5 ? -1 : 1;
      const len1 = 6 + rnd() * 10, len2 = 4 + rnd() * 8, len3 = 6 + rnd() * 18;
      const col = rnd() < 0.25 ? C2 : C1;
      for (let l = 0; l < lanes; l++) {
        const off = l * 1.4;
        // start point at the road edge (beyond the barrier), shifted along the road per lane
        const sx = p.x + rx * (half + 5) + fx * off * fwd, sz = p.z + rz * (half + 5) + fz * off * fwd;
        const a = [sx, sz];
        const b1 = [a[0] + rx * (len1 + off), a[1] + rz * (len1 + off)];
        const dx = (rx + fx * fwd) * Math.SQRT1_2, dz = (rz + fz * fwd) * Math.SQRT1_2;
        const b2 = [b1[0] + dx * len2, b1[1] + dz * len2];
        const b3 = [b2[0] + rx * (len3 - off), b2[1] + rz * (len3 - off)];
        const path = [a, b1, b2, b3];
        if (!path.slice(1).every(([qx, qz]) => clearOf(qx, qz, 4))) continue;
        for (let i = 1; i < path.length; i++) {
          const [ax, az] = path[i - 1], [bx, bz] = path[i];
          const L = Math.hypot(bx - ax, bz - az);
          const m = new THREE.Matrix4().compose(
            new THREE.Vector3((ax + bx) / 2, GROUND_Y + 0.03, (az + bz) / 2),
            new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.atan2(bx - ax, bz - az)),
            new THREE.Vector3(1, 1, 1),
          );
          batch.add('neon', boxGeo(0.2, 0.04, L + 0.2), m, col, 0.85);
        }
        // pad at the end
        const [ex, ez] = b3;
        batch.add('neon', boxGeo(1.1, 0.05, 1.1, ex, GROUND_Y + 0.03, ez), null, col, 1.2);
        batch.add('metal', boxGeo(0.7, 0.07, 0.7, ex, GROUND_Y + 0.04, ez), null, 0x04060a);
        if (l === 0) glow.add(ex, GROUND_Y + 0.6, ez, col, 0.5, 2.4, 3, 0.4 + rnd() * 0.5);
      }
    }
  }

  // ---- pixel dust
  group.add(buildDust(theme, qp, timeUniforms));
  // ---- v5.5 searchlights
  group.add(buildBeams(theme, b, R, rnd, qp, timeUniforms, floating));
}
