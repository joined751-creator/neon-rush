import * as THREE from 'three';
import { THEMES, CAR_TYPES } from '../core/Constants.js';
import { TRACKS } from './TrackDefs.js';
import { TRACK_ACCENT } from '../ui/TrackThumbs.js';
import { CAR_PRICE } from '../core/Progress.js';
import { boxGeo } from './WorldKit.js';
import { buildSkyline } from './Terrain.js';

/*
 * v5.0 "Цифровой мир": an original digital-world theme — black glossy floor with a glowing cyan grid and running
 * light pulses, wire-frame mountains, a distant data-city, light gates over the road, data towers with neon edges,
 * floating wire cubes and giant light pillars; cyan versus orange. Registers the «Сетка» track + theme and the
 * «Вектор» light car (its body kit lives in CarKits). No names, logos or designs from any film are used.
 */

const C1 = 0x00d8ff, C2 = 0xff7a1a;

THEMES.grid = {
  skyTop: 0x000306, skyMid: 0x010b14, skyHorizon: 0x0b4c63, fog: 0x01080f,
  fogNear: 90, fogFar: 1050, ground: 0x010306, grid: C1, sun: false, clouds: true, cityGlow: 0x0a6a88,
  roadLine: C1, wall: C1, wall2: C2, hemiSky: 0x1d5670, hemiGround: 0x010406, dirColor: 0x3a6878,
  props: 'grid', particles: null, stars: false, exposure: 1.0, carLights: 0.85, mountains: 'grid',
  digital: 1, ribbons: true,
  fx: { streak: 0.2, streakCol: 0x40d8ff, god: 0.0, godCol: 0x80e8ff, godThr: 0.9, flare: 0.0, flareCol: 0x9fefff, grade: { lift: [0.0, 0.02, 0.035], gain: [0.98, 1.02, 1.06], sat: 1.12 } },
  asphalt: 0x05080d, lamp: 0x7fe8ff, kerbA: C2, kerbB: 0x04070b, barrierMetal: 0x0a1118,
  signs: [
    { title: 'СЕКТОР 7', sub: 'ЦИФРОВАЯ ЗОНА · ВХОД ПО ПРОТОКОЛУ', c1: '#00e5ff', c2: '#ffffff', icon: 'bolt' },
    { title: 'ПРОТОКОЛ 0', sub: 'СКОРОСТЬ — ЭТО ДАННЫЕ', c1: '#ff7a1a', c2: '#00e5ff', icon: 'wave' },
    { title: 'TURBO FM', sub: '104.8 · ЦИФРОВОЙ ЭФИР', c1: '#00e5ff', c2: '#ff7a1a', icon: 'wave' },
    { title: 'ЯДРО', sub: 'ЭНЕРГИЯ СЕТИ · 99,9%', c1: '#ffffff', c2: '#00e5ff', icon: 'sun' },
    { title: 'VOLT', sub: 'ЗАРЯД СВЕТОМ', c1: '#ff7a1a', c2: '#ffe14d', icon: 'bolt' },
    { title: 'NEON RUSH', sub: 'СТАРТ · ФИНИШ · ГРАН-ПРИ 2084', c1: '#00e5ff', c2: '#ff7a1a', icon: 'flag' },
  ],
  strips: ['СЕКТОР 7', 'ЯДРО', 'СЕТЬ'],
};

for (const t of TRACKS) t.isNew = false;
if (!TRACKS.some((t) => t.id === 'grid')) {
  TRACKS.push({
    id: 'grid',
    name: 'Сетка',
    desc: 'Цифровой мир: световые стены и прямые углы',
    theme: 'grid',
    isNew: true,
    points: [
      [0, -60, 0], [0, 160, 0], [20, 215, 1], [75, 235, 2], [230, 235, 4], [285, 255, 6], [300, 310, 8], [300, 380, 9],
      [320, 425, 9], [370, 440, 8], [470, 440, 6], [515, 420, 4], [530, 370, 2], [530, 150, 0], [510, 100, 0],
      [460, 85, 0], [400, 85, 0], [352, 62, 0], [340, 0, 0], [352, -62, 0], [400, -90, 0], [450, -112, 0],
      [470, -160, 0], [455, -215, 0], [400, -240, 0], [60, -240, 0], [15, -220, 0], [0, -170, 0],
    ],
  });
}
TRACK_ACCENT.grid = { a: '#00e5ff', b: '#ff7a1a', label: 'Сеть' };

if (!CAR_TYPES.some((t) => t.id === 'vector')) {
  CAR_TYPES.push({ id: 'vector', name: 'Вектор', desc: 'Световой болид: чёрный корпус, контур из света и плазменный буст', speed: 0.9, accel: 0.86, handling: 0.84, weight: 0.95, ev: true });
}
CAR_PRICE.vector = 2200;

