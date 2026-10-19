import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { TRACK } from '../core/Constants.js';
import { ATLAS_CELLS, atlasRect } from './Textures.js';
import { GLSL_NOISE, fbm, vnoise, boxGeo, strutGeo, rng } from './WorldKit.js';

/** Theme props: palms (sunset), skyscrapers (city), ice crystals (arctic), rocks + volcano plume (volcano). */

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _c = new THREE.Color();

export function buildScenery(ctx) {
  const t = ctx.theme.props;
  if (t === 'palms') buildPalms(ctx);
  else if (t === 'city') buildCity(ctx);
  else if (t === 'ice') buildIce(ctx);
  else if (t === 'rocks') buildRocks(ctx);
}

// --- helpers -------------------------------------------------------------------------------------

/** Material whose emissive = uGlow colour × per-vertex aGlow attribute (+ optional rim). */
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

/** Randomly scatter n points around the track at centre-line distance [dMin, dMax], avoiding exclusions. */
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

const mat4 = (x, y, z, ry, sx, sy = sx, sz = sx, rx = 0, rz = 0) => {
  _e.set(rx, ry, rz); _q.setFromEuler(_e);
  return new THREE.Matrix4().compose(_p.set(x, y, z), _q, _s.set(sx, sy, sz));
};

/** Ground height under (x, z): the track may be elevated, the ground is flat at -0.6. */
const GROUND = -0.6;

