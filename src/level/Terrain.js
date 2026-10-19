import * as THREE from 'three';
import { GLSL_NOISE, ridged, fbm, rng } from './WorldKit.js';

/** Ground plane, layered mountain ridges (parallax rings), the volcano and distant city skylines. */

// ------------------------------------------------------------------------------------- ground
const GROUND_VERT = /* glsl */`
  varying vec3 vWorld;
  void main() {
    vec4 w = modelMatrix * vec4(position, 1.0);
    vWorld = w.xyz;
    gl_Position = projectionMatrix * viewMatrix * w;
  }
`;
const GROUND_FRAG = /* glsl */`
  uniform vec3 uBase, uGrid, uFog, uCenter;
  uniform float uFogNear, uFogFar, uTime;
  varying vec3 vWorld;
  ${GLSL_NOISE}
  float gridLine(vec2 p, float cell, float w) {
    vec2 q = p / cell;
    vec2 fw = max(fwidth(q), vec2(1e-4));
    vec2 g = abs(fract(q - 0.5) - 0.5) / fw;
    float dens = 1.0 - smoothstep(0.08, 0.35, max(fw.x, fw.y)); // fade once cells shrink below ~4 px
    return (1.0 - min(min(g.x, g.y) / w, 1.0)) * dens;
  }
  void main() {
    vec2 p = vWorld.xz;
    float dist = length(vWorld - cameraPosition);
    vec3 col = uBase;
  #if MODE == 0
    float fadeMinor = 1.0 - smoothstep(120.0, 420.0, dist);
    float minor = gridLine(p, 10.0, 0.9) * fadeMinor;
    float major = gridLine(p, 50.0, 1.1) * 0.7;
    float pulse = 0.7 + 0.3 * sin(uTime * 1.6 - length(p - uCenter.xz) * 0.025);
    col += uGrid * (minor * 0.28 + major * 0.85) * pulse;
    col += uGrid * 0.06 * wkNoise(p * 0.01);
  #elif MODE == 1
    float n = wkNoise(p * 0.04) * 0.6 + wkNoise(p * 0.3) * 0.4;
    col *= 0.6 + 0.8 * n;
    float streets = gridLine(p + 18.0, 72.0, 1.3) * (1.0 - smoothstep(150.0, 600.0, dist));
    col += uGrid * streets * 0.16;
  #elif MODE == 2
    float n = wkFbm(p * 0.015, 3);
    float drift = wkNoise(p * vec2(0.08, 0.02));
    col = mix(uBase * 0.75, uBase * 1.3, n * 0.7 + drift * 0.3);
    vec2 gc = floor(p * 2.5);
    float gl = step(0.988, wkHash(gc)) * (0.5 + 0.5 * sin(uTime * 4.0 + wkHash(gc + 3.0) * 40.0));
    col += vec3(0.8, 0.95, 1.0) * gl * (1.0 - smoothstep(15.0, 70.0, dist)) * 1.2;
    col += uGrid * gridLine(p, 50.0, 1.2) * 0.07 * (1.0 - smoothstep(100.0, 500.0, dist));
  #else
    // basalt with glowing crack network and slow lava rivers
    float n = wkNoise(p * 0.05) * 0.6 + wkNoise(p * 0.4) * 0.4;
    col *= 0.6 + 0.8 * n;
    vec2 q = p / 18.0;
    vec2 ip = floor(q), fp = fract(q);
    float f1 = 8.0, f2 = 8.0;
  #ifdef LOWQ
    f2 = 9.0;
  #else
    for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
      vec2 g = vec2(float(i), float(j));
      vec2 o = vec2(wkHash(ip + g), wkHash(ip + g + 17.3));
      float dd = length(g + o - fp);
      if (dd < f1) { f2 = f1; f1 = dd; } else if (dd < f2) f2 = dd;
    }
  #endif
    float fq = fwidth(q.x);
    float crack = (1.0 - smoothstep(0.0, 0.035 + fq * 1.5, f2 - f1)) * (1.0 - smoothstep(0.015, 0.06, fq));
    float hot = smoothstep(0.45, 0.8, wkNoise(p * 0.012 + 3.0));
    float heat = 0.55 + 0.45 * sin(uTime * 1.7 + wkHash(ip) * 6.28);
    col += vec3(1.0, 0.3, 0.04) * crack * heat * (0.03 + hot * 0.5) * (1.0 - smoothstep(150.0, 600.0, dist));
    vec2 wp = p * 0.0028 + vec2(wkNoise(p * 0.003), wkNoise(p * 0.003 + 9.0)) * 0.9;
    float rv = abs(wkNoise(wp) - 0.5);
    float river = 1.0 - smoothstep(0.006, 0.016, rv);
    float flow = wkNoise(p * 0.06 + vec2(uTime * 0.25, uTime * 0.1));
    vec3 lava = mix(vec3(0.9, 0.18, 0.02), vec3(1.0, 0.6, 0.15), flow) * (0.5 + 0.7 * flow);
    col = mix(col, lava, river * 0.9);
    col += vec3(0.6, 0.12, 0.02) * (1.0 - smoothstep(0.016, 0.07, rv)) * 0.25;
  #endif
    float fog = smoothstep(uFogNear, uFogFar, dist);
    gl_FragColor = vec4(mix(col, uFog, fog), 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

export function buildGround(theme, b, uniformsOut, qp) {
  const mode = theme.props === 'palms' ? 0 : theme.props === 'city' ? 1 : theme.props === 'ice' ? 2 : 3;
  const base = new THREE.Color(theme.ground);
  if (mode === 2) base.set(0x41617e);
  const mat = new THREE.ShaderMaterial({
    vertexShader: GROUND_VERT, fragmentShader: GROUND_FRAG, defines: qp?.q === 'low' ? { MODE: mode, LOWQ: 1 } : { MODE: mode },
    uniforms: {
      uBase: { value: base }, uGrid: { value: new THREE.Color(theme.grid) },
      uFog: { value: new THREE.Color(theme.fog) }, uFogNear: { value: theme.fogNear * 1.2 }, uFogFar: { value: theme.fogFar },
      uTime: { value: 0 }, uCenter: { value: new THREE.Vector3(b.cx, 0, b.cz) },
    },
  });
  uniformsOut.push(mat.uniforms.uTime);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(5000, 5000), mat);
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(b.cx, -0.6, b.cz);
  ground.renderOrder = -5;
  return ground;
}

// ------------------------------------------------------------------------------------ mountains
const MTN_VERT = /* glsl */`
  attribute vec4 aM; // grid u, grid v, height 0..1, ring index
  varying vec4 vM;
  varying vec3 vN, vW;
  void main() {
    vM = aM;
    vN = normalize(mat3(modelMatrix) * normal);
    vec4 w = modelMatrix * vec4(position, 1.0);
    vW = w.xyz;
    gl_Position = projectionMatrix * viewMatrix * w;
  }
