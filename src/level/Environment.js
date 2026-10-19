import * as THREE from 'three';
import { signAtlasTexture } from './Textures.js';
import { eventBus, Events } from '../core/EventBus.js';
import { qualityProfile, rng, hashStr, Batcher, GlowPoints } from './WorldKit.js';
import { buildSky } from './Sky.js';
import { buildGround, buildMountains, buildSkyline } from './Terrain.js';
import { Dressing } from './Dressing.js';
import { buildScenery } from './Scenery.js';
import { buildWeather } from './Weather.js';

/**
 * The world around the track for a theme: sky, ground, horizon (mountains / skyline), trackside dressing,
 * theme props, weather and lights. Quality-aware (gameState.settings.quality) and fully disposable.
 * Static dressing is merged into 3 batched meshes (metal / neon / sign atlas) to keep draw calls low.
 */
export class Environment {
  constructor(scene, renderer, theme, track) {
    this.scene = scene;
    this.theme = theme;
    this.group = new THREE.Group();
    this.time = 0;
    this.timeUniforms = [];
    const qp = qualityProfile();
    this.quality = qp.q;
    const T = (typeof performance !== 'undefined') ? () => performance.now() : () => 0;
    let tPrev = T();
    this.buildTimes = {};
    const lap = (k) => { const t = T(); this.buildTimes[k] = Math.round(t - tPrev); tPrev = t; };

    scene.fog = new THREE.Fog(theme.fog, theme.fogNear, theme.fogFar);
    scene.background = new THREE.Color(theme.fog);

    // Environment map (neon light panels) for reflective paint, wet asphalt and metal
    this.envTarget = buildEnvMap(renderer, theme);
    this.envMap = this.envTarget.texture;
    scene.environment = this.envMap;

    const b = track.bounds();
    // true outer radius of the circuit around the bounds centre (corners of the bbox can exceed b.r)
    let rMax = 0;
    for (let i = 0; i < track.n; i++) rMax = Math.max(rMax, Math.hypot(track.px[i] - b.cx, track.pz[i] - b.cz));
    b.rMax = rMax;
    this.center = new THREE.Vector3(b.cx, 0, b.cz);
    // Sun / moon sit straight down the start straight
    const h0 = track.pointAt(0).heading;
    const elev = theme.smoke ? 0.16 : 0.1;
    const sunDir = new THREE.Vector3(Math.sin(h0) * Math.cos(elev), Math.sin(elev), Math.cos(h0) * Math.cos(elev));

    lap('envmap');
    this.sky = buildSky(theme, qp, sunDir);
    this.skyMat = this.sky.material;
    this.timeUniforms.push(this.skyMat.uniforms.uTime);
    this.group.add(this.sky);
    this.group.add(buildGround(theme, b, this.timeUniforms, qp));

    let volcanoTop = null;
    if (theme.props === 'city') this.group.add(buildSkyline(theme, b, qp, this.timeUniforms));
    else {
      const mt = buildMountains(theme, b, qp, sunDir, this.timeUniforms);
      this.group.add(mt.mesh);
      volcanoTop = mt.volcanoTop;
      if (theme.props === 'palms') {
        // synthwave city silhouette on the horizon, away from the sun
        const sunAz = Math.atan2(sunDir.z, sunDir.x) / (Math.PI * 2);
        this.group.add(buildSkyline(theme, b, qp, this.timeUniforms, {
          radii: [400], heights: [120], bins: [300], sector: [((sunAz + 0.5) % 1 + 1) % 1, 0.17], sil: 0x0c0420, win: [0xff5ad8, 0x40e8ff],
        }));
      }
    }
    this.volcanoTop = volcanoTop;
    lap('terrain');

    // Lights
    this.hemi = new THREE.HemisphereLight(theme.hemiSky, theme.hemiGround, 1.3);
    this.group.add(this.hemi);
    this.lightning = theme.particles === 'rain';
    this.nextBolt = 5 + Math.random() * 6;
    this.flash = 0;
    const dir = new THREE.DirectionalLight(theme.dirColor, 1.6);
    dir.position.set(-120, 200, -260);
    this.group.add(dir);

    // Trackside dressing + theme props
    this.atlas = signAtlasTexture(theme.signs, theme.strips, qp.atlas);
    lap('atlas');
    const batch = new Batcher();
    const glow = new GlowPoints();
    const ctx = {
      track, theme, qp, b, batch, glow, group: this.group, timeUniforms: this.timeUniforms, exclude: [],
      rnd: rng(hashStr(track.def.id + (track.def.theme || ''))), atlas: this.atlas, volcanoTop,
    };
    this.dressing = new Dressing(ctx);
    for (const o of this.dressing.objects) this.group.add(o);
    lap('dressing');
    buildScenery(ctx);
    lap('scenery');

    const metal = batch.mesh('metal', new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0.8, roughness: 0.38, envMapIntensity: 1.1 }));
    const neon = batch.mesh('neon', new THREE.MeshBasicMaterial({ vertexColors: true }));
    const signs = batch.mesh('atlas', new THREE.MeshBasicMaterial({ map: this.atlas, vertexColors: true }));
    for (const m of [metal, neon, signs]) if (m) this.group.add(m);
    const glowPts = glow.build();
    if (glowPts) { this.group.add(glowPts); this.timeUniforms.push(glow.material.uniforms.uTime); }

    if (theme.particles) this.group.add(buildWeather(theme.particles, qp, this.timeUniforms));
    lap('merge+weather');

    scene.add(this.group);
  }

  update(dt) {
    this.time += dt;
    if (this.lightning) {
      this.nextBolt -= dt;
      if (this.nextBolt <= 0) {
        this.nextBolt = 7 + Math.random() * 10;
        this.flash = 1;
        this.skyMat.uniforms.uBoltAz.value = Math.random() * Math.PI * 2 - Math.PI;
        eventBus.emit(Events.THUNDER, {});
      }
      this.flash = Math.max(0, this.flash - dt * 2.6);
      const f = this.flash > 0.5 ? this.flash : this.flash * (0.5 + 0.5 * Math.sin(this.time * 60));
      this.skyMat.uniforms.uFlash.value = f;
      this.hemi.intensity = 1.3 + f * 3;
    }
    for (let i = 0; i < this.timeUniforms.length; i++) this.timeUniforms[i].value = this.time;
  }

  dispose() {
    this.dressing?.dispose();
    this.scene.remove(this.group);
    disposeTree(this.group);
    this.atlas?.dispose();
    // dispose the PMREM render target itself (disposing only its texture leaked one GL texture per race)
    this.envTarget?.dispose();
    this.scene.environment = null;
    this.scene.fog = null;
  }
}