// --- palms ---------------------------------------------------------------------------------------
function palmGeometry(detail, rnd) {
  const parts = [];
  const trunkH = 12;
  const radial = detail ? 7 : 5, rows = detail ? 8 : 3;
  const trunk = new THREE.CylinderGeometry(0.22, 0.42, trunkH, radial, rows);
  const pa = trunk.attributes.position;
  const col = [];
  for (let i = 0; i < pa.count; i++) {
    const y = pa.getY(i) + trunkH / 2;
    const k = y / trunkH;
    pa.setX(i, pa.getX(i) + k * k * 2.4);
    const ring = Math.round(y / (trunkH / rows)) % 2;
    const v = (0.055 + k * 0.05) * (ring ? 0.75 : 1);
    col.push(v * 1.5, v * 0.85, v * 1.25);
  }
  trunk.translate(0, trunkH / 2, 0);
  trunk.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  trunk.computeVertexNormals();
  parts.push(trunk.toNonIndexed());
  trunk.dispose();
  // crown fronds: drooping folded strips
  const fronds = detail ? 10 : 7, segs = detail ? 5 : 3;
  const top = new THREE.Vector3(2.4, trunkH - 0.1, 0);
  for (let f = 0; f < fronds; f++) {
    const yaw = (f / fronds) * Math.PI * 2 + rnd() * 0.3;
    const pitch = 0.25 + rnd() * 0.55;
    const len = 5.2 + rnd() * 2;
    const dir = new THREE.Vector3(Math.cos(yaw) * Math.cos(pitch), Math.sin(pitch), Math.sin(yaw) * Math.cos(pitch));
    const side = new THREE.Vector3(-Math.sin(yaw), 0, Math.cos(yaw));
    const pos = [], cols = [];
    const pts = [];
    for (let i = 0; i <= segs; i++) {
      const t = i / segs;
      const p = top.clone().addScaledVector(dir, len * t);
      p.y -= t * t * (2.6 + rnd() * 0.6);
      const w = Math.pow(Math.sin(Math.PI * Math.min(1, t * 1.05 + 0.05)), 0.7) * 0.95;
      const fold = new THREE.Vector3(0, -0.28 * w, 0);
      pts.push([p, p.clone().addScaledVector(side, w).add(fold), p.clone().addScaledVector(side, -w).add(fold), t]);
    }
    const cA = [0.02, 0.07, 0.06], cB = [0.16, 0.03, 0.14];
    const cc = (t) => [cA[0] + (cB[0] - cA[0]) * t, cA[1] + (cB[1] - cA[1]) * t, cA[2] + (cB[2] - cA[2]) * t];
    for (let i = 0; i < segs; i++) {
      const [p0, l0, r0, t0] = pts[i], [p1, l1, r1, t1] = pts[i + 1];
      for (const tri of [[p0, l0, p1, t0, t0, t1], [l0, l1, p1, t0, t1, t1], [p0, p1, r0, t0, t1, t0], [r0, p1, r1, t0, t1, t1]]) {
        for (let k = 0; k < 3; k++) { pos.push(tri[k].x, tri[k].y, tri[k].z); cols.push(...cc(tri[3 + k])); }
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
    g.computeVertexNormals();
    parts.push(g);
  }
  // nut cluster
  if (detail) {
    const nut = new THREE.IcosahedronGeometry(0.32, 0);
    for (let k = 0; k < 3; k++) {
      const g = nut.clone();
      g.translate(top.x + Math.cos(k * 2.1) * 0.35, top.y - 0.35, Math.sin(k * 2.1) * 0.35);
      const c = new Float32Array(g.attributes.position.count * 3).fill(0.05);
      g.setAttribute('color', new THREE.BufferAttribute(c, 3));
      parts.push(g);
    }
    nut.dispose();
  }
  for (const p of parts) { if (p.attributes.uv) p.deleteAttribute('uv'); }
  const merged = mergeGeometries(parts, false);
  parts.forEach((p) => p.dispose());
  return merged;
}

function buildPalms(ctx) {
  const { track, qp, exclude, rnd } = ctx;
  const wallOff = track.half + TRACK.WALL_OFFSET;
  const near = [], far = [];
  // avenue rows along the road (≥ 10 m from the edge so the chase camera keeps a clear view)
  const gap = qp.q === 'low' ? 40 : 19;
  const pt = {};
  for (let s = 0; s < track.length; s += gap) {
    for (const side of [-1, 1]) {
      const ss = s + (side > 0 ? gap / 2 : 0) + (rnd() - 0.5) * 4;
      track.pointAt(ss, side * (wallOff + 10 + rnd() * 2), pt);
      if (track.distanceTo(pt.x, pt.z) < wallOff + 9) continue;
      if (exclude.some((e) => (e.x - pt.x) ** 2 + (e.z - pt.z) ** 2 < e.r * e.r)) continue;
      const sc = 0.85 + rnd() * 0.35;
      (qp.q === 'low' ? far : near).push(mat4(pt.x, GROUND, pt.z, rnd() * Math.PI * 2, sc));
    }
  }
  scatter(ctx, Math.round(260 * qp.density), 30, 320, rnd, (x, z, d) => {
    const sc = 0.75 + rnd() * 0.6;
    (d < 90 && qp.q !== 'low' ? near : far).push(mat4(x, GROUND, z, rnd() * Math.PI * 2, sc));
  });
  const mat = () => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75, metalness: 0.1, side: THREE.DoubleSide, emissive: 0x16041c, envMapIntensity: 0.6 });
  instanced(palmGeometry(true, rng(5)), mat(), near, ctx);
  instanced(palmGeometry(false, rng(6)), mat(), far, ctx);
  // a few neon "sun sculptures": glowing rings on poles in the far scatter (cheap, iconic)
  const { batch, glow, theme } = ctx;
  scatter(ctx, qp.q === 'low' ? 3 : 6, 60, 260, rnd, (x, z) => {
    const yaw = rnd() * Math.PI;
    const m = mat4(x, GROUND, z, yaw, 1);
    batch.add('metal', boxGeo(0.6, 14, 0.6, 0, 7, 0), m, 0x2a2436);
    const ring = new THREE.TorusGeometry(6, 0.18, 6, 48);
    ring.translate(0, 20, 0);
    batch.add('neon', ring, m, rnd() < 0.5 ? theme.wall : theme.wall2, 2.4);
    const inner = new THREE.TorusGeometry(4.2, 0.1, 5, 40);
    inner.translate(0, 20, 0);
    batch.add('neon', inner, m, theme.sunColor1 ?? 0xffe14d, 1.8);
    const p = new THREE.Vector3(0, 20, 0).applyMatrix4(m);
    glow.add(p.x, p.y, p.z, theme.wall, 0.35, 16, 3, 0.25);
  });
}

