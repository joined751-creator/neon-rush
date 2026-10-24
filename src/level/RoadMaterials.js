import * as THREE from 'three';
import { TRACK } from '../core/Constants.js';
import { asphaltDetailTexture } from './Textures.js';
import { lampSpacing } from './WorldKit.js';

/**
 * Road + barrier materials: MeshStandardMaterial with injected procedural shading
 * (crisp anti-aliased markings, kerbs, grid boxes, light pools, wet look) — no big textures needed.
 */

const COMMON = /* glsl */`
  float rdBand(float x, float a, float b, float w) { return smoothstep(a - w, a + w, x) - smoothstep(b - w, b + w, x); }
`;

const ROAD_PARS = /* glsl */`
  uniform sampler2D uDetail;
  uniform float uLen, uLampGap, uWet, uFrost, uHalf;
  uniform vec3 uLine, uLamp, uKerbA, uKerbB, uAsphalt;
  varying vec4 vRoad;
  varying vec2 vRoad2;
  float rdH; float rdRough; float rdMetal; vec3 rdEm;
  ${COMMON}
  vec3 rdPerturb(vec3 surf_pos, vec3 surf_norm, vec2 dHdxy, float faceDir) {
    vec3 vSigmaX = normalize(dFdx(surf_pos.xyz));
    vec3 vSigmaY = normalize(dFdy(surf_pos.xyz));
    vec3 R1 = cross(vSigmaY, surf_norm);
    vec3 R2 = cross(surf_norm, vSigmaX);
    float fDet = dot(vSigmaX, R1) * faceDir;
    vec3 vGrad = sign(fDet) * (dHdxy.x * R1 + dHdxy.y * R2);
    return normalize(abs(fDet) * surf_norm - vGrad);
  }
`;