`;
const MTN_FRAG = /* glsl */`
  uniform vec3 uBase, uLine, uLine2, uHaze, uLightDir, uLightCol, uRim;
  uniform float uTime;
  varying vec4 vM;
  varying vec3 vN, vW;
  ${GLSL_NOISE}
  void main() {
    float ring = vM.w, h01 = clamp(vM.z, 0.0, 1.0);
    vec3 n = normalize(vN);
    float lam = max(dot(n, uLightDir), 0.0);
    vec3 col;
  #if STYLE == 0
    vec2 g = vM.xy;
    vec2 fw = max(fwidth(g), vec2(1e-4));
    vec2 gl = abs(fract(g - 0.5) - 0.5) / fw;
    float line = 1.0 - min(min(gl.x, gl.y), 1.0);
    line *= 1.0 - smoothstep(0.35, 0.8, max(fw.x, fw.y)); // fade when the mesh grid gets denser than ~2 px
    col = uBase * (0.5 + 0.7 * lam) + uRim * pow(1.0 - max(n.y, 0.0), 3.0) * 0.15;
    vec3 lc = mix(uLine, uLine2, smoothstep(0.2, 0.9, h01));
    col += lc * line * (0.45 + 1.1 * h01) * (1.0 - min(ring, 3.0) * 0.18);
    float ridge = smoothstep(0.82, 1.0, h01);
    col += uLine2 * ridge * 0.25;
  #elif STYLE == 1
    float nz = wkFbm(vW.xz * 0.012 + vW.y * 0.01, 3);
    float snow = smoothstep(0.5, 0.75, n.y * 0.75 + h01 * 0.55 + (nz - 0.5) * 0.5);
    vec3 rock = vec3(0.045, 0.07, 0.11);
    vec3 sn = vec3(0.72, 0.84, 0.96);
    col = mix(rock, sn, snow) * (0.32 + 0.85 * lam);
    col += uRim * pow(1.0 - abs(dot(n, normalize(cameraPosition - vW))), 3.0) * 0.25 * snow;
  #else
    col = vec3(0.05, 0.028, 0.025) * (0.35 + 0.9 * lam);
    float v = abs(wkNoise(vW.xz * 0.012 + vec2(vW.y * 0.02)) - 0.5);
    float v2 = abs(wkNoise(vW.xz * 0.03 + 5.0 + vec2(vW.y * 0.04)) - 0.5);
    float vein = (1.0 - smoothstep(0.0, 0.03, v)) * 0.8 + (1.0 - smoothstep(0.0, 0.02, v2)) * 0.5;
    float pulse = 0.65 + 0.35 * sin(uTime * 1.3 + vW.x * 0.01);
    col += vec3(1.0, 0.3, 0.04) * vein * pulse * (1.4 - h01) * 0.75;
    if (ring > 3.5) {
      // the volcano: lava streams down the flanks from the crater
      float flow = smoothstep(0.86, 1.0, sin(vM.x * 0.55 + wkNoise(vec2(vM.x * 0.3, h01 * 4.0)) * 3.0));
      float f2 = wkNoise(vec2(vM.x * 2.0, h01 * 30.0 - uTime * 0.8));
      col += mix(vec3(1.0, 0.25, 0.02), vec3(1.0, 0.7, 0.2), f2) * flow * smoothstep(0.25, 0.85, h01) * 2.2;
      col += vec3(1.0, 0.35, 0.05) * smoothstep(0.93, 1.0, h01) * 2.5;
    }
  #endif
    float haze = clamp(0.04 + min(ring, 3.0) * 0.15 + (1.0 - h01) * 0.38, 0.0, 0.93);
    col = mix(col, uHaze, haze);
    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

/** Ridge ring around (cx, cz). Fills arrays; returns nothing. */
function addRing(out, { cx, cz, R, W, H, seg, rows, seed, ring, gapAz, gapW, gapK, patchy = 0 }) {
  const base = out.pos.length / 3;
  const freq = (Math.PI * 2 * R) / 380 / (Math.PI * 2);
  for (let a = 0; a <= seg; a++) {
    const ang = (a / seg) * Math.PI * 2;
    const ca = Math.cos(ang), sa = Math.sin(ang);
    let dAz = Math.abs(Math.atan2(Math.sin(ang - gapAz), Math.cos(ang - gapAz)));
    const gap = gapW > 0 ? gapK + (1 - gapK) * Math.min(1, Math.max(0, (dAz - gapW * 0.5) / gapW)) : 1;
    let big = 0.55 + 0.9 * fbm(ca * freq * 0.35 + 50, sa * freq * 0.35 + 50, 2, seed + 7);
    if (patchy) { const pn = fbm(ca * 4 + 20, sa * 4 + 20, 3, seed + 3); big *= Math.min(1, Math.max(0, (pn - 0.38) / 0.22)) * 1.6; }
    for (let r = 0; r <= rows; r++) {
      const t = r / rows;
      const rad = R + (t - 0.5) * W;
      const prof = Math.pow(Math.sin(Math.PI * Math.min(1, t * 1.15)), 0.75);
      const n = ridged(ca * freq + t * 1.3, sa * freq - t * 1.1, 5, seed);
      const hgt = H * prof * (0.25 + 0.95 * n) * big * gap;
      const y = hgt - 4;
      out.pos.push(cx + ca * rad, y, cz + sa * rad);
      out.am.push(a / 2, r, hgt / (H * 1.25), ring);
    }
  }
  const stride = rows + 1;
  for (let a = 0; a < seg; a++) {
    for (let r = 0; r < rows; r++) {
      const i0 = base + a * stride + r, i1 = i0 + stride;
      out.idx.push(i0, i1, i0 + 1, i1, i1 + 1, i0 + 1);
    }
  }
}

/** Volcano cone (lathe with noise) appended to the ring arrays with ring id 3. */
function addVolcano(out, x, z, Rb, Rt, H, seed) {
  const base = out.pos.length / 3;
  const seg = 96, rows = 22;
  for (let a = 0; a <= seg; a++) {
    const ang = (a / seg) * Math.PI * 2;
    const ca = Math.cos(ang), sa = Math.sin(ang);
    for (let r = 0; r <= rows; r++) {
      const t = r / rows;
      let rad, y;
      if (t < 0.88) {
        const k = t / 0.88;
        rad = Rb + (Rt - Rb) * Math.pow(k, 0.7);
        y = H * (1 - Math.pow(1 - k, 1.6));
      } else {
        const k = (t - 0.88) / 0.12;
        rad = Rt * (1 - k * 0.55);
        y = H - k * H * 0.12;
      }
      const n = fbm(ca * 3 + t * 4, sa * 3 + t * 4, 4, seed) - 0.5;
      rad *= 1 + n * 0.22 * (1 - t);
      y += n * H * 0.08 * Math.sin(Math.PI * Math.min(1, t * 1.1));
      out.pos.push(x + ca * rad, y - 4, z + sa * rad);
      out.am.push(a, r, y / H, 4);
    }
  }
  const stride = rows + 1;
  for (let a = 0; a < seg; a++) for (let r = 0; r < rows; r++) {
    const i0 = base + a * stride + r, i1 = i0 + stride;
    out.idx.push(i0, i0 + 1, i1, i1, i0 + 1, i1 + 1);
  }
}

export function buildMountains(theme, b, qp, sunDir, uniformsOut) {
  const style = theme.mountains === 'snow' ? 1 : theme.mountains === 'lava' ? 2 : 0;
  const out = { pos: [], am: [], idx: [] };
  const gapAz = Math.atan2(sunDir.z, sunDir.x);
  const r0 = b.rMax ?? b.r;
  const all = [
    { R: r0 + 230, W: 170, H: 42, rows: 8, seg: 0.8, patchy: 1 },
    { R: r0 + 540, W: 260, H: 100, rows: 10, seg: 0.85 },
    { R: r0 + 880, W: 380, H: 190, rows: 12, seg: 0.95 },
    { R: r0 + 1320, W: 520, H: 330, rows: 12, seg: 1 },
  ];
  const pick = qp.q === 'low' ? [1, 3] : qp.q === 'medium' ? [0, 1, 3] : [0, 1, 2, 3];
  for (const i of pick) {
    const rg = all[i];
    addRing(out, {
      cx: b.cx, cz: b.cz, R: rg.R, W: rg.W, H: rg.H * (style === 2 ? 1.15 : 1), seg: Math.round(qp.ringSeg * rg.seg),
      rows: rg.rows, seed: 101 + i * 13, ring: i, patchy: rg.patchy,
      gapAz, gapW: theme.sun && !theme.smoke ? 0.5 : 0, gapK: 0.22,
    });
  }
  let volcanoTop = null;
  if (style === 2) {
    const a = gapAz + 0.55;
    const R = r0 + 1050;
    const x = b.cx + Math.cos(a) * R, z = b.cz + Math.sin(a) * R;
    addVolcano(out, x, z, 420, 95, 360, 77);
    volcanoTop = new THREE.Vector3(x, 360 - 4 - 360 * 0.12, z);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(out.pos, 3));
  g.setAttribute('aM', new THREE.Float32BufferAttribute(out.am, 4));
  g.setIndex(out.idx);
  g.computeVertexNormals();
  const haze = new THREE.Color(theme.fog).lerp(new THREE.Color(theme.skyHorizon), style === 0 ? 0.35 : 0.25);
  const ld = new THREE.Vector3(sunDir.x, Math.max(0.35, sunDir.y + 0.4), sunDir.z).normalize();
  const mat = new THREE.ShaderMaterial({
    vertexShader: MTN_VERT, fragmentShader: MTN_FRAG, defines: { STYLE: style },
    uniforms: {
      uBase: { value: new THREE.Color(style === 0 ? 0x16062a : 0x101010) },
      uLine: { value: new THREE.Color(theme.grid).multiplyScalar(1.1) },
      uLine2: { value: new THREE.Color(theme.wall2 ?? theme.grid).multiplyScalar(1.2) },
      uHaze: { value: haze }, uLightDir: { value: ld }, uLightCol: { value: new THREE.Color(theme.dirColor) },
      uRim: { value: new THREE.Color(theme.aurora ? 0x40ffb0 : theme.skyHorizon) },
      uTime: { value: 0 },
    },
  });
  uniformsOut.push(mat.uniforms.uTime);
  const mesh = new THREE.Mesh(g, mat);
  mesh.frustumCulled = false;
  mesh.matrixAutoUpdate = false;
  return { mesh, volcanoTop };
}

// --------------------------------------------------------------------------------- city skyline
const SKY_VERT = /* glsl */`
  attribute vec3 aSk; // azimuth 0..1, height 0..1, ring
  varying vec3 vSk;
  void main() {
    vSk = aSk;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
const SKY_FRAG = /* glsl */`
  uniform vec3 uSil, uWin, uWin2, uHaze, uAccent, uAccent2;
  uniform float uTime;
  uniform vec4 uRings;   // bins0, Hm0, bins1, Hm1
  uniform vec3 uSector;  // centre (0..1), half width (0..1), enabled
  varying vec3 vSk;
  ${GLSL_NOISE}
  void main() {
    float ring = vSk.z;
    float bins = ring < 0.5 ? uRings.x : uRings.z;
    float Hm = ring < 0.5 ? uRings.y : uRings.w;
    float taper = 1.0;
    if (uSector.z > 0.5) {
      float da = abs(fract(vSk.x - uSector.x + 0.5) - 0.5);
      if (da > uSector.y) discard;
      taper = smoothstep(uSector.y, uSector.y * 0.55, da);
    }
    float az = vSk.x * bins;
    float b = floor(az);
    float fx = fract(az);
    float hb = wkHash(vec2(b, ring * 7.0 + 1.0));
    float cl = wkNoise(vec2(b * 0.045, ring * 3.0));
    float bh = (0.12 + 0.88 * pow(hb, 2.2) * (0.35 + 0.9 * cl)) * Hm * (0.25 + 0.75 * taper);
    // stepped crowns
    float y = vSk.y * Hm;
    float crown = step(0.6, wkHash(vec2(b, 9.0)));
    float bh2 = bh * (1.0 - crown * 0.12 * step(0.3, abs(fx - 0.5)));
    if (y > bh2) discard;
    vec3 col = uSil;
    // windows
    vec2 wc = vec2(az * 5.0, y / 3.6);
    vec2 cell = floor(wc), f = fract(wc);
    float fwv = max(fwidth(wc.x), fwidth(wc.y));
    float lit = step(0.62, wkHash(cell + b * 0.13)) * step(0.18, wkHash(vec2(floor(y / 3.6), b)));
    float shape = step(0.2, f.x) * step(f.x, 0.8) * step(0.25, f.y) * step(f.y, 0.75);
    float win = mix(lit * shape, 0.13, smoothstep(0.12, 0.42, fwv));
    vec3 wcol = mix(uWin, uWin2, step(0.7, wkHash(cell + 3.7)));
    col += wcol * win * (0.5 + 0.7 * wkHash(cell + 1.1));
    // neon crown lines + edge strips on some towers
    float tag = wkHash(vec2(b, 4.0));
    if (tag > 0.72) col += mix(uAccent, uAccent2, step(0.86, tag)) * (1.0 - smoothstep(0.0, 1.6, bh2 - y)) * 2.2;
    if (tag > 0.9) col += uAccent2 * (1.0 - smoothstep(0.0, 0.06, min(fx, 1.0 - fx))) * 1.2;
    // aviation light on the tallest
    if (bh > Hm * 0.62) col += vec3(1.0, 0.05, 0.05) * step(0.5, fract(uTime * 0.7 + hb * 5.0)) * (1.0 - smoothstep(0.0, 1.2, abs(y - bh + 1.0))) * step(abs(fx - 0.5), 0.12) * 3.0;
    float haze = clamp(0.25 + ring * 0.25 + (1.0 - vSk.y * Hm / max(bh, 1.0) * 0.6) * 0.3, 0.0, 0.9);
    col = mix(col, uHaze, haze);
    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

export function buildSkyline(theme, b, qp, uniformsOut, opts = {}) {
  const pos = [], ask = [], idx = [];
  const radii = opts.radii ?? [700, 1250];
  const heights = opts.heights ?? [210, 330];
  const bins = opts.bins ?? [520, 760];
  const ringsCount = qp.q === 'low' ? 1 : radii.length;
  for (let ring = 0; ring < ringsCount; ring++) {
    const R = (b.rMax ?? b.r) + radii[ring];
    const Hm = heights[ring];
    const seg = 160;
    const base = pos.length / 3;
    for (let a = 0; a <= seg; a++) {
      const ang = (a / seg) * Math.PI * 2;
      for (const v of [0, 1]) {
        pos.push(b.cx + Math.cos(ang) * R, -4 + v * Hm, b.cz + Math.sin(ang) * R);
        ask.push(a / seg, v, ring);
      }
    }
    for (let a = 0; a < seg; a++) { const i = base + a * 2; idx.push(i, i + 2, i + 1, i + 1, i + 2, i + 3); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aSk', new THREE.Float32BufferAttribute(ask, 3));
  g.setIndex(idx);
  const mat = new THREE.ShaderMaterial({
    vertexShader: SKY_VERT, fragmentShader: SKY_FRAG, side: THREE.DoubleSide,
    uniforms: {
      uSil: { value: new THREE.Color(0x07061a) }, uWin: { value: new THREE.Color(0xffc27a) }, uWin2: { value: new THREE.Color(0x7fd8ff) },
      uHaze: { value: new THREE.Color(theme.fog).lerp(new THREE.Color(theme.skyHorizon), 0.45) },
      uAccent: { value: new THREE.Color(theme.wall) }, uAccent2: { value: new THREE.Color(theme.wall2) }, uTime: { value: 0 },
      uRings: { value: new THREE.Vector4(bins[0], heights[0], bins[1] ?? bins[0], heights[1] ?? heights[0]) },
      uSector: { value: new THREE.Vector3(opts.sector?.[0] ?? 0, opts.sector?.[1] ?? 0.5, opts.sector ? 1 : 0) },
    },
  });
  if (opts.sil) mat.uniforms.uSil.value.set(opts.sil);
  if (opts.win) { mat.uniforms.uWin.value.set(opts.win[0]); mat.uniforms.uWin2.value.set(opts.win[1]); }
  uniformsOut.push(mat.uniforms.uTime);
  const mesh = new THREE.Mesh(g, mat);
  mesh.frustumCulled = false;
  mesh.matrixAutoUpdate = false;
  return mesh;
}

export { rng };