// --- city ----------------------------------------------------------------------------------------
const BUILDING_PARS = /* glsl */`
  varying vec3 vBL, vBS, vBN;
  flat varying float vBSeed;
  uniform vec3 uAccA, uAccB;
  ${GLSL_NOISE}
`;
const BUILDING_EMIS = /* glsl */`
  {
    vec3 bl = vBL, sc = vBS;
    float isSide = 1.0 - step(0.5, abs(vBN.y));
    float u = abs(vBN.x) > 0.5 ? bl.z * sc.z : bl.x * sc.x;
    float vy = bl.y * sc.y;
    // per-building seed: interpolated varyings drift by ~1e-7 per pixel and the hashes amplified that into speckle
    float seed = floor(vBSeed * 4096.0 + 0.5) / 4096.0;
    float style = floor(fract(seed * 7.13) * 3.0);
    vec2 csz = style < 1.0 ? vec2(1.5, 3.0) : style < 2.0 ? vec2(1.25, 2.9) : vec2(1.9, 3.3);
    vec2 wc = vec2(u + 50.0, vy) / csz;
    vec2 ci = floor(wc), f = fract(wc);
    float floorDark = step(wkHash(vec2(ci.y, seed * 91.0)), 0.2);
    float litP = 0.22 + 0.33 * fract(seed * 13.7);
    vec2 room = vec2(floor(ci.x / 3.0), ci.y);           // windows light up in rooms of 3
    float lit = step(wkHash(room + seed * 37.0), litP) * (1.0 - floorDark) * step(0.12, wkHash(ci + 5.1));
    float shape;
    if (style < 1.0) shape = step(0.24, f.x) * step(f.x, 0.76) * step(0.3, f.y) * step(f.y, 0.76);
    else if (style < 2.0) shape = step(0.12, f.x) * step(0.26, f.y) * step(f.y, 0.8);
    else shape = step(0.34, f.x) * step(f.x, 0.66) * step(0.14, f.y) * step(f.y, 0.88);
    vec2 fw = fwidth(wc);
    float far = smoothstep(0.1, 0.38, max(fw.x, fw.y)); // fade to an average glow before windows shrink to 2-3 px (no shimmering speckles)
    float win = mix(lit * shape, litP * 0.16, far);
    float hc = wkHash(room * 1.37 + seed * 3.0);
    vec3 wcol = mix(vec3(1.0, 0.74, 0.46), vec3(0.62, 0.8, 1.0), step(0.5, hc)) * (0.6 + 0.4 * fract(hc * 7.3));
    if (hc > 0.96) wcol = mix(uAccA, uAccB, step(0.98, hc));
    wcol = mix(wcol, vec3(0.85, 0.75, 0.6), far * 0.5);
    float inten = (0.45 + 0.6 * wkHash(room + 7.7)) * mix(1.0, 0.8, far);
    vec3 em = wcol * win * inten * 0.85 * isSide * step(4.6, vy);
    // lobby / storefront band
    float shop = floor(u / 6.0);
    float lobby = (1.0 - smoothstep(3.9, 4.2, vy)) * step(1.0, vy) * isSide * step(0.1, fract(u / 6.0)) * step(0.55, wkHash(vec2(shop, seed * 17.0)));
    vec3 shopCol = mix(vec3(1.0, 0.65, 0.4), mix(uAccA, uAccB, step(0.5, wkHash(vec2(shop, seed)))), step(0.6, wkHash(vec2(seed, shop))));
    em += shopCol * lobby * 0.3;
    // neon crown + corner strips on some towers
    vec3 acc = mix(uAccA, uAccB, step(0.5, fract(seed * 5.1)));
    float crown = step(0.45, fract(seed * 2.9)) * (smoothstep(sc.y - 1.1, sc.y - 0.9, vy) - smoothstep(sc.y - 0.6, sc.y - 0.4, vy));
    em += acc * crown * isSide * 2.4;
    float edgeD = abs(vBN.x) > 0.5 ? (0.5 - abs(bl.z)) * sc.z : (0.5 - abs(bl.x)) * sc.x;
    float corner = step(0.78, fract(seed * 4.3)) * (1.0 - smoothstep(0.15, 0.3, edgeD)) * step(4.6, vy);
    em += acc * corner * isSide * 1.8;
    totalEmissiveRadiance = em;
    diffuseColor.rgb = mix(vec3(0.02, 0.022, 0.035), vec3(0.05, 0.045, 0.06), fract(seed * 9.1)) * mix(0.6, 1.0, isSide);
  }
`;