const ROAD_MAIN = /* glsl */`
  {
    float x = vRoad.x, s = vRoad.y;
    float ax = abs(x);
    float fwx = fwidth(x) * 0.8 + 0.003;
    float fws = fwidth(s) * 0.8 + 0.003;
    vec2 p = vec2(x, s);
    float grain = texture2D(uDetail, p / 3.6).r;
    float macro = texture2D(uDetail, p / 64.0 + 0.37).g;
    float macro2 = texture2D(uDetail, p / 23.0 + vec2(0.61, 0.17)).g;
    float bmask = texture2D(uDetail, p / 28.0 + vec2(0.13, 0.71)).b;
    float patchM = smoothstep(0.12, 0.2, bmask) * (1.0 - smoothstep(0.55, 0.75, bmask));
    float crack = smoothstep(0.55, 0.9, bmask);

    float mid = texture2D(uDetail, p / 11.0 + vec2(0.5, 0.25)).r;
    vec3 col = uAsphalt * (0.32 + grain * 0.95) * (0.72 + macro * 0.45) * (0.84 + mid * 0.3);
    col *= mix(1.0, 0.72, patchM);
    col *= mix(1.0, 0.4, crack);
    // rubbered racing line (two tyre tracks following the corner line)
    float wl = vRoad2.x;
    float tyre = exp(-pow((x - wl - 0.9) / 0.6, 2.0)) + exp(-pow((x - wl + 0.9) / 0.6, 2.0));
    tyre *= 0.55 + 0.45 * macro2;
    col *= 1.0 - 0.35 * tyre;
    // faint wear in every lane (two tyre tracks per 5 m lane)
    float la = abs(mod(ax, uHalf * 0.5) - uHalf * 0.25);
    float laneWear = exp(-pow((la - 0.85) / 0.45, 2.0)) * (0.5 + 0.5 * macro2);
    col *= 1.0 - 0.12 * laneWear;
    float rough = 0.86 - tyre * 0.2 - patchM * 0.08 + (grain - 0.5) * 0.12;
    float metal = 0.0;
    float h = (grain - 0.5) * 0.6 - crack * 0.8;
    vec3 em = vec3(0.0);

    // shoulder / gutter between road edge and barrier
    float shoulder = smoothstep(uHalf - fwx, uHalf + fwx, ax);
    col *= 1.0 - 0.45 * shoulder;

    // painted markings (worn by the aggregate)
    float sideKerb = x < 0.0 ? vRoad.z : vRoad.w;
    float kerbOn = smoothstep(0.3, 0.7, sideKerb);
    float edge = rdBand(ax, uHalf - 0.85, uHalf - 0.55, fwx) * (1.0 - kerbOn);
    float dashC = (1.0 - smoothstep(0.13 - fwx, 0.13 + fwx, ax)) * rdBand(mod(s, 12.0), 0.5, 6.5, fws);
    float dashL = rdBand(abs(ax - uHalf * 0.5), -1.0, 0.08, fwx) * rdBand(mod(s, 9.0), 0.5, 3.5, fws);
    float wearP = smoothstep(0.1, 0.5, grain + 0.22) * (1.0 - crack * 0.8);
    float paint = max(edge, max(dashC, dashL * 0.75)) * wearP;
    em += uLine * (edge * 1.45 + dashC * 1.05 + dashL * 0.3) * wearP;

    // kerbs (rumble strips) on corners
    float kb = rdBand(ax, uHalf - 1.4, uHalf + 0.62, fwx) * kerbOn;
    float stripe = smoothstep(-fws * 2.0, fws * 2.0, sin(s * 3.14159265 / 1.5));
    vec3 kcol = mix(uKerbB, uKerbA, stripe);
    col = mix(col, kcol, kb);
    em += uKerbA * kb * stripe * 0.22;
    rough = mix(rough, 0.55, kb);
    h += kb * abs(fract(s / 0.75) - 0.5) * 2.5;

    // start / finish checkered band + grid boxes
    float sd = s < uLen * 0.5 ? s : s - uLen;
    if (abs(sd) < 3.0) {
      float inRoad = 1.0 - smoothstep(uHalf - 0.6 - fwx, uHalf - 0.6 + fwx, ax);
      float cb = rdBand(sd, -1.6, 1.6, fws) * inRoad;
      float ch = smoothstep(-0.15, 0.15, sin(x * 3.14159265 / 1.0) * sin((sd + 1.6) * 3.14159265 / 0.8));
      col = mix(col, mix(vec3(0.015), vec3(0.85), ch), cb);
      em += vec3(0.35) * ch * cb;
      paint *= 1.0 - cb;
      float wl2 = (rdBand(sd, -2.2, -1.9, fws) + rdBand(sd, 1.9, 2.2, fws)) * inRoad;
      paint = max(paint, wl2);
    }
    if (sd < -6.0 && sd > -48.0) {
      for (int r = 0; r < 4; r++) {
        for (int c = 0; c < 2; c++) {
          float sc = 10.0 + float(r) * 9.0 + float(c) * 3.0;
          float u = abs(x - (c == 0 ? -4.2 : 4.2));
          float w = -sd - sc;
          float front = rdBand(w, -2.75, -2.5, fws) * rdBand(u, -1.0, 1.45, fwx);
          float sides = rdBand(u, 1.3, 1.45, fwx) * rdBand(w, -2.75, 0.2, fws);
          paint = max(paint, max(front, sides) * wearP);
        }
      }
    }
    col = mix(col, vec3(0.78, 0.78, 0.82), paint);
    rough = mix(rough, 0.55, paint);

    // arctic frost creeping in from the edges
    if (uFrost > 0.0) {
      float fr = smoothstep(uHalf - 3.0, uHalf + 0.2, ax + (macro2 - 0.5) * 3.0) * uFrost;
      col = mix(col, vec3(0.55, 0.68, 0.8), fr * 0.7);
      rough = mix(rough, 0.35, fr);
    }

    // wet surface: darker, glossy, puddles nearly mirror-like
    if (uWet > 0.0) {
      float puddle = smoothstep(0.64, 0.7, macro2) * (1.0 - kb) * (0.6 + 0.4 * laneWear);
      col *= mix(1.0, 0.6, uWet) * mix(1.0, 0.7, puddle * uWet);
      rough = mix(rough, mix(0.34, 0.1, puddle), uWet * (1.0 - paint * 0.5));
      metal = uWet * 0.1 * (1.0 - paint);
      h *= 1.0 - puddle;
    }

    // light pools under the poles (left at k*D, right at (k+0.5)*D) — wet roads stretch them toward the viewer
    float dl = s - uLampGap * floor(s / uLampGap + 0.5);
    float dr = s - uLampGap * (floor(s / uLampGap) + 0.5);
    float sig = mix(5.5, 9.0, uWet);
    float pool = exp(-dl * dl / (2.0 * sig * sig)) * exp(-pow(x + uHalf * 0.72, 2.0) / 30.0)
               + exp(-dr * dr / (2.0 * sig * sig)) * exp(-pow(x - uHalf * 0.72, 2.0) / 30.0);
    em += uLamp * pool * (0.045 + uWet * 0.08);

    rdH = h * 0.012;
    rdRough = clamp(rough, 0.02, 1.0);
    rdMetal = metal;
    rdEm = em;
    diffuseColor.rgb = col;
  }
`;

// v4.1: the cars' real-time shadow also darkens the ambient / reflected light on the road and barriers
// (most of the road light is ambient + neon reflections, so a direct-light-only shadow would be invisible)
const SHADOW_AMB = /* glsl */`#include <lights_fragment_end>
#if defined( USE_SHADOWMAP ) && NUM_DIR_LIGHT_SHADOWS > 0
  {
    DirectionalLightShadow ksh = directionalLightShadows[ 0 ];
    float sh = getShadow( directionalShadowMap[ 0 ], ksh.shadowMapSize, ksh.shadowIntensity, ksh.shadowBias, ksh.shadowRadius, vDirectionalShadowCoord[ 0 ] );
    float k = mix( 1.0, sh, 0.82 );
    reflectedLight.indirectDiffuse *= k;
    reflectedLight.indirectSpecular *= k;
  }
#endif`;