// ------------------------------------------------------------------------------------------- ground
const G_VERT = /* glsl */`
  varying vec3 vWorld;
  void main() { vec4 w = modelMatrix * vec4(position, 1.0); vWorld = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }
`;
const G_FRAG = /* glsl */`
  uniform vec3 uBase, uC1, uC2, uFog;
  uniform float uFogNear, uFogFar, uTime;
  varying vec3 vWorld;
  float lineAA(float v, float cell, float w) {
    float q = v / cell;
    float fw = max(fwidth(q), 1e-4);
    float g = abs(fract(q - 0.5) - 0.5) / fw;
    return (1.0 - min(g / w, 1.0)) * (1.0 - smoothstep(0.1, 0.4, fw));
  }
  float hash(float n) { return fract(sin(n * 127.1) * 43758.5453); }
  void main() {
    vec2 p = vWorld.xz;
    float dist = length(vWorld - cameraPosition);
    vec3 col = uBase;
    float near = 1.0 - smoothstep(90.0, 360.0, dist);
    float minor = max(lineAA(p.x, 8.0, 0.8), lineAA(p.y, 8.0, 0.8)) * near;
    float mx = lineAA(p.x, 40.0, 1.2), mz = lineAA(p.y, 40.0, 1.2);
    // light pulses racing along the major lines (each line has its own speed and phase)
    float lx = floor(p.x / 40.0 + 0.5), lz = floor(p.y / 40.0 + 0.5);
    float px = fract(p.y / 260.0 - uTime * (0.08 + hash(lx) * 0.12) + hash(lx + 7.0));
    float pz = fract(p.x / 260.0 + uTime * (0.08 + hash(lz + 3.0) * 0.12) + hash(lz + 11.0));
    float pulse = mx * smoothstep(0.86, 1.0, px) * step(0.55, hash(lx + 1.3)) + mz * smoothstep(0.86, 1.0, pz) * step(0.55, hash(lz + 5.1));
    // every 5th major line is orange
    float orange = max(mx * step(0.8, hash(lx * 1.7 + 2.0)), mz * step(0.8, hash(lz * 1.3 + 9.0)));
    vec3 lineCol = mix(uC1, uC2, orange);
    col += uC1 * minor * 0.16;
    col += lineCol * max(mx, mz) * 0.75;
    col += mix(uC1, uC2, orange) * pulse * 2.6;
    // faint reflective sheen toward the horizon
    col += uC1 * 0.025 * smoothstep(200.0, 900.0, dist);
    float fog = smoothstep(uFogNear, uFogFar, dist);
    gl_FragColor = vec4(mix(col, uFog, fog), 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

function digitalGround(ctx) {
  const { theme, group, timeUniforms } = ctx;
  const old = group.children.find((o) => o.isMesh && o.renderOrder === -5);
  if (!old) return;
  const mat = new THREE.ShaderMaterial({
    vertexShader: G_VERT, fragmentShader: G_FRAG,
    uniforms: {
      uBase: { value: new THREE.Color(theme.ground) }, uC1: { value: new THREE.Color(C1) }, uC2: { value: new THREE.Color(C2) },
      uFog: { value: new THREE.Color(theme.fog) }, uFogNear: { value: theme.fogNear * 1.2 }, uFogFar: { value: theme.fogFar }, uTime: { value: 0 },
    },
  });
  // swap the time uniform the generic ground registered for ours
  const i = timeUniforms.indexOf(old.material.uniforms?.uTime);
  if (i >= 0) timeUniforms.splice(i, 1);
  old.material.dispose();
  old.material = mat;
  timeUniforms.push(mat.uniforms.uTime);
}

// ------------------------------------------------------------------------------------------- props
const _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3();
const mat4 = (x, y, z, ry = 0, s = 1, rx = 0, rz = 0) => {
  _e.set(rx, ry, rz); _q.setFromEuler(_e);
  return new THREE.Matrix4().compose(_p.set(x, y, z), _q, _s.set(s, s, s));
};

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
}

/** Box outline (12 edges) as thin neon bars around a w×h×d box whose base sits at y=0. */
function addWireBox(batch, m, w, h, d, color, k, t = 0.18) {
  const X = w / 2, Z = d / 2;
  for (const [x, z] of [[-X, -Z], [X, -Z], [-X, Z], [X, Z]]) batch.add('neon', boxGeo(t, h, t, x, h / 2, z), m, color, k);
  for (const y of [0, h]) {
    batch.add('neon', boxGeo(w + t, t, t, 0, y, -Z), m, color, k);
    batch.add('neon', boxGeo(w + t, t, t, 0, y, Z), m, color, k);
    batch.add('neon', boxGeo(t, t, d + t, -X, y, 0), m, color, k);
    batch.add('neon', boxGeo(t, t, d + t, X, y, 0), m, color, k);
  }
}

export function buildGrid(ctx) {
  const { qp, rnd, glow, batch, track, b, group, timeUniforms, theme } = ctx;
  digitalGround(ctx);
  // distant data-city ring: dark blocks with cyan / orange windows
  group.add(buildSkyline(theme, b, qp, timeUniforms, {
    radii: [520], heights: [150], bins: [240], sil: 0x020a12, win: [0x40e8ff, 0xff8a30],
  }));

  // data towers: dark monoliths with glowing edges and floor bands
  scatter(ctx, Math.round(70 * qp.density) + 10, 45, 430, rnd, (x, z, d) => {
    const w = 6 + rnd() * 12, dd = 6 + rnd() * 12;
    const h = (d < 120 ? 18 : 30) + rnd() * (d < 120 ? 50 : 120);
    const m = mat4(x, -0.6, z, Math.round(rnd() * 4) * (Math.PI / 2) + (rnd() < 0.3 ? 0.4 : 0));
    const col = rnd() < 0.22 ? C2 : C1;
    batch.add('metal', boxGeo(w, h, dd, 0, h / 2, 0), m, 0x06090e);
    addWireBox(batch, m, w, h, dd, col, 1.8, 0.22);
    for (let y = 14; y < h - 6; y += 14 + Math.floor(rnd() * 3) * 7) batch.add('neon', boxGeo(w + 0.12, 0.28, dd + 0.12, 0, y, 0), m, col, 0.9);
    const top = new THREE.Vector3(0, h + 0.6, 0).applyMatrix4(m);
    glow.add(top.x, top.y, top.z, col, 0.9, 4 + w * 0.3, rnd() < 0.3 ? 1 : 3, 0.4 + rnd() * 0.6);
  });

  // floating wire cubes, slightly turned, around and above the circuit
  scatter(ctx, Math.round(26 * qp.density) + 6, 30, 260, rnd, (x, z) => {
    const s = 4 + rnd() * 7;
    const m = mat4(x, 16 + rnd() * 34, z, rnd() * 3, 1, rnd() * 0.8, rnd() * 0.8);
    addWireBox(batch, m, s, s, s, rnd() < 0.3 ? C2 : C1, 1.6, 0.16);
    const c = new THREE.Vector3(0, s / 2, 0).applyMatrix4(m);
    glow.add(c.x, c.y, c.z, C1, 0.35, s * 1.6, 3, 0.3);
  });

  // giant light pillars on the horizon
  scatter(ctx, 12, 320, 620, rnd, (x, z, d, i) => {
    const col = i % 3 === 0 ? C2 : C1;
    const m = mat4(x, -0.6, z);
    batch.add('neon', boxGeo(1.6, 420, 1.6, 0, 210, 0), m, col, 1.4);
    glow.add(x, 4, z, col, 1.2, 40, 3, 0.25, i);
  });

  // light gates over the road: square frames, alternating cyan / orange, away from the start line
  const p = {};
  const L = track.length;
  const n = qp.q === 'low' ? 5 : 9;
  const W = track.half + 4.5, H = 10;
  for (let k = 0; k < n; k++) {
    const s = L * (0.07 + (k / n) * 0.88);
    if (track.ramps.some((r) => Math.abs(r.s - s) < 50)) continue;
    track.pointAt(s, 0, p);
    const m = mat4(p.x, p.y - 0.4, p.z, p.heading);
    const col = k % 2 ? C2 : C1;
    for (const sx of [-1, 1]) {
      batch.add('metal', boxGeo(0.9, H, 0.9, sx * W, H / 2, 0), m, 0x080c12);
      batch.add('neon', boxGeo(0.14, H, 0.14, sx * (W - 0.5), H / 2, -0.5), m, col, 2.2);
      batch.add('neon', boxGeo(0.14, H, 0.14, sx * (W - 0.5), H / 2, 0.5), m, col, 2.2);
    }
    batch.add('metal', boxGeo(W * 2 + 0.9, 0.9, 0.9, 0, H, 0), m, 0x080c12);
    batch.add('neon', boxGeo(W * 2 - 1, 0.14, 0.14, 0, H - 0.5, -0.5), m, col, 2.4);
    batch.add('neon', boxGeo(W * 2 - 1, 0.14, 0.14, 0, H - 0.5, 0.5), m, col, 2.4);
    for (let x = -W + 2; x <= W - 2; x += 4) {
      const g = new THREE.Vector3(x, H - 0.6, 0).applyMatrix4(m);
      glow.add(g.x, g.y, g.z, col, 0.5, 2.2, 3, 0.8, k + x * 0.1);
    }
  }

  // a huge tilted light ring hanging in the sky beyond the circuit
  const az = rnd() * Math.PI * 2, R = (b.rMax ?? b.r) + 380;
  const ring = mat4(b.cx + Math.cos(az) * R, 230, b.cz + Math.sin(az) * R, -az + Math.PI / 2, 1, 0.35, 0);
  batch.add('neon', new THREE.TorusGeometry(120, 1.4, 6, 96), ring, C1, 1.6);
  batch.add('neon', new THREE.TorusGeometry(108, 0.6, 4, 96), ring, C2, 1.4);
}