function buildingMaterial(theme) {
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.32, metalness: 0.6, envMapIntensity: 0.7 });
  const uA = { value: new THREE.Color(theme.wall) }, uB = { value: new THREE.Color(theme.wall2) };
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uAccA = uA; sh.uniforms.uAccB = uB;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', 'varying vec3 vBL, vBS, vBN;\nflat varying float vBSeed;\n#include <common>')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vBL = position; vBN = normal;
        #ifdef USE_INSTANCING
          vBS = vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz));
          vBSeed = fract(sin(dot(instanceMatrix[3].xz, vec2(12.9898, 78.233))) * 43758.5453);
        #else
          vBS = vec3(1.0); vBSeed = 0.5;
        #endif`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\n' + BUILDING_PARS)
      .replace('#include <emissivemap_fragment>', BUILDING_EMIS);
  };
  mat.customProgramCacheKey = () => 'nr-building';
  return mat;
}

const HOLO_VERT = /* glsl */`
  attribute float aSeed;
  varying vec2 vUv;
  flat varying float vSeed;
  void main() {
    vUv = uv; vSeed = aSeed;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
const HOLO_FRAG = /* glsl */`
  uniform sampler2D uMap;
  uniform float uTime;
  uniform vec3 uTint;
  varying vec2 vUv;
  flat varying float vSeed;
  void main() {
    float t = uTime + vSeed * 17.0;
    float glitch = step(0.97, fract(sin(floor(t * 6.0) * 12.7 + vSeed) * 4375.5));
    vec2 uv = vUv + vec2(glitch * 0.004 * sin(vUv.y * 400.0), 0.0);
    vec3 c = texture2D(uMap, uv).rgb;
    // scanlines fade out once they get thinner than ~2 px (they turned into moire on far / small screens)
    float scanAA = 1.0 - smoothstep(0.25, 0.6, fwidth(vUv.y * 382.0));
    float scan = 1.0 - 0.3 * scanAA * (0.5 - 0.5 * sin(vUv.y * 2400.0 - t * 8.0));
    float flick = 0.85 + 0.15 * sin(t * 23.0) * sin(t * 7.0);
    vec3 col = (c * 1.3 + uTint * 0.06) * scan * flick;
    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

function buildCity(ctx) {
  const { track, qp, b, batch, glow, theme, rnd, exclude } = ctx;
  const cell = 34;
  const extent = b.r + 420;
  const cand = [];
  for (let x = b.cx - extent; x <= b.cx + extent; x += cell) {
    for (let z = b.cz - extent; z <= b.cz + extent; z += cell) {
      const px = x + (rnd() - 0.5) * 6, pz = z + (rnd() - 0.5) * 6;
      const d = track.distanceTo(px, pz);
      if (d < 34 || d > 440) continue;
      if (exclude.some((e) => (e.x - px) ** 2 + (e.z - pz) ** 2 < (e.r + 14) ** 2)) continue;
      cand.push({ x: px, z: pz, d });
    }
  }
  cand.sort((a, c) => a.d - c.d);
  const maxB = Math.round(820 * qp.density);
  const towers = [];
  const holo = { pos: [], uv: [], seed: [], idx: [] };
  let holoCount = 0;
  const stripRects = ATLAS_CELLS.strip.map(atlasRect);
  for (const c of cand) {
    if (towers.length >= maxB) break;
    const near = c.d < 48;
    if (near && rnd() < 0.35) continue;
    if (c.d > 220 && rnd() < 0.3) continue;
    const w = near ? 12 + rnd() * 14 : 14 + rnd() * 14, dp = near ? 12 + rnd() * 14 : 14 + rnd() * 14;
    // footprint must stay clear of the road on all corners
    let ok = true;
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      if (track.distanceTo(c.x + sx * w / 2, c.z + sz * dp / 2) < (near ? 24 : 30)) { ok = false; break; }
    }
    if (!ok) continue;
    let h;
    if (near) h = 8 + rnd() * 10;
    else if (c.d < 120) h = 24 + rnd() * rnd() * 90;
    else h = 40 + rnd() * rnd() * 170 + (rnd() < 0.05 ? 90 : 0);
    towers.push(mat4(c.x, GROUND, c.z, 0, w, h, dp));
    let topH = h;
    if (h > 60 && rnd() < 0.55) {
      const k = 0.55 + rnd() * 0.25, hh = h * (0.15 + rnd() * 0.25);
      towers.push(mat4(c.x, GROUND + h, c.z, 0, w * k, hh, dp * k));
      topH += hh;
      if (rnd() < 0.4 && h > 110) {
        const k2 = k * 0.6, h3 = hh * 0.6;
        towers.push(mat4(c.x, GROUND + h + hh, c.z, 0, w * k2, h3, dp * k2));
        topH += h3;
      }
    }
    // rooftop antenna with blinking aviation light
    if (topH > 70 && rnd() < 0.6) {
      const ah = 6 + rnd() * 16;
      batch.add('metal', strutGeo(c.x, GROUND + topH, c.z, c.x, GROUND + topH + ah, c.z, 0.35), null, 0x3a3644);
      glow.add(c.x, GROUND + topH + ah + 0.4, c.z, 0xff1010, 2.2, 3.2, 1, 0.5 + rnd() * 0.4, rnd() * 10);
    } else if (topH > 30 && rnd() < 0.3) {
      // rooftop billboard frame lights
      glow.add(c.x + w * 0.4, GROUND + topH + 0.5, c.z + dp * 0.4, 0xff2020, 1.6, 2.2, 1, 0.6, rnd() * 10);
    }
    // vertical neon sign on the face toward the road
    if (!near && c.d < 150 && h > 30 && rnd() < 0.35) {
      const q = track.closest(c.x, c.z, -1, {});
      const dx = q.x - c.x, dz = q.z - c.z;
      let nx = 0, nz = 0, half;
      if (Math.abs(dx) > Math.abs(dz)) { nx = Math.sign(dx); half = w / 2; } else { nz = Math.sign(dz); half = dp / 2; }
      const sh = Math.min(18, h * 0.45), sw = 2.6;
      const y0 = GROUND + 6 + rnd() * Math.max(1, h - sh - 10);
      const cx = c.x + nx * (half + 0.4), cz = c.z + nz * (half + 0.4);
      const g = new THREE.PlaneGeometry(sw, sh);
      // remap uv: strip text runs top→bottom (see Textures.drawStrip)
      const r = stripRects[(rnd() * stripRects.length) | 0];
      const uv = g.attributes.uv;
      for (let i = 0; i < uv.count; i++) {
        const pu = uv.getX(i), pv = uv.getY(i);
        uv.setXY(i, r[0] + (1 - pv) * (r[2] - r[0]), r[1] + pu * (r[3] - r[1]));
      }
      const yaw = Math.atan2(nx, nz);
      batch.add('atlas', g, mat4(cx, y0 + sh / 2, cz, yaw, 1), 0xffffff, 1.6);
      batch.add('metal', boxGeo(sw + 0.3, sh + 0.3, 0.25), mat4(cx - nx * 0.15, y0 + sh / 2, cz - nz * 0.15, yaw, 1), 0x0c0b12);
    }
    // holographic billboard floating on the road side of mid-rise buildings
    if (!near && c.d < 170 && h > 35 && holoCount < (qp.q === 'low' ? 4 : 10) && rnd() < 0.12) {
      const q = track.closest(c.x, c.z, -1, {});
      const dx = q.x - c.x, dz = q.z - c.z;
      const L = Math.hypot(dx, dz) || 1;
      const yaw = Math.atan2(dx / L, dz / L);
      const HW = 16, HH = 4;
      const off = Math.max(w, dp) * 0.5 + 2;
      const m = mat4(c.x + (dx / L) * off, GROUND + h * 0.7, c.z + (dz / L) * off, yaw, 1);
      const g = new THREE.PlaneGeometry(HW, HH);
      g.applyMatrix4(m);
      const r = atlasRect(ATLAS_CELLS.board[(rnd() * 5) | 0]);
      const base = holo.pos.length / 3;
      const pa = g.attributes.position, ua = g.attributes.uv;
      for (let i = 0; i < pa.count; i++) {
        holo.pos.push(pa.getX(i), pa.getY(i), pa.getZ(i));
        holo.uv.push(r[0] + ua.getX(i) * (r[2] - r[0]), r[1] + ua.getY(i) * (r[3] - r[1]));
        holo.seed.push(holoCount);
      }
      for (const i of g.index.array) holo.idx.push(base + i);
      g.dispose();
      holoCount++;
    }
  }
  const geo = new THREE.BoxGeometry(1, 1, 1);
  geo.translate(0, 0.5, 0);
  geo.deleteAttribute('uv');
  const inst = instanced(geo, buildingMaterial(theme), towers, ctx);
  if (inst) inst.frustumCulled = false;
  if (holo.pos.length) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(holo.pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(holo.uv, 2));
    g.setAttribute('aSeed', new THREE.Float32BufferAttribute(holo.seed, 1));
    g.setIndex(holo.idx);
    const mat = new THREE.ShaderMaterial({
      vertexShader: HOLO_VERT, fragmentShader: HOLO_FRAG, transparent: true, depthWrite: false, side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      uniforms: { uMap: { value: ctx.atlas }, uTime: { value: 0 }, uTint: { value: new THREE.Color(theme.wall2) } },
    });
    ctx.timeUniforms.push(mat.uniforms.uTime);
    const mesh = new THREE.Mesh(g, mat);
    mesh.renderOrder = 4;
    ctx.group.add(mesh);
  }
}

