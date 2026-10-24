import * as THREE from 'three';
import { Pass, FullScreenQuad } from 'three/addons/postprocessing/Pass.js';

/**
 * v4.1 "cinematic light" post pass, run on the HDR image after bloom:
 *  - anamorphic streaks: long horizontal flares from the brightest lights (headlights, neon, the sun);
 *  - light rays (god rays) streaming out of the sun / moon / planet when it is on screen;
 *  - lens flare: ghosts and a halo along the line from the light through the screen centre,
 *    faded out automatically when the light is hidden behind a mountain, a building or a car.
 * Streaks and rays are computed at quarter resolution, so the pass is cheap enough for phones.
 * Split-screen aware: every effect stays inside its own viewport (up to 2 views).
 */

const VERT = /* glsl */`varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;

// which split-screen view a pixel belongs to (rects in 0..1 frame coords, unused rect has zero size)
const VIEW_PICK = /* glsl */`
  uniform vec4 uRect[2];
  int pickView(vec2 uv) {
    vec4 q = uRect[1];
    if (q.z > 0.0 && uv.x >= q.x && uv.x <= q.x + q.z && uv.y >= q.y && uv.y <= q.y + q.w) return 1;
    return 0;
  }
  vec4 viewRect(vec2 uv) { return pickView(uv) == 1 ? uRect[1] : uRect[0]; }
