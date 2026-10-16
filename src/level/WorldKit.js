import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { gameState } from '../core/GameState.js';

/** Shared helpers for the world builders: quality profile, seeded RNG, noise, geometry batching, glow points. */

export function qualityProfile() {
  const p = baseProfile();
  // phones: same look, cheaper shaders (2-octave sky, no road bump, fewer particles / spectators)
  if (typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches) {
    Object.assign(p, { mobile: true, bump: false, clouds: false, weather: p.weather * 0.6, density: p.density * 0.8, crowd: p.crowd * 0.6, ringSeg: Math.round(p.ringSeg * 0.75) });
  }
  return p;
}

function baseProfile() {
  const q = gameState.settings?.quality || 'medium';
  if (q === 'low') return { q, density: 0.4, rings: 2, ringSeg: 180, crowd: 0.35, bump: false, atlas: 1024, weather: 0.4, clouds: false, poleGap: 64 };
  if (q === 'high') return { q, density: 1, rings: 3, ringSeg: 320, crowd: 1, bump: true, atlas: 2048, weather: 1, clouds: true, poleGap: 40 };
  return { q, density: 0.7, rings: 3, ringSeg: 240, crowd: 0.65, bump: true, atlas: 2048, weather: 0.7, clouds: true, poleGap: 48 };
}

/** Small deterministic RNG (mulberry32) so a track always looks the same. */
export function rng(seed = 1) {
  let a = seed >>> 0;
  const f = () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  f.range = (lo, hi) => lo + f() * (hi - lo);
  f.pick = (arr) => arr[Math.floor(f() * arr.length) % arr.length];
  return f;
}

export function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

// --- value noise (JS side, for geometry) -------------------------------------------------------
function h2(x, y, s) {
  let n = Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(s, 1442695041);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}
const fade = (t) => t * t * (3 - 2 * t);
export function vnoise(x, y, seed = 0) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const u = fade(xf), v = fade(yf);
  const a = h2(xi, yi, seed), b = h2(xi + 1, yi, seed), c = h2(xi, yi + 1, seed), d = h2(xi + 1, yi + 1, seed);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
export function fbm(x, y, oct = 4, seed = 0) {
  let s = 0, amp = 0.5, f = 1, norm = 0;
  for (let i = 0; i < oct; i++) { s += vnoise(x * f, y * f, seed + i * 17) * amp; norm += amp; amp *= 0.5; f *= 2.03; }
  return s / norm;
}
export function ridged(x, y, oct = 4, seed = 0) {
  let s = 0, amp = 0.5, f = 1, norm = 0, w = 1;
  for (let i = 0; i < oct; i++) {
    let n = 1 - Math.abs(vnoise(x * f, y * f, seed + i * 31) * 2 - 1);
    n *= n * w;
    w = Math.min(1, n * 1.6);
    s += n * amp; norm += amp; amp *= 0.5; f *= 2.1;
  }
  return s / norm;
}

// --- GLSL snippets ------------------------------------------------------------------------------
export const GLSL_NOISE = /* glsl */`
  float wkHash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
  float wkHash3(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
  float wkNoise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(wkHash(i), wkHash(i + vec2(1.0, 0.0)), u.x), mix(wkHash(i + vec2(0.0, 1.0)), wkHash(i + vec2(1.0, 1.0)), u.x), u.y);
  }
  float wkFbm(vec2 p, int oct) {
    float s = 0.0, a = 0.5;
    for (int i = 0; i < 5; i++) { if (i >= oct) break; s += wkNoise(p) * a; p = p * 2.03 + vec2(1.7, 9.2); a *= 0.5; }
    return s / (1.0 - pow(0.5, float(oct)));
  }
`;

// --- geometry batching --------------------------------------------------------------------------
const _c = new THREE.Color();
/**
 * Collects geometry pieces (transformed to world space, with per-piece vertex colour and optional
 * atlas uv rect) into buckets; build() merges every bucket into one mesh → one draw call per material.
 */
export class Batcher {
  constructor() { this.buckets = new Map(); }

  /** geo is consumed (disposed after merge). color: THREE.Color|number (may be HDR via scale). rect: [u0,v0,u1,v1]. */
  add(key, geo, matrix, color = 0xffffff, scale = 1, rect = null) {
    let g = geo.index ? geo : geo; // keep indexing as-is; normalised below
    if (!g.index) {
      const n = g.attributes.position.count;
      const idx = new (n > 65535 ? Uint32Array : Uint16Array)(n);
      for (let i = 0; i < n; i++) idx[i] = i;
      g.setIndex(new THREE.BufferAttribute(idx, 1));
    }
    if (!g.attributes.normal) g.computeVertexNormals();
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv' && k !== 'color') g.deleteAttribute(k);
    if (matrix) g.applyMatrix4(matrix);
    const n = g.attributes.position.count;
    if (!g.attributes.color) {
      _c.set(color).multiplyScalar(scale);
      const col = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) { col[i * 3] = _c.r; col[i * 3 + 1] = _c.g; col[i * 3 + 2] = _c.b; }
      g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    }
    if (rect) {
      const uv = g.attributes.uv;
      for (let i = 0; i < n; i++) {
        uv.setXY(i, rect[0] + uv.getX(i) * (rect[2] - rect[0]), rect[1] + uv.getY(i) * (rect[3] - rect[1]));
      }
    }
    if (!this.buckets.has(key)) this.buckets.set(key, []);
    this.buckets.get(key).push(g);
  }

  /** Returns a Mesh for the bucket (or null if empty). */
  mesh(key, material) {
    const list = this.buckets.get(key);
    if (!list || !list.length) { material.dispose(); return null; }
    // geometries need identical index presence and attribute sets — normalised in add()
    const merged = mergeGeometries(list, false);
    for (const g of list) g.dispose();
    this.buckets.delete(key);
    const m = new THREE.Mesh(merged, material);
    m.matrixAutoUpdate = false;
    return m;
  }
}