// --- arctic --------------------------------------------------------------------------------------
function crystalCluster(rnd, tips = true, count = 6) {
  const parts = [];
  for (let k = 0; k < count; k++) {
    const r = 0.25 + rnd() * 0.35, h = 1.2 + rnd() * 2.6, th = tips ? r * (1.4 + rnd()) : 0.02;
    const prism = new THREE.CylinderGeometry(r, r * 1.08, h, 6, 1);
    prism.translate(0, h / 2, 0);
    const tip = new THREE.ConeGeometry(r, th, 6, 1);
    tip.translate(0, h + th / 2, 0);
    const g = mergeGeometries([prism.toNonIndexed(), tip.toNonIndexed()], false);
    prism.dispose(); tip.dispose();
    const ax = (rnd() - 0.5) * (k ? 1.1 : 0.2), az = (rnd() - 0.5) * (k ? 1.1 : 0.2);
    g.applyMatrix4(mat4((rnd() - 0.5) * 0.9 * (k ? 1 : 0), 0, (rnd() - 0.5) * 0.9 * (k ? 1 : 0), rnd() * 6, 1, k ? 0.6 + rnd() * 0.5 : 1.4, 1, ax, az));
    parts.push(g);
  }
  const merged = mergeGeometries(parts, false);
  parts.forEach((p) => p.dispose());
  merged.deleteAttribute('uv');
  merged.computeVertexNormals();
  const pa = merged.attributes.position;
  let maxY = 0;
  for (let i = 0; i < pa.count; i++) maxY = Math.max(maxY, pa.getY(i));
  const gl = new Float32Array(pa.count);
  for (let i = 0; i < pa.count; i++) gl[i] = Math.pow(Math.max(0, pa.getY(i)) / maxY, 2.2);
  merged.setAttribute('aGlow', new THREE.BufferAttribute(gl, 1));
  return merged;
}