export function roadMaterial(track, theme, envMap, qp) {
  const detail = asphaltDetailTexture(qp.q === 'low' ? 256 : 512);
  const wet = theme.wet ?? 0;
  const mat = new THREE.MeshStandardMaterial({
    color: 0xffffff, roughness: 0.8, metalness: 0, envMap, envMapIntensity: wet ? 0.65 : 0.35,
  });
  const uniforms = {
    uDetail: { value: detail },
    uLen: { value: track.length },
    uLampGap: { value: lampSpacing(track, qp.poleGap) },
    uWet: { value: wet },
    uFrost: { value: theme.frost ?? 0 },
    uHalf: { value: track.half },
    uLine: { value: new THREE.Color(theme.roadLine) },
    uLamp: { value: new THREE.Color(theme.lamp ?? 0xffd2a0) },
    uKerbA: { value: new THREE.Color(theme.kerbA ?? 0xff2050) },
    uKerbB: { value: new THREE.Color(theme.kerbB ?? 0xe8e8f0) },
    uAsphalt: { value: new THREE.Color(theme.asphalt ?? 0x14121c) },
  };
  mat.userData.disposeExtra = [detail];
  const bump = qp.bump;
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', 'attribute vec4 aRoad;\nattribute vec2 aRoad2;\nvarying vec4 vRoad;\nvarying vec2 vRoad2;\n#include <common>')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvRoad = aRoad; vRoad2 = aRoad2;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\n' + ROAD_PARS)
      .replace('#include <map_fragment>', ROAD_MAIN)
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = rdRough;')
      .replace('#include <metalnessmap_fragment>', 'float metalnessFactor = rdMetal;')
      .replace('#include <normal_fragment_maps>', bump ? 'normal = rdPerturb(-vViewPosition, normal, vec2(dFdx(rdH), dFdy(rdH)), faceDirection);' : '')
      .replace('#include <emissivemap_fragment>', 'totalEmissiveRadiance = rdEm;')
      .replace('#include <lights_fragment_end>', SHADOW_AMB);
  };
  mat.customProgramCacheKey = () => 'nr-road-' + (bump ? 1 : 0);
  return mat;
}

const BAR_PARS = /* glsl */`
  uniform vec3 uColL, uColR, uMetal;
  varying vec4 vBar;
  float brRough; vec3 brEm;
  ${COMMON}
`;
const BAR_MAIN = /* glsl */`
  {
    float s = vBar.x, v = vBar.y, face = vBar.z;
    vec3 nc = mix(uColL, uColR, step(0.5, vBar.w));
    float fw = fwidth(v) * 0.8 + 0.002;
    float fs = fwidth(s) * 0.8 + 0.002;
    vec3 col = uMetal;
    vec3 em = vec3(0.0);
    float rough = 0.34;
    float m4 = mod(s, 4.0);
    float seam = rdBand(m4, -0.05, 0.05, fs) + rdBand(m4, 3.95, 4.05, fs);
    if (face < 0.5) {
      float rib = rdBand(v, 0.28, 0.5, fw) + rdBand(v, 0.6, 0.82, fw);
      col *= (0.7 + 0.6 * rib) * (1.0 - 0.7 * seam);
      em += nc * rdBand(v, 0.03, 0.09, fw) * 0.7;
      em += nc * rdBand(v, 0.99, 1.12, fw) * 0.9;
      float rf = rdBand(mod(s, 8.0), 3.92, 4.08, fs) * rdBand(v, 0.56, 0.63, fw);
      em += vec3(1.0, 0.85, 0.6) * rf * 1.1;
    } else if (face < 1.5) {
      col *= 0.5;
      em += nc * rdBand(v, 0.08, 0.27, fw) * 2.6;
      rough = 0.2;
    } else {
      float pil = rdBand(mod(s, 12.0), 0.0, 0.9, fs);
      float panel = rdBand(mod(v, 3.0), 0.0, 0.08, fw);
      col *= (0.6 + 0.5 * pil) * (1.0 - 0.5 * panel);
      em += nc * rdBand(v, 0.06, 0.13, fw) * 1.1;
      em += nc * pil * 0.08 * step(1.6, v);
      rough = 0.6;
    }
    brRough = rough;
    brEm = em;
    diffuseColor.rgb = col;
  }
`;

export function barrierMaterial(theme, envMap) {
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.35, metalness: 0.75, envMap, envMapIntensity: 1.0 });
  const uniforms = {
    uColL: { value: new THREE.Color(theme.wall) },
    uColR: { value: new THREE.Color(theme.wall2) },
    uMetal: { value: new THREE.Color(theme.barrierMetal ?? 0x2a2734) },
  };
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', 'attribute vec4 aBar;\nvarying vec4 vBar;\n#include <common>')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvBar = aBar;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\n' + BAR_PARS)
      .replace('#include <map_fragment>', BAR_MAIN)
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = brRough;')
      .replace('#include <emissivemap_fragment>', 'totalEmissiveRadiance = brEm;')
      .replace('#include <lights_fragment_end>', SHADOW_AMB);
  };
  mat.customProgramCacheKey = () => 'nr-barrier';
  return mat;
}

export { TRACK };
