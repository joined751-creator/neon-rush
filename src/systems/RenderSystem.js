import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { Pass } from 'three/addons/postprocessing/Pass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { FXAAShader } from 'three/addons/shaders/FXAAShader.js';
import { GAME } from '../core/Constants.js';

/** Speed FX: radial blur + chromatic aberration per viewport (strength 0..1). */
const SpeedShader = {
  uniforms: {
    tDiffuse: { value: null },
    uRect: { value: [new THREE.Vector4(0, 0, 1, 1), new THREE.Vector4(0, 0, 0, 0)] },
    uStr: { value: [0, 0] },
  },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform vec4 uRect[2]; uniform float uStr[2]; varying vec2 vUv;
    void main(){
      vec2 uv = vUv; float s = 0.0; vec2 c = vec2(0.5); vec4 r = vec4(0.0, 0.0, 1.0, 1.0);
      for (int i = 0; i < 2; i++) {
        vec4 q = uRect[i];
        if (uv.x >= q.x && uv.x <= q.x + q.z && uv.y >= q.y && uv.y <= q.y + q.w) { s = uStr[i]; r = q; c = q.xy + q.zw * vec2(0.5, 0.52); }
      }
      vec2 d = uv - c;
      float l = length(d / r.zw);
      // cinematic grade: soft vignette + gentle contrast, always on
      float vig = 1.0 - 0.38 * smoothstep(0.35, 1.05, l);
      if (s < 0.002) { vec3 b = texture2D(tDiffuse, uv).rgb; b = mix(b, b * b * (3.0 - 2.0 * min(b, 1.0)), 0.12); gl_FragColor = vec4(b * vig, 1.0); return; }
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
      gl_FragColor = vec4(col * vig, 1.0);
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
    this.composer.addPass(this.bloom);
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
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(W, H);
    this.composer.setPixelRatio(dpr);
    this.composer.setSize(W, H);
    this.bloom.resolution.set(W * dpr * 0.5, H * dpr * 0.5);
    this.fxaa.uniforms.resolution.value.set(1 / Math.max(1, W * dpr), 1 / Math.max(1, H * dpr));
    this.updateAspects();
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
      this.composer.render();
    }
  }
}