export function boxGeo(w, h, d, x = 0, y = 0, z = 0) {
  const g = new THREE.BoxGeometry(w, h, d);
  if (x || y || z) g.translate(x, y, z);
  return g;
}

/** Thin box between two points (for truss members). */
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _q = new THREE.Quaternion(), _up = new THREE.Vector3(0, 1, 0), _m = new THREE.Matrix4(), _s = new THREE.Vector3(1, 1, 1);
export function strutGeo(ax, ay, az, bx, by, bz, t = 0.12) {
  _a.set(ax, ay, az); _b.set(bx, by, bz);
  const len = _a.distanceTo(_b);
  const g = new THREE.BoxGeometry(t, len, t);
  _b.sub(_a).normalize();
  _q.setFromUnitVectors(_up, _b);
  _m.compose(_a.add(_b.multiplyScalar(len / 2)), _q, _s);
  // _a now holds the mid point
  g.applyMatrix4(_m);
  return g;
}

export function quadGeo(w, h) {
  return new THREE.PlaneGeometry(w, h);
}

// --- glow points (beacons, lamp halos, crowd flashes) ------------------------------------------
const GLOW_VERT = /* glsl */`
  uniform float uTime, uViewH;
  attribute vec3 aColor;
  attribute vec4 aParam; // size(m), mode, freq, phase
  varying vec3 vCol;
  varying float vA;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    float dist = -mv.z;
    float px = aParam.x * projectionMatrix[1][1] * uViewH * 0.5 / max(dist, 0.1);
    float k = 1.0;
    float m = aParam.y, t = uTime * aParam.z + aParam.w;
    if (m > 0.5 && m < 1.5) k = step(0.55, fract(t));                       // blink
    else if (m > 1.5 && m < 2.5) k = step(0.93, fract(sin(floor(t) * 91.7 + aParam.w * 13.0) * 4375.5)); // random flash
    else if (m > 2.5) k = 0.55 + 0.45 * sin(t * 6.2831);                      // pulse
    vA = k * smoothstep(4.0, 12.0, dist);  // no blobs right in front of the camera
    gl_PointSize = clamp(px, 1.5, 48.0);
    if (vA < 0.01) gl_PointSize = 0.0;
    vCol = aColor;
    gl_Position = projectionMatrix * mv;
  }
`;
const GLOW_FRAG = /* glsl */`
  varying vec3 vCol;
  varying float vA;
  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float d = dot(c, c) * 4.0;
    float a = exp(-d * 5.0) + 0.5 * exp(-d * 18.0);
    if (a < 0.01) discard;
    gl_FragColor = vec4(vCol * a * vA, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;
const _vp = new THREE.Vector4();
export class GlowPoints {
  constructor() { this.pos = []; this.col = []; this.par = []; }
  /** mode: 0 steady, 1 blink, 2 random flash, 3 pulse */
  add(x, y, z, color, intensity, size, mode = 0, freq = 1, phase = Math.random() * 10) {
    _c.set(color).multiplyScalar(intensity);
    this.pos.push(x, y, z); this.col.push(_c.r, _c.g, _c.b); this.par.push(size, mode, freq, phase);
  }
  build() {
    if (!this.pos.length) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('aColor', new THREE.Float32BufferAttribute(this.col, 3));
    g.setAttribute('aParam', new THREE.Float32BufferAttribute(this.par, 4));
    this.material = new THREE.ShaderMaterial({
      vertexShader: GLOW_VERT, fragmentShader: GLOW_FRAG, transparent: true, depthWrite: false,
      blending: THREE.AdditiveBlending, uniforms: { uTime: { value: 0 }, uViewH: { value: 720 } },
    });
    const pts = new THREE.Points(g, this.material);
    pts.frustumCulled = false;
    pts.renderOrder = 5;
    const u = this.material.uniforms.uViewH;
    pts.onBeforeRender = (r) => { r.getCurrentViewport(_vp); u.value = _vp.w || 720; };
    this.pos = this.col = this.par = null;
    return pts;
  }
}
export function setViewHUniform(obj, uniform) {
  obj.onBeforeRender = (r) => { r.getCurrentViewport(_vp); uniform.value = _vp.w || 720; };
}

/** Light-pole spacing that divides the lap exactly, shared by the poles (Dressing) and the road light pools. */
export function lampSpacing(track, gap) {
  return track.length / Math.max(1, Math.round(track.length / gap));
}