function buildIce(ctx) {
  const { qp, rnd, glow } = ctx;
  const small = [], spires = [], mounds = [];
  scatter(ctx, Math.round(170 * qp.density), 20, 240, rnd, (x, z, d) => {
    const sc = d < 40 ? 1.2 + rnd() * 1.8 : 1.6 + rnd() * 3.2;
    small.push(mat4(x, GROUND - 0.2, z, rnd() * 6, sc, sc * (0.8 + rnd() * 0.6), sc));
  });
  scatter(ctx, Math.round(36 * qp.density) + 6, 70, 420, rnd, (x, z) => {
    const sc = 8 + rnd() * 14;
    spires.push(mat4(x, GROUND - 1, z, rnd() * 6, sc, sc * (1.2 + rnd() * 1.2), sc));
  });
  scatter(ctx, Math.round(60 * qp.density), 24, 300, rnd, (x, z) => {
    const r = 6 + rnd() * 16;
    mounds.push(mat4(x, GROUND - r * 0.18, z, rnd() * 6, r, r * (0.25 + rnd() * 0.2), r * (0.7 + rnd() * 0.6)));
  });
  const iceMat = () => glowMaterial({ color: 0x9fdcff, roughness: 0.12, metalness: 0.3, flatShading: true, envMapIntensity: 1.6 }, 0x2fa8ff, 'ice');
  instanced(crystalCluster(rng(11)), iceMat(), small, ctx);
  instanced(crystalCluster(rng(12), true, 7), iceMat(), spires, ctx);
  const mound = new THREE.IcosahedronGeometry(1, qp.q === 'low' ? 1 : 2);
  displace(mound, 0.25, 1.7, 3);
  instanced(mound, new THREE.MeshStandardMaterial({ color: 0x9cb8d4, roughness: 0.8, metalness: 0, flatShading: true, emissive: 0x040c16 }), mounds, ctx);
}

