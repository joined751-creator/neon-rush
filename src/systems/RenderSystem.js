import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { Pass } from 'three/addons/postprocessing/Pass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { FXAAShader } from 'three/addons/shaders/FXAAShader.js';
import { GAME } from '../core/Constants.js';
import { CinematicPass } from './CinematicPass.js';

/** Speed FX: radial blur + chromatic aberration per viewport (strength 0..1). */
const SpeedShader = {
  uniforms: {
    tDiffuse: { value: null },
    uRect: { value: [new THREE.Vector4(0, 0, 1, 1), new THREE.Vector4(0, 0, 0, 0)] },
    uStr: { value: [0, 0] },
    uLift: { value: new THREE.Vector3() }, uGain: { value: new THREE.Vector3(1, 1, 1) }, uSat: { value: 1 },
    uGrain: { value: 0.025 }, uTime: { value: 0 }, uCA: { value: 0.0022 }, uRain: { value: 0 }, uAspect: { value: 1.78 },
    uHeat: { value: [new THREE.Vector3(), new THREE.Vector3()] },
  },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform vec4 uRect[2]; uniform float uStr[2]; varying vec2 vUv;
    uniform vec3 uLift, uGain; uniform float uSat, uGrain, uTime, uCA, uRain, uAspect;
    uniform vec3 uHeat[2]; // v5.5 heat haze behind a boosting car: frame uv of the exhausts + strength
    vec2 heat(vec2 uv) {
      vec2 o = vec2(0.0);
      for (int i = 0; i < 2; i++) {
        vec3 H = uHeat[i];
        if (H.z <= 0.0) continue;
        vec2 d = (uv - H.xy + vec2(0.0, 0.045)) * vec2(uAspect, 1.0) / vec2(0.16, 0.09);
        float m = exp(-dot(d, d));
        o += vec2(sin(uv.y * 170.0 + uTime * 31.0) + 0.5 * sin(uv.y * 410.0 - uTime * 47.0),
                  cos(uv.x * 140.0 - uTime * 26.0)) * 0.0028 * H.z * m;
      }
      return o;
    }
    // v4.2 raindrops on the lens (Neon City): round drops that appear, sit, some slide down; each bends the picture
    vec3 dropLayer(vec2 uv, float t, float sc, float seed) {
      vec2 p = uv * vec2(uAspect, 1.0) * sc;
      vec2 id = floor(p); vec2 f = fract(p) - 0.5;
      float h = fract(sin(dot(id + seed, vec2(12.9898, 78.233))) * 43758.5453);
      float h2 = fract(h * 91.7 + seed), h3 = fract(h * 37.3);
      float life = fract(t * (0.12 + 0.1 * h3) + h);
      vec2 pos = (vec2(h, h2) - 0.5) * 0.55;
      float slide = step(0.68, h3);
      pos.y += 0.25 - slide * life * life * 0.9;
      vec2 dd = f - pos; dd.y *= 1.0 + slide * 0.6;
      float rad = 0.09 + 0.1 * h2;
      float m = smoothstep(rad, rad * 0.55, length(dd)) * smoothstep(1.0, 0.8, life) * smoothstep(0.0, 0.06, life) * step(0.25, h2);
      return vec3(dd / rad * m, m);
    }
    vec3 rain(vec2 uv) {
      vec3 a = dropLayer(uv, uTime, 7.0, 0.0), b = dropLayer(uv, uTime * 1.3, 13.0, 3.1);
      return a + b * 0.7;
    }
    // v4.1 per-track colour grade (HDR, before tone mapping): tinted shadows (lift), tinted highlights (gain),
    // saturation, a subtle film grain and a touch of lens chromatic aberration towards the frame edges
    vec3 grade(vec3 c, vec2 uv) {
      float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
      c = mix(vec3(l), c, uSat);
      c = c * uGain + uLift * (1.0 - smoothstep(0.0, 0.6, l));
      float n = fract(sin(dot(uv * 1000.0 + uTime * 13.7, vec2(12.9898, 78.233))) * 43758.5453) - 0.5;
      c += n * uGrain * (0.25 + l);
      return max(c, vec3(0.0));
    }
    void main(){
      vec2 uv = vUv + heat(vUv); float drop = 0.0;
      if (uRain > 0.0) { vec3 rd = rain(vUv); uv -= rd.xy * 0.018 * uRain; drop = rd.z * uRain; }
      float s = 0.0; vec2 c = vec2(0.5); vec4 r = vec4(0.0, 0.0, 1.0, 1.0);
      for (int i = 0; i < 2; i++) {
        vec4 q = uRect[i];
        if (uv.x >= q.x && uv.x <= q.x + q.z && uv.y >= q.y && uv.y <= q.y + q.w) { s = uStr[i]; r = q; c = q.xy + q.zw * vec2(0.5, 0.52); }
      }
      vec2 d = uv - c;
      float l = length(d / r.zw);
      // cinematic grade: soft vignette + gentle contrast, always on
      float vig = 1.0 - 0.38 * smoothstep(0.35, 1.05, l);
      if (s < 0.002) {
        vec2 ca = d * uCA * l * l;
        vec3 b = vec3(texture2D(tDiffuse, uv + ca).r, texture2D(tDiffuse, uv).g, texture2D(tDiffuse, uv - ca).b);
        b = mix(b, b * b * (3.0 - 2.0 * min(b, 1.0)), 0.12);
        gl_FragColor = vec4(grade(b, uv) * vig * (1.0 + 0.12 * drop), 1.0); return;
      }
      float amt = s * smoothstep(0.15, 0.75, l) * 0.045;
      vec3 col = vec3(0.0);
      for (int k = 0; k < 8; k++) {
        float t = float(k) / 7.0;
        vec2 o = d * amt * t;
        vec2 lo = r.xy + 0.001, hi = r.xy + r.zw - 0.001;
        col.r += texture2D(tDiffuse, clamp(uv - o * 1.15, lo, hi)).r;
        col.g += texture2D(tDiffuse, clamp(uv - o, lo, hi)).g;
        col.b += texture2D(tDiffuse, clamp(uv - o * 0.85, lo, hi)).b;
      }
      col /= 8.0;
      col = mix(col, col * col * (3.0 - 2.0 * min(col, 1.0)), 0.12);
      gl_FragColor = vec4(grade(col, uv) * vig * (1.0 + 0.12 * drop), 1.0);
    }`,
};

/**
 * Guard before bloom: a mirror-sharp highlight can overflow the half-float buffer (Inf/NaN). Bloom then spread that
 * one pixel into a glowing white square with a black dot in the middle. Clamp it to a bright-but-finite value.
 */
const SanitizeShader = {
  uniforms: { tDiffuse: { value: null } },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: `
    uniform sampler2D tDiffuse; varying vec2 vUv;
    void main(){
      vec4 c = texture2D(tDiffuse, vUv);
      vec3 x = min(c.rgb, vec3(24.0));
      if (any(isnan(x))) x = vec3(0.0);
      gl_FragColor = vec4(max(x, vec3(0.0)), 1.0);
    }`,
};

/** Renders several camera viewports into the composer's read buffer. */
class SplitRenderPass extends Pass {
  constructor(scene, getViews) {
    super();
    this.scene = scene;
    this.getViews = getViews;
    this.needsSwap = false;
  }
  render(renderer, writeBuffer, readBuffer) {
    const target = this.renderToScreen ? null : readBuffer;
    const oldAuto = renderer.autoClear;
    renderer.autoClear = false;
    const w = target.width, h = target.height;
    target.viewport.set(0, 0, w, h);
    target.scissorTest = false;
    renderer.setRenderTarget(target);
    renderer.clear();
    for (const v of this.getViews()) {
      const x = Math.round(v.x * w), y = Math.round(v.y * h), vw = Math.round(v.w * w), vh = Math.round(v.h * h);
      target.viewport.set(x, y, vw, vh);
      target.scissor.set(x, y, vw, vh);
      target.scissorTest = true;
      renderer.setRenderTarget(target);
      renderer.clear();
      renderer.render(this.scene, v.camera);
    }
    target.viewport.set(0, 0, w, h);
    target.scissorTest = false;
    renderer.setRenderTarget(target);
    renderer.autoClear = oldAuto;
  }
}

export class RenderSystem {
  constructor(scene) {
    this.scene = scene;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    // v4.1 real-time car shadows; the map is refreshed once per frame (not once per split-screen view)
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.shadowMap.autoUpdate = false;
    this.renderer.domElement.id = 'game-canvas';
    document.getElementById('app').prepend(this.renderer.domElement);
    this.views = [];
    this.quality = 'medium';

    // MSAA render target: removes the jagged "staircase" edges that the post-processing chain otherwise has
    const rt = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 });
    this.composer = new EffectComposer(this.renderer, rt);
    this.splitPass = new SplitRenderPass(scene, () => this.views);
    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.7, 0.5, 0.78);
    this.composer.addPass(this.splitPass);
    this.composer.addPass(new ShaderPass(SanitizeShader));
    this.composer.addPass(this.bloom);
    this.cine = new CinematicPass();
    this.composer.addPass(this.cine);
    this.mainScene = scene;
    this.look = null;
    this.lightDir = null;
    this._lp = new THREE.Vector3();
    this._lights = [{ x: 0, y: 0, s: 0 }, { x: 0, y: 0, s: 0 }];
    this._hz = [-1, -1];
    this._heatLvl = [0, 0];
    this._hp = new THREE.Vector3();
    this._hd = new THREE.Vector3();
    this._ht = performance.now();
    this.speedPass = new ShaderPass(SpeedShader);
    this.composer.addPass(this.speedPass);
    this.composer.addPass(new OutputPass());
    // FXAA: cheap edge smoothing for phones, where MSAA is too expensive
    this.fxaa = new ShaderPass(FXAAShader);
    this.fxaa.enabled = false;
    this.composer.addPass(this.fxaa);
    window.addEventListener('resize', () => this.resize());
    this.resize();
  }

  setScene(scene) {
    this.scene = scene;
    this.splitPass.scene = scene;
    this.applyLook(scene === this.mainScene ? this.look : null);
  }

  /** v4.1: per-track cinematic look (theme.fx) and the world direction of the sun / moon / planet. */
  setLook(theme, lightDir) {
    this.look = theme?.fx || null;
    this.rain = theme?.wet ? 1 : 0; // v4.2: drops on the lens on the rainy track
    this.lightDir = lightDir ? lightDir.clone().normalize() : null;
    this.applyLook(this.scene === this.mainScene ? this.look : null);
  }

  applyLook(fx) {
    const u = this.speedPass.uniforms;
    const g = fx?.grade || {};
    u.uLift.value.fromArray(g.lift || [0, 0, 0]);
    u.uGain.value.fromArray(g.gain || [1, 1, 1]);
    u.uSat.value = g.sat ?? 1;
    u.uRain.value = fx ? this.rain ?? 0 : 0;
    this.cine.setLook(fx || { streak: 0.15, god: 0, flare: 0 });
    this.lightsOn = !!(fx && this.lightDir);
  }

  /** Screen position of the light source in every view (frame uv) + strength fading at the screen edges.
   * v5.5: also the horizon line of every view (road reflections) and the heat haze behind boosting cars. */
  updateLights() {
    const now = performance.now(), dt = Math.min(0.1, (now - this._ht) / 1000);
    this._ht = now;
    const heat = this.speedPass.uniforms.uHeat.value;
    for (let i = 0; i < 2; i++) {
      const v = this.views[i], o = this._lights[i];
      o.s = 0;
      this._hz[i] = -1;
      heat[i].set(0, 0, 0);
      if (!v) continue;
      const cam = v.camera;
      cam.updateMatrixWorld();
      cam.matrixWorldInverse.copy(cam.matrixWorld).invert();
      // horizon: a point far ahead at the camera's own height
      cam.getWorldDirection(this._hd);
      this._hd.y = 0;
      if (this._hd.lengthSq() > 1e-6) {
        this._hd.normalize();
        const h = this._hp.copy(this._hd).multiplyScalar(Math.min(2000, cam.far * 0.6)).add(cam.position).project(cam);
        if (h.z < 1 && h.z > -1) this._hz[i] = v.y + (Math.max(-1.2, Math.min(1.2, h.y)) * 0.5 + 0.5) * v.h;
      }
      // heat haze: the air shimmers behind the exhausts of a boosting car
      const car = cam.userData.car;
      const want = car && !car.eliminated && car.model?.root.visible ? (car.overdrive > 0 ? 1.4 : car.boosting ? 1 : 0) : 0;
      this._heatLvl[i] += (want - this._heatLvl[i]) * Math.min(1, dt * (want ? 6 : 2.5));
      if (this._heatLvl[i] > 0.02 && car) {
        const fx = Math.sin(car.heading), fz = Math.cos(car.heading), rear = (car.model.dims?.rear ?? -2.2) - 0.5;
        const p = this._hp.set(car.x + fx * rear, car.y + 0.55, car.z + fz * rear).project(cam);
        if (p.z < 1 && p.z > -1) heat[i].set(v.x + (p.x * 0.5 + 0.5) * v.w, v.y + (p.y * 0.5 + 0.5) * v.h, this._heatLvl[i]);
      }
      if (!this.lightsOn) continue;
      const p = this._lp.copy(this.lightDir).multiplyScalar(900).add(cam.position).project(cam);
      if (p.z > 1 || p.z < -1) continue; // behind the camera
      const edge = Math.max(Math.abs(p.x), Math.abs(p.y));
      o.s = 1 - THREE.MathUtils.smoothstep(edge, 0.85, 1.25);
      o.x = v.x + (p.x * 0.5 + 0.5) * v.w;
      o.y = v.y + (p.y * 0.5 + 0.5) * v.h;
    }
    this.cine.setLights(this._lights);
    this.cine.setHorizon(this._hz[0], this._hz[1]);
  }

  setQuality(q) {
    this.quality = q;
    this.scale = 1;
    // MSAA is expensive on phone GPUs: 4x on desktop "high", 2x on desktop "medium", off on touch devices and "low"
    const touch = typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches;
    const samples = touch || q === 'low' ? 0 : q === 'high' ? 4 : 2;
    for (const t of [this.composer.renderTarget1, this.composer.renderTarget2]) {
      if (t.samples !== samples) { t.samples = samples; t.dispose(); }
    }
    this.fxaa.enabled = samples === 0 && q !== 'low';
    this.resize();
  }

  /** Dynamic resolution (0.5..1) — lowered automatically when FPS drops on phones. */
  setScale(s) {
    const v = Math.max(0.75, Math.min(1, s));
    if (Math.abs(v - (this.scale ?? 1)) < 0.01) return;
    this.scale = v;
    this.resize();
  }

  /** views: [{camera, x, y, w, h}] in 0..1 screen fractions (y from bottom). */
  setViews(views) {
    this.views = views;
    views.forEach((v, i) => { if (i < 2) this.speedPass.uniforms.uRect.value[i].set(v.x, v.y, v.w, v.h); });
    if (views.length < 2) this.speedPass.uniforms.uRect.value[1].set(0, 0, 0, 0);
    this.cine.setViews(views, window.innerWidth, window.innerHeight);
    this.setSpeedFX([0, 0]);
    this.updateAspects();
  }

  updateAspects() {
    const W = window.innerWidth, H = window.innerHeight;
    for (const v of this.views) {
      v.camera.aspect = (v.w * W) / Math.max(1, v.h * H);
      v.camera.updateProjectionMatrix();
    }
  }

  resize() {
    const W = window.innerWidth, H = window.innerHeight;
    const dpr = Math.min(window.devicePixelRatio || 1,
      this.quality === 'high' ? GAME.MAX_DPR_HIGH : this.quality === 'medium' ? GAME.MAX_DPR_MED : GAME.MAX_DPR_LOW) * (this.scale ?? 1);
    this.dpr = dpr;
    this.size = { W, H };
    this.renderer.setPixelRatio(dpr);
    // v4.4.2: the canvas keeps its CSS size (100% of the screen). Phones sometimes report the old (portrait) size
    // during a rotation / fullscreen switch; with a fixed pixel size the picture then filled only part of the screen
    // and the rest stayed black. Now it is at worst stretched for a frame, and fixed by checkSize() right after.
    this.renderer.setSize(W, H, false);
    this.composer.setPixelRatio(dpr);
    this.composer.setSize(W, H);
    this.bloom.resolution.set(W * dpr * 0.5, H * dpr * 0.5);
    this.fxaa.uniforms.resolution.value.set(1 / Math.max(1, W * dpr), 1 / Math.max(1, H * dpr));
    this.cine.setViews(this.views, W, H);
    this.updateAspects();
  }

  /** v4.4.2: called every frame — re-fits the canvas when the window size changed without a (timely) resize event. */
  checkSize() {
    const W = window.innerWidth, H = window.innerHeight;
    if (W > 0 && H > 0 && (W !== this.size?.W || H !== this.size?.H)) { this.resize(); return true; }
    return false;
  }

  setSpeedFX(str) {
    this.speedPass.uniforms.uStr.value[0] = str[0] || 0;
    this.speedPass.uniforms.uStr.value[1] = str[1] || 0;
  }

  viewportHeightPx() {
    const v = this.views[0];
    return (v ? v.h : 1) * window.innerHeight * this.dpr;
  }

  render() {
    this.renderer.shadowMap.needsUpdate = true;
    if (this.scene === this.mainScene) this.preRender?.(); // v4.2: live car reflections are filmed only for drawn frames
    if (this.quality === 'low') {
      const r = this.renderer;
      const W = window.innerWidth, H = window.innerHeight;
      r.setRenderTarget(null);
      r.setScissorTest(false);
      r.clear();
      for (const v of this.views) {
        r.setViewport(v.x * W, v.y * H, v.w * W, v.h * H);
        r.setScissor(v.x * W, v.y * H, v.w * W, v.h * H);
        r.setScissorTest(true);
        r.render(this.scene, v.camera);
      }
      r.setScissorTest(false);
      r.setViewport(0, 0, W, H);
    } else {
      this.speedPass.uniforms.uTime.value = (performance.now() / 1000) % 1000;
      this.speedPass.uniforms.uAspect.value = window.innerWidth / Math.max(1, window.innerHeight);
      this.updateLights();
      this.composer.render();
    }
  }
}
