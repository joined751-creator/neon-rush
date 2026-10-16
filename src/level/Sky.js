import * as THREE from 'three';
import { GLSL_NOISE } from './WorldKit.js';

/** Per-theme procedural sky dome: gradient bands, retro sun, moon, stars, aurora, clouds/smoke, lightning. */

const VERT = /* glsl */`
  varying vec3 vDir;
  void main() {
    vDir = position;
    vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    gl_Position = p.xyww;
  }
`;

const FRAG = /* glsl */`
  uniform vec3 uTop, uMid, uHorizon, uFog, uSun1, uSun2, uSunDir, uMoonDir, uGlow, uCloud;
  uniform float uTime, uFlash, uBoltAz, uAuroraAz;
  varying vec3 vDir;
  ${GLSL_NOISE}
  float angDiff(float a, float b) { float d = a - b; return atan(sin(d), cos(d)); }
  // noise along the azimuth that wraps seamlessly (atan jumps at ±PI)
  float azNoise(float az, float freq, float y) { return wkNoise(vec2(cos(az), sin(az)) * freq + vec2(y, y * 1.7)); }
  void main() {
    vec3 d = normalize(vDir);
    float h = d.y;
    float hp = max(h, 0.0);
    float az = atan(d.x, d.z);
    vec3 col = mix(uHorizon, uMid, smoothstep(0.0, 0.3, pow(hp, 0.85)));
    col = mix(col, uTop, smoothstep(0.22, 0.95, hp));
    col += uHorizon * 0.42 * exp(-hp * 20.0);

  #ifdef STARS
    if (h > 0.03) {
      vec3 sp = d * 150.0;
      vec3 cell = floor(sp);
      float r = wkHash3(cell);
      if (r > 0.972) {
        vec3 o = vec3(wkHash3(cell + 1.3), wkHash3(cell + 2.7), wkHash3(cell + 4.1)) - 0.5;
        float dd = length(fract(sp) - 0.5 - o * 0.6);
        float fw = length(fwidth(sp));
        float rad = max(0.07, fw * 0.7);
        float br = (r - 0.972) / 0.028;
        float tw = 0.6 + 0.4 * sin(uTime * (1.3 + br * 4.0) + r * 91.0);
        float energy = 0.07 / rad;
        col += mix(vec3(0.75, 0.85, 1.0), vec3(1.0, 0.85, 0.75), fract(r * 37.0)) * (1.0 - smoothstep(rad * 0.4, rad, dd)) * (0.25 + br * br * 1.6) * tw * energy * smoothstep(0.03, 0.35, h);
      }
    }
  #endif

  #ifdef SUN
    {
      vec3 sd = normalize(uSunDir);
      float ang = acos(clamp(dot(d, sd), -1.0, 1.0));
      float fa = fwidth(ang) + 1e-4;
    #ifdef SUN_HAZY
      float R = 0.055;
      float disk = 1.0 - smoothstep(R - fa, R + fa, ang);
      col = mix(col, mix(uSun2, uSun1, 0.25) * 1.2, disk * 0.85);
      col += uSun2 * (0.35 * exp(-ang * 9.0) + 0.15 * exp(-ang * 2.5));
    #else
      float R = 0.17;
      float rel = (h - sd.y) / R;
      vec3 sunCol = mix(uSun2, uSun1, smoothstep(-0.95, 0.75, rel));
      float stripe = 1.0;
      if (rel < 0.32) {
        float k = (0.32 - rel) / 1.32;
        float ph = fract(rel * 4.2 + uTime * 0.06);
        float g = k * 0.8;
        float w = fwidth(rel * 4.2) + 1e-4;
        stripe = smoothstep(g - w, g + w, ph);
      }
      float inside = 1.0 - smoothstep(R - fa, R + fa, ang);
      vec3 halo = uSun2 * 0.4 * exp(-ang * 5.0) + uSun1 * 0.1 * exp(-ang * 16.0);
      col += halo * (1.0 - inside);
      col = mix(col, sunCol * 1.3, inside * stripe);
      col = mix(col, mix(uMid, uHorizon, 0.35) * 0.55, inside * (1.0 - stripe)); // dark slits through the sun
      // thin dark strata crossing the sun
      float strata = smoothstep(0.55, 0.85, azNoise(az, 7.0, h * 70.0 + uTime * 0.01)) * exp(-abs(h - 0.075) * 38.0);
      col = mix(col, uMid * 0.55, strata * 0.75);
    #endif
    }
  #endif

  #ifdef MOON
    {
      vec3 md = normalize(uMoonDir);
      float ma = acos(clamp(dot(d, md), -1.0, 1.0));
      float fa = fwidth(ma) + 1e-4;
      float MR = 0.04;
      vec3 mr = normalize(cross(md, vec3(0.0, 1.0, 0.0)));
      vec3 mu = cross(mr, md);
      vec2 mp = vec2(dot(d - md, mr), dot(d - md, mu)) / MR;
      float crater = wkFbm(mp * 2.2 + 3.0, 3);
      float limb = sqrt(max(0.0, 1.0 - dot(mp, mp)));
      vec3 mcol = vec3(0.86, 0.9, 1.0) * (0.55 + 0.55 * crater) * (0.55 + 0.45 * limb);
      float disk = 1.0 - smoothstep(MR - fa, MR + fa, ma);
      col = mix(col, mcol * 1.5, disk);
      col += vec3(0.45, 0.55, 0.95) * (0.22 * exp(-ma * 16.0) + 0.06 * exp(-ma * 4.0));
    }
  #endif

  #ifdef AURORA
    if (h > 0.02) {
      vec3 ac = vec3(0.0);
      for (int i = 0; i < 3; i++) {
        float fi = float(i);
        float yc = 0.2 + fi * 0.085 + 0.06 * sin(az * (2.0 + fi) + fi * 1.9 + uTime * 0.06)
                 + 0.07 * (azNoise(az, 2.4, fi * 11.0 + uTime * 0.03) - 0.5);
        float t = h - yc;
        float curtain = t < 0.0 ? exp(t * 70.0) : exp(-t * (5.0 + fi * 2.0));
        float rays = 0.35 + 0.65 * azNoise(az + sin(uTime * 0.2 + az * 3.0) * 0.03, 70.0, fi * 17.0 + uTime * 0.25);
        float fold = 0.45 + 0.55 * smoothstep(-0.4, 0.9, sin(az * 5.0 + uTime * 0.18 + fi * 2.3 + azNoise(az, 3.0, fi) * 4.0));
        vec3 c = mix(vec3(0.1, 1.0, 0.5), vec3(0.75, 0.25, 1.0), smoothstep(0.0, 0.22, t));
        ac += c * curtain * rays * fold * (1.0 - fi * 0.22);
      }
      float side = 0.35 + 0.65 * smoothstep(-0.4, 0.7, cos(angDiff(az, uAuroraAz)));
      col += ac * 0.75 * side * smoothstep(0.02, 0.12, h);
    }
  #endif

  #ifdef CLOUDS
    {
      vec2 cp = d.xz / (hp + 0.1) * 1.2 + vec2(uTime * 0.012, uTime * 0.005);
      float n = wkFbm(cp, OCT);
      float dens = smoothstep(0.45, 0.8, n) * smoothstep(-0.01, 0.12, h) * (1.0 - smoothstep(0.55, 0.95, hp) * 0.6);
      vec3 cl = mix(uGlow * 0.5, uCloud, smoothstep(0.02, 0.4, hp));
      cl += vec3(0.55, 0.6, 1.0) * uFlash * 1.2 * (0.6 + 0.4 * n);
      col = mix(col, cl, dens * 0.9);
      col += uGlow * 0.3 * exp(-hp * 10.0);
    }
  #endif

  #ifdef SMOKE
    {
      vec2 cp = d.xz / (hp + 0.12) * 0.9 + vec2(uTime * 0.03, -uTime * 0.012);
      float n = wkFbm(cp, OCT);
      float n2 = wkFbm(cp * 2.3 + 7.0, 2);
      float dens = smoothstep(0.3, 0.75, n * 0.75 + n2 * 0.35) * smoothstep(-0.01, 0.1, h);
      vec3 cl = mix(uGlow * (0.7 + 0.5 * n2), uCloud, smoothstep(0.0, 0.35, hp));
      col = mix(col, cl, dens * 0.85);
    }
  #endif

    if (uFlash > 0.0) {
      float dx = angDiff(az, uBoltAz);
      float jag = (wkNoise(vec2(h * 22.0, uBoltAz * 7.0)) - 0.5) * 0.08 + (wkNoise(vec2(h * 80.0, 3.0 + uBoltAz)) - 0.5) * 0.02;
      float bolt = (1.0 - smoothstep(0.0, 0.004 + fwidth(dx), abs(dx - jag))) * step(0.0, h) * step(h, 0.42);
      col += vec3(0.75, 0.8, 1.0) * uFlash * 0.45 * (0.4 + smoothstep(0.0, 0.6, hp)) + vec3(1.0) * bolt * uFlash * 3.0;
    }
    // below the horizon fade into the fog colour (ground/mountains cover most of it)
    col = mix(col, uFog, smoothstep(0.0, -0.06, h));
    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

export function buildSky(theme, qp, sunDir) {
  const defines = { OCT: qp.q === 'low' ? 2 : 4 };
  if (theme.stars) defines.STARS = 1;
  if (theme.sun) { defines.SUN = 1; if (theme.smoke) defines.SUN_HAZY = 1; }
  if (theme.moon) defines.MOON = 1;
  if (theme.aurora) defines.AURORA = 1;
  if (theme.clouds && qp.clouds) defines.CLOUDS = 1;
  if (theme.smoke) defines.SMOKE = 1;
  const moonDir = new THREE.Vector3(-sunDir.x * 0.6 + sunDir.z * 0.8, 0.32, -sunDir.z * 0.6 - sunDir.x * 0.8).normalize();
  const mat = new THREE.ShaderMaterial({
    vertexShader: VERT, fragmentShader: FRAG, depthWrite: false, side: THREE.BackSide, defines,
    uniforms: {
      uTop: { value: new THREE.Color(theme.skyTop) }, uMid: { value: new THREE.Color(theme.skyMid) },
      uHorizon: { value: new THREE.Color(theme.skyHorizon) }, uFog: { value: new THREE.Color(theme.fog) },
      uSun1: { value: new THREE.Color(theme.sunColor1 ?? 0xffffff) }, uSun2: { value: new THREE.Color(theme.sunColor2 ?? 0xffffff) },
      uSunDir: { value: sunDir.clone() }, uMoonDir: { value: moonDir },
      uGlow: { value: new THREE.Color(theme.cityGlow ?? theme.skyHorizon) },
      uCloud: { value: new THREE.Color(theme.skyMid).multiplyScalar(0.7) },
      uTime: { value: 0 }, uFlash: { value: 0 }, uBoltAz: { value: 0 },
      uAuroraAz: { value: Math.atan2(sunDir.x, sunDir.z) },
    },
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(1000, 48, 24), mat);
  sky.frustumCulled = false;
  sky.renderOrder = -10;
  sky.onBeforeRender = (r, s, cam) => { sky.position.copy(cam.position); sky.updateMatrixWorld(); };
  return sky;
}