function buildEnvMap(renderer, theme) {
  const pm = new THREE.PMREMGenerator(renderer);
  const s = new THREE.Scene();
  s.background = new THREE.Color(theme.skyMid).multiplyScalar(0.25);
  const panel = (color, intensity, w, h, x, y, z) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(intensity), side: THREE.DoubleSide }));
    m.position.set(x, y, z);
    m.lookAt(0, 0, 0);
    s.add(m);
  };
  // overhead softbox: dimmer and larger (a hot 14×3 strip mirrored on car roofs as a glaring white square)
  panel(0xffffff, 1.15, 18, 6, 0, 10, 0.5);
  panel(theme.wall, 3, 20, 2, -10, 2, 0);
  panel(theme.wall2, 3, 20, 2, 10, 2, 0);
  panel(theme.skyHorizon, 2, 30, 4, 0, 1, -12);
  panel(theme.roadLine, 1.5, 30, 4, 0, 1, 12);
  // theme-specific light sources so glossy surfaces (wet road, chrome, glass) pick up colour
  const r = rng(hashStr(String(theme.props)));
  if (theme.props === 'city') {
    // ring of "facades": many small window lights + a few neon signs → soft, varied reflections on the wet road
    const cols = [0xffc890, 0xffe0b0, 0x9fd0ff, 0xffc890, 0xff2bd6, 0x00e5ff];
    for (let i = 0; i < 90; i++) {
      const a = r() * Math.PI * 2, d = 16 + r() * 4;
      panel(cols[i % cols.length], i % 6 > 3 ? 2.2 : 0.9 + r() * 0.8, 0.6 + r() * 1.2, 0.4 + r() * 0.8, Math.cos(a) * d, 0.5 + r() * 9, Math.sin(a) * d);
    }
  } else if (theme.sun) {
    panel(theme.sunColor1, 4, 10, 6, 0, 3, 14);
    panel(theme.sunColor2, 2.5, 26, 3, 0, 0.5, 14);
  } else if (theme.aurora) {
    panel(0x30ffa0, 1.6, 40, 6, 0, 12, -6);
    panel(0x9a60ff, 1.2, 40, 4, 0, 15, 6);
  }
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), new THREE.MeshBasicMaterial({ color: 0x050308 }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -3;
  s.add(floor);
  const rt = pm.fromScene(s, 0.035);
  pm.dispose();
  s.traverse((o) => { o.geometry?.dispose(); o.material?.dispose(); });
  return rt;
}

const TEX_KEYS = ['map', 'emissiveMap', 'alphaMap', 'normalMap', 'roughnessMap', 'metalnessMap', 'bumpMap', 'aoMap', 'lightMap'];
export function disposeTree(root) {
  root.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    if (o.isInstancedMesh) o.dispose();
    if (o.material) {
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of mats) {
        for (const k of TEX_KEYS) m[k]?.dispose?.();
        if (m.uniforms) for (const u of Object.values(m.uniforms)) if (u?.value?.isTexture) u.value.dispose();
        if (m.userData?.disposeExtra) for (const t of m.userData.disposeExtra) t.dispose?.();
        m.dispose();
      }
    }
  });
}
