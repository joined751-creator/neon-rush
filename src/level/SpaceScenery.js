import * as THREE from 'three';
import { fbm, vnoise, boxGeo } from './WorldKit.js';

/**
 * v4.0 "Orbit" (space theme) props: floating asteroids with glowing veins above and below the deck,
 * plus neon ring gates the road threads through. Self-contained copy of the small Scenery helpers.
 */

const _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3();
const mat4 = (x, y, z, ry, sx, sy = sx, sz = sx, rx = 0, rz = 0) => {
  _e.set(rx, ry, rz); _q.setFromEuler(_e);
  return new THREE.Matrix4().compose(_p.set(x, y, z), _q, _s.set(sx, sy, sz));
};

function glowMaterial(params, glowColor, key) {
  const mat = new THREE.MeshStandardMaterial(params);
  const u = { value: new THREE.Color(glowColor) };
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uGlowCol = u;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', 'attribute float aGlow;\nvarying float vGlow;\n#include <common>')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvGlow = aGlow;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', 'uniform vec3 uGlowCol;\nvarying float vGlow;\n#include <common>')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += uGlowCol * vGlow;');
  };
  mat.customProgramCacheKey = () => 'nr-glow-' + key;
  return mat;
}

function scatter(ctx, n, dMin, dMax, rnd, fn) {
  const { track, b, exclude } = ctx;
  let placed = 0, guard = 0;
  while (placed < n && guard < n * 40) {
    guard++;
    const a = rnd() * Math.PI * 2;
    const r = Math.sqrt(rnd()) * ((b.rMax ?? b.r) + dMax);
    const x = b.cx + Math.cos(a) * r, z = b.cz + Math.sin(a) * r;
    const d = track.distanceTo(x, z);
    if (d < dMin || d > dMax) continue;
    if (exclude.some((e) => (e.x - x) ** 2 + (e.z - z) ** 2 < e.r * e.r)) continue;
    fn(x, z, d, placed);
    placed++;
  }
  return placed;
}

function instanced(geo, mat, list, ctx) {
  if (!list.length) { geo.dispose(); mat.dispose(); return null; }
  const inst = new THREE.InstancedMesh(geo, mat, list.length);
  list.forEach((m, i) => inst.setMatrixAt(i, m));
  inst.computeBoundingSphere();
  ctx.group.add(inst);
  return inst;
}

/** Lumpy asteroid with glowing veins and a hot underside (aGlow attribute). */
function rockGeometry(seed, detail) {
  const g = new THREE.IcosahedronGeometry(1, detail);
  const pa = g.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < pa.count; i++) {
    v.fromBufferAttribute(pa, i);
    const n = fbm(v.x * 1.3 + v.y * 0.7 + 10, v.z * 1.3 - v.y * 0.6 + 10, 3, seed) - 0.5;
    v.multiplyScalar(1 + n * 0.64);
    pa.setXYZ(i, v.x, v.y, v.z);
  }
  g.deleteAttribute('uv');
  g.computeVertexNormals();
  const gl = new Float32Array(pa.count);
  for (let i = 0; i < pa.count; i++) {
    const y = pa.getY(i), x = pa.getX(i), z = pa.getZ(i);
    const vein = Math.abs(vnoise(x * 3 + seed, z * 3 + y * 2, seed) - 0.5) < 0.05 ? 0.6 : 0;
    gl[i] = Math.pow(Math.max(0, -y * 0.5 + 0.2), 2) * 1.6 + vein;
  }
  g.setAttribute('aGlow', new THREE.BufferAttribute(gl, 1));
  return g;
}

export function buildSpace(ctx) {
  const { qp, rnd, glow, batch, theme, track } = ctx;
  const a = [], bList = [], big = [];
  const yFor = (d) => {
    // keep clear of the deck (track height 6..24 m): near the road only well above or well below it
    if (d < 70) return rnd() < 0.6 ? -25 - rnd() * 70 : 48 + rnd() * 50;
    return (rnd() - 0.55) * 220;
  };
  scatter(ctx, Math.round(170 * qp.density), 24, 380, rnd, (x, z, d) => {
    const r = d < 70 ? 1.5 + rnd() * 4 : 3 + rnd() * 10;
    const m = mat4(x, yFor(d), z, rnd() * 6, r, r * (0.6 + rnd() * 0.7), r * (0.7 + rnd() * 0.6), rnd() * 6, rnd() * 6);
    (rnd() < 0.5 ? a : bList).push(m);
  });
  scatter(ctx, Math.round(14 * qp.density) + 4, 160, 600, rnd, (x, z) => {
    const r = 22 + rnd() * 34;
    big.push(mat4(x, (rnd() - 0.5) * 260, z, rnd() * 6, r, r * (0.6 + rnd() * 0.4), r * (0.7 + rnd() * 0.5), rnd() * 6, rnd() * 6));
  });
  const rockMat = (c, k) => glowMaterial({ color: 0x2a2440, roughness: 0.85, metalness: 0.15, flatShading: true }, c, k);
  const detail = qp.q === 'low' ? 0 : 1;
  instanced(rockGeometry(5, detail), rockMat(0x39ff88, 'astA'), a, ctx);
  instanced(rockGeometry(13, detail), rockMat(0x9a6bff, 'astB'), bList, ctx);
  instanced(rockGeometry(17, detail), rockMat(0xff2bd6, 'astC'), big, ctx);

  // ring gates: tilted neon portals the road threads through, away from the start, ramps and gantries
  const L = track.length, p = {};
  const count = qp.q === 'low' ? 4 : 7;
  for (let k = 0; k < count; k++) {
    const s = L * (0.08 + (k / count) * 0.86);
    if (track.ramps.some((r) => Math.abs(r.s - s) < 50)) continue;
    track.pointAt(s, 0, p);
    const m = mat4(p.x, p.y + 3, p.z, p.heading, 1);
    const c1 = k % 2 ? theme.wall : theme.wall2, c2 = k % 2 ? theme.wall2 : theme.wall;
    const ring = new THREE.TorusGeometry(17, 0.32, 6, 64);
    batch.add('neon', ring, m, c1, 2.6);
    const inner = new THREE.TorusGeometry(15.6, 0.12, 4, 64);
    batch.add('neon', inner, m, c2, 1.8);
    // four "thruster" pods around the ring
    for (let q = 0; q < 4; q++) {
      const ang = Math.PI / 4 + (q * Math.PI) / 2;
      const px = Math.cos(ang) * 17, py = Math.sin(ang) * 17;
      batch.add('metal', boxGeo(1.6, 1.6, 2.4, px, py, 0), m, 0x2a2640);
      const w = new THREE.Vector3(px, py, 1.4).applyMatrix4(m);
      glow.add(w.x, w.y, w.z, c2, 1.4, 3.2, 3, 0.6, q);
    }
    const top = new THREE.Vector3(0, 17, 0).applyMatrix4(m);
    glow.add(top.x, top.y, top.z, c1, 0.4, 22, 3, 0.25);
  }
}