function displace(geo, amt, freq, seed) {
  const pa = geo.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < pa.count; i++) {
    v.fromBufferAttribute(pa, i);
    const n = fbm(v.x * freq + v.y * 0.7 + 10, v.z * freq - v.y * 0.6 + 10, 3, seed) - 0.5;
    v.multiplyScalar(1 + n * amt * 2);
    pa.setXYZ(i, v.x, v.y, v.z);
  }
  if (geo.attributes.uv) geo.deleteAttribute('uv');
  geo.computeVertexNormals();
}

// --- volcano -------------------------------------------------------------------------------------
function rockGeometry(seed, detail) {
  const g = new THREE.IcosahedronGeometry(1, detail);
  displace(g, 0.32, 1.3, seed);
  const pa = g.attributes.position;
  const gl = new Float32Array(pa.count);
  for (let i = 0; i < pa.count; i++) {
    const y = pa.getY(i), x = pa.getX(i), z = pa.getZ(i);
    const vein = Math.abs(vnoise(x * 3 + seed, z * 3 + y * 2, seed) - 0.5) < 0.05 ? 0.6 : 0;
    gl[i] = Math.pow(Math.max(0, -y * 0.5 + 0.2), 2) * 1.6 + vein;
  }
  g.setAttribute('aGlow', new THREE.BufferAttribute(gl, 1));
  return g;
}