`;

const BRIGHT_FRAG = /* glsl */`
  uniform sampler2D tDiffuse; uniform vec2 uTexel; uniform float uThr; varying vec2 vUv;
  void main() {
    vec2 o = uTexel * 1.5;
    vec3 c = (texture2D(tDiffuse, vUv + vec2(-o.x, -o.y)).rgb + texture2D(tDiffuse, vUv + vec2(o.x, -o.y)).rgb
            + texture2D(tDiffuse, vUv + vec2(-o.x, o.y)).rgb + texture2D(tDiffuse, vUv + vec2(o.x, o.y)).rgb) * 0.25;
    float l = max(c.r, max(c.g, c.b));
    c *= max(l - uThr, 0.0) / max(l, 1e-4);
    gl_FragColor = vec4(min(c, vec3(16.0)), 1.0);
  }`;

const STREAK_FRAG = /* glsl */`
  uniform sampler2D tDiffuse; uniform vec2 uTexel; uniform float uStep, uFall; varying vec2 vUv;
  ${VIEW_PICK}
  void main() {
    vec4 r = viewRect(vUv);
    float lo = r.x + uTexel.x, hi = r.x + r.z - uTexel.x;
    vec3 sum = texture2D(tDiffuse, vUv).rgb;
    float ws = 1.0, w = 1.0;
    for (int k = 1; k <= 7; k++) {
      w *= uFall;
      float o = float(k) * uStep * uTexel.x;
      sum += w * (texture2D(tDiffuse, vec2(clamp(vUv.x + o, lo, hi), vUv.y)).rgb + texture2D(tDiffuse, vec2(clamp(vUv.x - o, lo, hi), vUv.y)).rgb);
      ws += 2.0 * w;
    }
    gl_FragColor = vec4(sum / ws, 1.0);
  }`;

const GOD_FRAG = /* glsl */`
  uniform sampler2D tDiffuse; uniform vec3 uLight[2]; uniform vec2 uAsp; uniform float uThr; varying vec2 vUv;
  ${VIEW_PICK}
  void main() {
    int vi = pickView(vUv);
    vec3 L = vi == 1 ? uLight[1] : uLight[0];
    if (L.z <= 0.001) { gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0); return; }
    vec4 r = vi == 1 ? uRect[1] : uRect[0];
    float asp = vi == 1 ? uAsp.y : uAsp.x;
    vec2 lo = r.xy + 0.002, hi = r.xy + r.zw - 0.002;
    vec2 st = (vUv - L.xy) / 36.0 * 0.92;
    vec2 p = vUv;
    float decay = 1.0;
    vec3 acc = vec3(0.0);
    for (int i = 0; i < 36; i++) {
      p -= st;
      vec2 pc = clamp(p, lo, hi);
      vec3 s = texture2D(tDiffuse, pc).rgb;
      float l = max(s.r, max(s.g, s.b));
      s *= max(l - uThr, 0.0) / max(l, 1e-4);
      vec2 dd = (pc - L.xy) / r.zw * vec2(asp, 1.0);
      float m = 1.0 - smoothstep(0.02, 0.32, length(dd)); // only light near the source streams out as rays
      acc += min(s, vec3(6.0)) * m * decay;
      decay *= 0.955;
    }
    gl_FragColor = vec4(acc * (L.z / 36.0), 1.0);
  }`;

const COMP_FRAG = /* glsl */`
  uniform sampler2D tDiffuse, tStreak, tGod, tBright;
  uniform vec3 uLight[2]; uniform vec2 uAsp;
  uniform vec3 uStreakCol, uGodCol, uFlareCol;
  uniform float uStreak, uGod, uFlare;
  varying vec2 vUv;
  ${VIEW_PICK}
  float disc(vec2 q, vec2 c, float rad, float asp) {
    float d = length((q - c) * vec2(asp, 1.0));
    return smoothstep(rad, rad * 0.55, d) * (0.6 + 0.4 * smoothstep(rad * 0.3, rad, d)); // brighter rim
  }
  void main() {
    vec3 col = texture2D(tDiffuse, vUv).rgb;
    col += texture2D(tStreak, vUv).rgb * uStreakCol * uStreak;
    col += texture2D(tGod, vUv).rgb * uGodCol * uGod;
    int vi = pickView(vUv);
    vec3 L = vi == 1 ? uLight[1] : uLight[0];
    if (L.z > 0.001 && uFlare > 0.0) {
      vec4 r = vi == 1 ? uRect[1] : uRect[0];
      float asp = vi == 1 ? uAsp.y : uAsp.x;
      // how much of the light is actually visible: brightness right at the source (occluders make it dark)
      vec2 t = vec2(0.006, 0.006 * asp);
      vec3 b = texture2D(tDiffuse, L.xy).rgb + texture2D(tDiffuse, L.xy + vec2(t.x, 0.0)).rgb + texture2D(tDiffuse, L.xy - vec2(t.x, 0.0)).rgb
             + texture2D(tDiffuse, L.xy + vec2(0.0, t.y)).rgb + texture2D(tDiffuse, L.xy - vec2(0.0, t.y)).rgb;
      float vis = smoothstep(0.35, 1.1, max(b.r, max(b.g, b.b)) * 0.2) * L.z;
      if (vis > 0.002) {
        vec2 q = (vUv - r.xy) / r.zw;
        vec2 lq = (L.xy - r.xy) / r.zw;
        vec2 dir = vec2(0.5) - lq;
        vec3 f = vec3(0.0);
        f += vec3(0.9, 0.5, 1.0) * disc(q, lq + dir * 0.55, 0.035, asp) * 0.35;
        f += vec3(0.4, 0.8, 1.0) * disc(q, lq + dir * 0.85, 0.065, asp) * 0.22;
        f += vec3(1.0, 0.75, 0.4) * disc(q, lq + dir * 1.2, 0.02, asp) * 0.5;
        f += vec3(0.5, 1.0, 0.7) * disc(q, lq + dir * 1.5, 0.11, asp) * 0.12;
        f += vec3(1.0, 0.4, 0.7) * disc(q, lq + dir * 1.85, 0.045, asp) * 0.25;
        float dl = length((q - lq) * vec2(asp, 1.0));
        // rainbow halo ring around the light
        vec3 rb = 0.5 + 0.5 * cos(6.2831 * (dl * 2.2 + vec3(0.0, 0.33, 0.67)));
        f += rb * exp(-pow((dl - 0.28) * 34.0, 2.0)) * 0.12;
        // soft glare + horizontal anamorphic line through the source
        f += uFlareCol * (exp(-dl * 9.0) * 0.45);
        f += uFlareCol * exp(-abs(q.y - lq.y) * 260.0) * exp(-abs(q.x - lq.x) * asp * 2.2) * 0.8;
        col += f * uFlareCol * vis * uFlare;
      }
    }
    gl_FragColor = vec4(col, 1.0);
  }`;

const rtOpts = { type: THREE.HalfFloatType, depthBuffer: false };

export class CinematicPass extends Pass {
  constructor() {
    super();
    this.needsSwap = true;
    this.rtBright = new THREE.WebGLRenderTarget(1, 1, rtOpts);
    this.rtA = new THREE.WebGLRenderTarget(1, 1, rtOpts);
    this.rtB = new THREE.WebGLRenderTarget(1, 1, rtOpts);
    this.rtGod = new THREE.WebGLRenderTarget(1, 1, rtOpts);
    const rect = () => ({ value: [new THREE.Vector4(0, 0, 1, 1), new THREE.Vector4(0, 0, 0, 0)] });
    this.rect = rect();
    this.light = { value: [new THREE.Vector3(), new THREE.Vector3()] };
    this.asp = { value: new THREE.Vector2(16 / 9, 16 / 9) };
    this.brightMat = new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: BRIGHT_FRAG,
      uniforms: { tDiffuse: { value: null }, uTexel: { value: new THREE.Vector2() }, uThr: { value: 2.2 } },
    });
    this.streakMat = new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: STREAK_FRAG,
      uniforms: { tDiffuse: { value: null }, uTexel: { value: new THREE.Vector2() }, uStep: { value: 1 }, uFall: { value: 0.9 }, uRect: this.rect },
    });
    this.godMat = new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: GOD_FRAG,
      uniforms: { tDiffuse: { value: null }, uLight: this.light, uAsp: this.asp, uThr: { value: 0.9 }, uRect: this.rect },
    });
    this.compMat = new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: COMP_FRAG,
      uniforms: {
        tDiffuse: { value: null }, tStreak: { value: this.rtA.texture }, tGod: { value: this.rtGod.texture }, tBright: { value: this.rtBright.texture },
        uLight: this.light, uAsp: this.asp, uRect: this.rect,
        uStreakCol: { value: new THREE.Color(0.4, 0.6, 1) }, uGodCol: { value: new THREE.Color(1, 0.8, 0.6) }, uFlareCol: { value: new THREE.Color(1, 0.8, 0.6) },
        uStreak: { value: 0.25 }, uGod: { value: 0.6 }, uFlare: { value: 0.5 },
      },
    });
    this.quad = new FullScreenQuad(null);
    this.anyLight = false;
  }

  /** fx: theme.fx — { streak, streakCol, god, godCol, godThr, flare, flareCol } */
  setLook(fx = {}) {
    const u = this.compMat.uniforms;
    u.uStreak.value = fx.streak ?? 0.25;
    u.uStreakCol.value.set(fx.streakCol ?? 0x6699ff);
    u.uGod.value = fx.god ?? 0;
    u.uGodCol.value.set(fx.godCol ?? 0xffd0a0);
    u.uFlare.value = fx.flare ?? 0;
    u.uFlareCol.value.set(fx.flareCol ?? 0xffd0a0);
    this.godMat.uniforms.uThr.value = fx.godThr ?? 0.9;
    this.brightMat.uniforms.uThr.value = fx.streakThr ?? 2.2;
  }

  /** views: [{x,y,w,h}] frame fractions; lights: [{x,y,s}] light position in frame uv + strength (0 = off). */
  setViews(views, W, H) {
    for (let i = 0; i < 2; i++) {
      const v = views[i];
      if (v) this.rect.value[i].set(v.x, v.y, v.w, v.h); else this.rect.value[i].set(0, 0, 0, 0);
      const a = v ? (v.w * W) / Math.max(1, v.h * H) : 1;
      if (i === 0) this.asp.value.x = a; else this.asp.value.y = a;
    }
  }

  setLights(lights) {
    this.anyLight = false;
    for (let i = 0; i < 2; i++) {
      const l = lights[i];
      if (l && l.s > 0.001) { this.light.value[i].set(l.x, l.y, l.s); this.anyLight = true; } else this.light.value[i].set(0, 0, 0);
    }
  }

  setSize(w, h) {
    const qw = Math.max(1, Math.floor(w / 4)), qh = Math.max(1, Math.floor(h / 4));
    for (const t of [this.rtBright, this.rtA, this.rtB, this.rtGod]) t.setSize(qw, qh);
    this.brightMat.uniforms.uTexel.value.set(1 / Math.max(1, w), 1 / Math.max(1, h));
    this.streakMat.uniforms.uTexel.value.set(1 / qw, 1 / qh);
  }

  pass(renderer, mat, target) {
    this.quad.material = mat;
    renderer.setRenderTarget(target);
    this.quad.render(renderer);
  }

  render(renderer, writeBuffer, readBuffer) {
    const u = this.compMat.uniforms;
    // bright parts → quarter resolution, then three ever-wider horizontal blurs (= long anamorphic streaks)
    if (u.uStreak.value > 0) {
      this.brightMat.uniforms.tDiffuse.value = readBuffer.texture;
      this.pass(renderer, this.brightMat, this.rtBright);
      const s = this.streakMat.uniforms;
      let src = this.rtBright, dst = this.rtA;
      for (const [step, fall] of [[1, 0.88], [5, 0.86], [25, 0.84]]) {
        s.tDiffuse.value = src.texture; s.uStep.value = step; s.uFall.value = fall;
        this.pass(renderer, this.streakMat, dst);
        src = dst; dst = dst === this.rtA ? this.rtB : this.rtA;
      }
      u.tStreak.value = src.texture;
    }
    // light rays from the sun / moon / planet
    if (u.uGod.value > 0 && this.anyLight) {
      this.godMat.uniforms.tDiffuse.value = readBuffer.texture;
      this.pass(renderer, this.godMat, this.rtGod);
    } else {
      renderer.setRenderTarget(this.rtGod);
      renderer.clear();
    }
    u.tDiffuse.value = readBuffer.texture;
    const fl = u.uFlare.value;
    if (!this.anyLight) u.uFlare.value = 0;
    this.pass(renderer, this.compMat, this.renderToScreen ? null : writeBuffer);
    u.uFlare.value = fl;
  }

  dispose() {
    for (const t of [this.rtBright, this.rtA, this.rtB, this.rtGod]) t.dispose();
    for (const m of [this.brightMat, this.streakMat, this.godMat, this.compMat]) m.dispose();
    this.quad.dispose();
  }
}