const PLUME_VERT = /* glsl */`
  attribute vec4 aP; // phase, size, seed, corner index packed in uv
  uniform float uTime;
  uniform vec3 uBase;
  varying vec2 vUv;
  varying float vH, vSeed, vLife;
  void main() {
    float life = fract(uTime * 0.012 * (0.8 + aP.z * 0.4) + aP.x);
    vec3 c = uBase + vec3(life * 160.0 + sin(aP.z * 20.0) * 30.0 * life, life * 520.0, life * 60.0 + cos(aP.z * 13.0) * 30.0 * life);
    float size = aP.y * (0.35 + life * 1.4);
    vec4 mv = viewMatrix * vec4(c, 1.0);
    mv.xy += (uv - 0.5) * size;
    vUv = uv; vH = life; vSeed = aP.z; vLife = life;
    gl_Position = projectionMatrix * mv;
  }
`;
const PLUME_FRAG = /* glsl */`
  varying vec2 vUv;
  varying float vH, vSeed, vLife;
  ${GLSL_NOISE}
  void main() {
    vec2 p = vUv - 0.5;
    float r = length(p) * 2.0;
    float n = wkFbm(vUv * 3.0 + vSeed * 7.0, 3);
    float a = (1.0 - smoothstep(0.35, 1.0, r + (n - 0.5) * 0.6)) * smoothstep(0.0, 0.08, vLife) * (1.0 - smoothstep(0.6, 1.0, vLife));
    if (a < 0.01) discard;
    vec3 smoke = mix(vec3(0.07, 0.035, 0.03), vec3(0.16, 0.09, 0.07), n);
    vec3 glowC = vec3(1.0, 0.35, 0.06) * (1.0 - smoothstep(0.0, 0.3, vH)) * (0.6 + 0.6 * (0.5 - p.y));
    gl_FragColor = vec4(smoke + glowC * 1.4, a * 0.85);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

function buildRocks(ctx) {
  const { qp, rnd, glow, volcanoTop } = ctx;
  const a = [], bList = [], cols = [];
  scatter(ctx, Math.round(190 * qp.density), 18, 260, rnd, (x, z, d) => {
    const r = d < 35 ? 1.2 + rnd() * 3 : 2 + rnd() * 9;
    const m = mat4(x, GROUND + r * 0.15, z, rnd() * 6, r, r * (0.55 + rnd() * 0.8), r * (0.7 + rnd() * 0.6), (rnd() - 0.5) * 0.5, (rnd() - 0.5) * 0.5);
    (rnd() < 0.5 ? a : bList).push(m);
  });
  scatter(ctx, Math.round(40 * qp.density), 26, 240, rnd, (x, z, d) => {
    const sc = 1.6 + rnd() * 2.2;
    cols.push(mat4(x, GROUND - 0.4, z, rnd() * 6, sc, sc * (0.7 + rnd() * 1.3), sc));
  });
  const rockMat = () => glowMaterial({ color: 0x2a1a16, roughness: 0.92, metalness: 0.05, flatShading: true }, 0xff4a0a, 'rock');
  const detail = qp.q === 'low' ? 0 : 1;
  instanced(rockGeometry(3, detail), rockMat(), a, ctx);
  instanced(rockGeometry(9, detail), rockMat(), bList, ctx);
  const basalt = crystalCluster(rng(21), false, 7);
  const gl = basalt.attributes.aGlow;
  for (let i = 0; i < gl.count; i++) gl.setX(i, gl.getX(i) > 0.9 ? 0.5 : 0); // glowing hot tops
  instanced(basalt, glowMaterial({ color: 0x1c1414, roughness: 0.85, metalness: 0.1, flatShading: true }, 0xff3a00, 'basalt'), cols, ctx);

  if (volcanoTop) {
    glow.add(volcanoTop.x, volcanoTop.y + 10, volcanoTop.z, 0xff5a10, 2.2, 260, 3, 0.2);
    glow.add(volcanoTop.x, volcanoTop.y + 40, volcanoTop.z, 0xff8a20, 1.2, 160, 3, 0.31);
    const N = qp.q === 'low' ? 8 : 16;
    const pos = [], uv = [], ap = [], idx = [];
    for (let i = 0; i < N; i++) {
      const base = pos.length / 3;
      const seed = rnd();
      for (const [u, v] of [[0, 0], [1, 0], [0, 1], [1, 1]]) { pos.push(0, 0, 0); uv.push(u, v); ap.push(i / N, 120 + seed * 90, seed, 0); }
      idx.push(base, base + 1, base + 2, base + 2, base + 1, base + 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setAttribute('aP', new THREE.Float32BufferAttribute(ap, 4));
    g.setIndex(idx);
    const mat = new THREE.ShaderMaterial({
      vertexShader: PLUME_VERT, fragmentShader: PLUME_FRAG, transparent: true, depthWrite: false,
      uniforms: { uTime: { value: 0 }, uBase: { value: volcanoTop.clone() } },
    });
    ctx.timeUniforms.push(mat.uniforms.uTime);
    const mesh = new THREE.Mesh(g, mat);
    mesh.frustumCulled = false;
    mesh.renderOrder = -2;
    ctx.group.add(mesh);
  }
}
