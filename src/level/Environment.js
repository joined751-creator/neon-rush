import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { windowsTexture, bannerTexture } from './Textures.js';
import { eventBus, Events } from '../core/EventBus.js';

const SKY_VERT = /* glsl */`
  varying vec3 vDir;
  void main() {
    vDir = normalize(position);
    vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    gl_Position = p.xyww;
  }
`;
const SKY_FRAG = /* glsl */`
  uniform vec3 uTop, uMid, uHorizon, uSun1, uSun2, uSunDir;
  uniform float uTime, uSun, uStars, uAurora, uFlash;
  varying vec3 vDir;
  float hash(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
  void main() {
    vec3 d = normalize(vDir);
    float h = d.y;
    vec3 col = mix(uHorizon, uMid, smoothstep(-0.02, 0.22, h));
    col = mix(col, uTop, smoothstep(0.22, 0.75, h));
    // horizon glow band
    col += uHorizon * 0.35 * exp(-abs(h) * 28.0);
    if (uStars > 0.5 && h > 0.05) {
      vec3 g = floor(d * 260.0);
      float s = hash(g);
      float tw = 0.6 + 0.4 * sin(uTime * 2.0 + s * 40.0);
      col += vec3(step(0.9965, s) * tw) * smoothstep(0.05, 0.35, h);
    }
    if (uSun > 0.5) {
      vec3 sd = normalize(uSunDir);
      float ang = acos(clamp(dot(d, sd), -1.0, 1.0));
      float r = 0.2;
      float rel = (d.y - sd.y) / r; // -1..1 inside disk
      vec3 sunCol = mix(uSun2, uSun1, smoothstep(-0.9, 0.8, rel));
      float stripe = 1.0;
      if (rel < 0.15) {
        float k = (0.15 - rel);
        stripe = step(0.18 + k * 0.55, fract(rel * 7.0 + uTime * 0.15));
      }
      float disk = smoothstep(r, r - 0.004, ang) * stripe;
      col = mix(col, sunCol * 1.6, disk);
      col += uSun2 * 0.55 * exp(-ang * 5.5);
    }
    if (uAurora > 0.5 && h > 0.05) {
      float a = 0.0;
      float x = atan(d.x, d.z);
      for (int i = 0; i < 3; i++) {
        float fi = float(i);
        float band = sin(x * (3.0 + fi) + uTime * (0.15 + fi * 0.07) + fi * 2.0) * 0.06 + 0.28 + fi * 0.08;
        a += exp(-pow((h - band) * (18.0 - fi * 4.0), 2.0)) * (0.55 + 0.45 * sin(x * 12.0 + uTime + fi));
      }
      col += mix(vec3(0.1, 1.0, 0.6), vec3(0.6, 0.3, 1.0), smoothstep(0.25, 0.5, h)) * a * 0.55;
    }
    if (uFlash > 0.0) {
      float bolt = smoothstep(0.02, 0.0, abs(d.x - 0.3 - sin(d.y * 40.0) * 0.02)) * step(0.05, d.y) * step(d.z, 0.0);
      col += vec3(0.7, 0.75, 1.0) * uFlash * (0.6 + smoothstep(0.0, 0.6, h)) + vec3(1.0) * bolt * uFlash * 2.0;
    }
    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

const GROUND_VERT = /* glsl */`
  varying vec3 vWorld;
  void main() {
    vec4 w = modelMatrix * vec4(position, 1.0);
    vWorld = w.xyz;
    gl_Position = projectionMatrix * viewMatrix * w;
  }
`;
const GROUND_FRAG = /* glsl */`
  uniform vec3 uBase, uGrid, uFog;
  uniform float uFogNear, uFogFar, uTime, uLava;
  varying vec3 vWorld;
  float gridLine(vec2 p, float cell, float w) {
    vec2 g = abs(fract(p / cell - 0.5) - 0.5) / fwidth(p / cell);
    return 1.0 - min(min(g.x, g.y) / w, 1.0);
  }
  float n2(vec2 p) { return fract(sin(dot(p, vec2(41.3, 289.1))) * 9137.7); }
  void main() {
    vec2 p = vWorld.xz;
    float minor = gridLine(p, 10.0, 1.0);
    float major = gridLine(p, 50.0, 1.6);
    vec3 col = uBase;
    float pulse = 0.75 + 0.25 * sin(uTime * 1.5 + length(p) * 0.02);
    col += uGrid * (minor * 0.28 + major * 0.9) * pulse;
    if (uLava > 0.5) {
      vec2 c = floor(p / 24.0);
      float r = n2(c);
      vec2 f = fract(p / 24.0) - 0.5;
      float crack = smoothstep(0.03, 0.0, abs(length(f) - 0.32 - r * 0.1));
      col += vec3(1.0, 0.35, 0.05) * crack * (0.6 + 0.4 * sin(uTime * 2.0 + r * 10.0));
    }
    float dist = length(vWorld - cameraPosition);
    float fog = smoothstep(uFogNear, uFogFar, dist);
    gl_FragColor = vec4(mix(col, uFog, fog), 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

const WEATHER_VERT = /* glsl */`
  uniform float uTime, uSpeed, uSize, uBox, uSway;
  attribute float aSeed;
  varying float vSeed;
  void main() {
    vec3 p = position;
    p.y = mod(p.y - uTime * uSpeed * (0.7 + aSeed * 0.6), uBox) - uBox * 0.3;
    p.x += sin(uTime * 0.8 + aSeed * 30.0) * uSway;
    p.z += cos(uTime * 0.6 + aSeed * 20.0) * uSway;
    // keep volume centred on camera (mesh follows camera, snap via modulo)
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_PointSize = min(uSize * 300.0 / max(1.0, -mv.z), 28.0);
    if (-mv.z < 2.5) gl_PointSize = 0.0;
    gl_Position = projectionMatrix * mv;
    vSeed = aSeed;
  }
`;
const WEATHER_FRAG = /* glsl */`
  uniform vec3 uColor;
  uniform float uMode; // 0 rain, 1 snow, 2 embers
  varying float vSeed;
  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float a;
    if (uMode < 0.5) {
      if (abs(c.x) > 0.05) discard;
      a = (0.5 - abs(c.y)) * 0.9;
    } else {
      float d = length(c) * 2.0;
      if (d > 1.0) discard;
      a = pow(1.0 - d, 1.5);
    }
    gl_FragColor = vec4(uColor, a);
  }
`;

/** Sky, ground grid, lights, props and weather for a theme. */
export class Environment {
  constructor(scene, renderer, theme, track) {
    this.scene = scene;
    this.theme = theme;
    this.group = new THREE.Group();
    this.time = 0;
    this.animated = [];

    scene.fog = new THREE.Fog(theme.fog, theme.fogNear, theme.fogFar);
    scene.background = new THREE.Color(theme.fog);

    // Environment map (neon light panels) for reflective paint
    this.envMap = buildEnvMap(renderer, theme);
    scene.environment = this.envMap;

    // Sky
    const b = track.bounds();
    this.center = new THREE.Vector3(b.cx, 0, b.cz);
    const sunDir = new THREE.Vector3(0, 0.07, 1).normalize();
    this.skyMat = new THREE.ShaderMaterial({
      vertexShader: SKY_VERT, fragmentShader: SKY_FRAG, depthWrite: false, side: THREE.BackSide,
      uniforms: {
        uTop: { value: new THREE.Color(theme.skyTop) }, uMid: { value: new THREE.Color(theme.skyMid) },
        uHorizon: { value: new THREE.Color(theme.skyHorizon) },
        uSun1: { value: new THREE.Color(theme.sunColor1 ?? 0xffffff) }, uSun2: { value: new THREE.Color(theme.sunColor2 ?? 0xffffff) },
        uSunDir: { value: sunDir }, uTime: { value: 0 }, uSun: { value: theme.sun ? 1 : 0 },
        uStars: { value: theme.stars ? 1 : 0 }, uAurora: { value: theme.aurora ? 1 : 0 }, uFlash: { value: 0 },
      },
    });
    const sky = new THREE.Mesh(new THREE.SphereGeometry(1000, 48, 24), this.skyMat);
    sky.frustumCulled = false;
    sky.renderOrder = -10;
    sky.onBeforeRender = (r, s, cam) => { sky.position.copy(cam.position); sky.updateMatrixWorld(); };
    this.group.add(sky);

    // Ground grid
    this.groundMat = new THREE.ShaderMaterial({
      vertexShader: GROUND_VERT, fragmentShader: GROUND_FRAG,
      uniforms: {
        uBase: { value: new THREE.Color(theme.ground) }, uGrid: { value: new THREE.Color(theme.grid) },
        uFog: { value: new THREE.Color(theme.fog) }, uFogNear: { value: theme.fogNear * 1.2 }, uFogFar: { value: theme.fogFar },
        uTime: { value: 0 }, uLava: { value: theme.props === 'rocks' ? 1 : 0 },
      },
    });
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(5000, 5000), this.groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(b.cx, -0.6, b.cz);
    this.group.add(ground);

    // Lights
    this.hemi = new THREE.HemisphereLight(theme.hemiSky, theme.hemiGround, 1.3);
    this.group.add(this.hemi);
    this.lightning = theme.particles === 'rain';
    this.nextBolt = 5 + Math.random() * 6;
    this.flash = 0;
    const dir = new THREE.DirectionalLight(theme.dirColor, 1.6);
    dir.position.set(-120, 200, -260);
    this.group.add(dir);

    this.buildProps(track, theme, b);
    if (theme.particles) this.buildWeather(theme.particles);

    scene.add(this.group);
  }

  placeAround(track, b, count, minDist, maxDist, fn) {
    let placed = 0, guard = 0;
    while (placed < count && guard < count * 30) {
      guard++;
      const a = Math.random() * Math.PI * 2;
      const r = Math.random() * (b.r + maxDist);
      const x = b.cx + Math.cos(a) * r, z = b.cz + Math.sin(a) * r;
      const d = track.distanceTo(x, z);
      if (d < minDist || d > maxDist) continue;
      fn(x, z, placed, d);
      placed++;
    }
    return placed;
  }

  buildProps(track, theme, b) {
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), e = new THREE.Euler();
    const yAt = (x, z) => { const qq = track.closest(x, z, -1, {}); return Math.min(qq.y, 0) - 0.6; };

    // Distant wireframe mountains (all themes except city)
    if (theme.props !== 'city') {
      const geo = new THREE.ConeGeometry(1, 1, 5, 1);
      geo.translate(0, 0.5, 0);
      const fill = new THREE.MeshBasicMaterial({ color: new THREE.Color(theme.fog).multiplyScalar(0.6), fog: false });
      const edges = new THREE.EdgesGeometry(geo);
      const lineMat = new THREE.LineBasicMaterial({ color: new THREE.Color(theme.grid).multiplyScalar(1.6), fog: false, transparent: true, opacity: 0.85 });
      for (let i = 0; i < 46; i++) {
        const a = (i / 46) * Math.PI * 2 + Math.random() * 0.1;
        const r = b.r + 420 + Math.random() * 220;
        const h = 60 + Math.random() * (theme.props === 'rocks' ? 220 : 150);
        const w = 80 + Math.random() * 120;
        const mesh = new THREE.Mesh(geo, fill);
        mesh.scale.set(w, h, w);
        mesh.rotation.y = Math.random() * 6;
        mesh.position.set(b.cx + Math.cos(a) * r, -1, b.cz + Math.sin(a) * r);
        const l = new THREE.LineSegments(edges, lineMat);
        mesh.add(l);
        this.group.add(mesh);
      }
    }

    if (theme.props === 'palms') {
      const palm = buildPalmGeometry();
      const mat = new THREE.MeshStandardMaterial({ color: 0x12061c, emissive: new THREE.Color(theme.wall), emissiveIntensity: 0.25, roughness: 0.8, flatShading: true });
      const inst = new THREE.InstancedMesh(palm, mat, 140);
      const n = this.placeAround(track, b, 140, 18, 160, (x, z, i) => {
        const sc = 0.8 + Math.random() * 0.7;
        e.set(0, Math.random() * Math.PI * 2, 0); q.setFromEuler(e);
        m.compose(p.set(x, yAt(x, z), z), q, s.set(sc, sc, sc));
        inst.setMatrixAt(i, m);
      });
      inst.count = n;
      this.group.add(inst);
      this.addBillboards(track, theme, ['ТУРБО', 'ЗАКАТ 84', 'NEON RUSH']);
    }

    if (theme.props === 'city') {
      const geo = new THREE.BoxGeometry(1, 1, 1);
      geo.translate(0, 0.5, 0);
      const win = windowsTexture();
      const mat = new THREE.MeshStandardMaterial({ color: 0x0a0814, emissive: 0xffffff, emissiveMap: win, emissiveIntensity: 1.1, roughness: 0.6, metalness: 0.5 });
      const inst = new THREE.InstancedMesh(geo, mat, 420);
      // UV repeat via per-building scale isn't possible on one texture; scale map with world size approximations
      win.repeat.set(2, 4);
      const roofGeo = new THREE.BoxGeometry(1, 0.08, 1);
      const roof = new THREE.InstancedMesh(roofGeo, new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff2bd6).multiplyScalar(2) }), 420);
      const n = this.placeAround(track, b, 420, 22, 340, (x, z, i, d) => {
        const w = 14 + Math.random() * 26, dd = 14 + Math.random() * 26;
        const h = 18 + Math.random() * (d < 60 ? 50 : 150);
        e.set(0, Math.random() < 0.5 ? 0 : Math.PI / 2, 0); q.setFromEuler(e);
        m.compose(p.set(x, -0.6, z), q, s.set(w, h, dd));
        inst.setMatrixAt(i, m);
        m.compose(p.set(x, h - 0.6, z), q, s.set(w * 1.01, 1, dd * 1.01));
        roof.setMatrixAt(i, m);
        roof.setColorAt(i, new THREE.Color(Math.random() < 0.5 ? 0xff2bd6 : 0x00e5ff).multiplyScalar(2));
      });
      inst.count = roof.count = n;
      this.group.add(inst, roof);
      this.addBillboards(track, theme, ['24/7', 'НЕОН', 'КИБЕР ЛАПША', 'ДРИФТ-КЛУБ']);
    }

    if (theme.props === 'ice') {
      const geo = new THREE.OctahedronGeometry(1, 0);
      const mat = new THREE.MeshStandardMaterial({
        color: 0x9fe8ff, emissive: 0x2a8cff, emissiveIntensity: 0.6, roughness: 0.1, metalness: 0.2,
        transparent: true, opacity: 0.85, flatShading: true,
      });
      const inst = new THREE.InstancedMesh(geo, mat, 160);
      const n = this.placeAround(track, b, 160, 16, 220, (x, z, i) => {
        const h = 4 + Math.random() * 18;
        e.set((Math.random() - 0.5) * 0.4, Math.random() * 6, (Math.random() - 0.5) * 0.4); q.setFromEuler(e);
        m.compose(p.set(x, yAt(x, z) + h * 0.4, z), q, s.set(h * 0.25, h, h * 0.25));
        inst.setMatrixAt(i, m);
      });
      inst.count = n;
      this.group.add(inst);
      const berg = new THREE.IcosahedronGeometry(1, 1);
      const bergMat = new THREE.MeshStandardMaterial({ color: 0xdff6ff, roughness: 0.5, flatShading: true, emissive: 0x0a3050, emissiveIntensity: 0.6 });
      const bergs = new THREE.InstancedMesh(berg, bergMat, 40);
      const n2 = this.placeAround(track, b, 40, 40, 300, (x, z, i) => {
        const r = 10 + Math.random() * 25;
        e.set(0, Math.random() * 6, 0); q.setFromEuler(e);
        m.compose(p.set(x, -4, z), q, s.set(r, r * 0.6, r));
        bergs.setMatrixAt(i, m);
      });
      bergs.count = n2;
      this.group.add(bergs);
    }

    if (theme.props === 'rocks') {
      const geo = new THREE.DodecahedronGeometry(1, 0);
      const mat = new THREE.MeshStandardMaterial({ color: 0x1a0c08, roughness: 0.9, flatShading: true, emissive: 0x3a0800, emissiveIntensity: 0.6 });
      const inst = new THREE.InstancedMesh(geo, mat, 160);
      const n = this.placeAround(track, b, 160, 15, 220, (x, z, i) => {
        const r = 2 + Math.random() * 9;
        e.set(Math.random() * 3, Math.random() * 6, Math.random() * 3); q.setFromEuler(e);
        m.compose(p.set(x, yAt(x, z) + r * 0.3, z), q, s.set(r, r * (0.6 + Math.random()), r));
        inst.setMatrixAt(i, m);
      });
      inst.count = n;
      this.group.add(inst);
      // Volcano with glowing crater on the horizon
      const vgeo = new THREE.CylinderGeometry(60, 260, 230, 9, 1, true);
      const volcano = new THREE.Mesh(vgeo, new THREE.MeshBasicMaterial({ color: 0x120403, fog: false }));
      volcano.position.set(b.cx + b.r + 380, 110, b.cz - 200);
      const crater = new THREE.Mesh(new THREE.CircleGeometry(60, 9), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff5a00).multiplyScalar(3), fog: false }));
      crater.rotation.x = -Math.PI / 2;
      crater.position.y = 115;
      volcano.add(crater);
      this.group.add(volcano);
      this.volcanoTop = volcano.position.clone().add(new THREE.Vector3(0, 230, 0));
      this.addBillboards(track, theme, ['ЖАРА', 'МАГМА 1000°']);
    }
  }

  addBillboards(track, theme, words) {
    const count = words.length;
    for (let k = 0; k < count; k++) {
      const sIdx = ((k + 0.5) / count) * track.length;
      const pt = track.pointAt(sIdx, (k % 2 ? 1 : -1) * (track.half + 14));
      const tex = bannerTexture(words[k], k % 2 ? theme.wall : theme.wall2);
      const board = new THREE.Mesh(new THREE.PlaneGeometry(24, 3.75), new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide }));
      board.position.set(pt.x, pt.y + 9, pt.z);
      board.rotation.y = pt.heading + (k % 2 ? -0.5 : 0.5) + Math.PI;
      const poleMat = new THREE.MeshStandardMaterial({ color: 0x15101e, metalness: 0.7, roughness: 0.4 });
      for (const off of [-8, 8]) {
        const pole = new THREE.Mesh(new THREE.BoxGeometry(0.5, 9, 0.5), poleMat);
        pole.position.set(off, -4.5, -0.3);
        board.add(pole);
      }
      this.group.add(board);
    }
  }

  buildWeather(kind) {
    const count = kind === 'rain' ? 5000 : kind === 'snow' ? 2600 : 900;
    const box = kind === 'rain' ? 70 : 60;
    const pos = new Float32Array(count * 3);
    const seed = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 140;
      pos[i * 3 + 1] = Math.random() * box;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 140;
      seed[i] = Math.random();
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
    const cfg = {
      rain: { speed: kind === 'rain' ? 55 : 0, size: 0.9, color: 0x9fd8ff, mode: 0, sway: 0 },
      snow: { speed: 6, size: 0.35, color: 0xffffff, mode: 1, sway: 1.5 },
      embers: { speed: -7, size: 0.4, color: 0xff7a1a, mode: 2, sway: 2.5 },
    }[kind];
    this.weatherMat = new THREE.ShaderMaterial({
      vertexShader: WEATHER_VERT, fragmentShader: WEATHER_FRAG, transparent: true, depthWrite: false,
      blending: kind === 'embers' ? THREE.AdditiveBlending : THREE.NormalBlending,
      uniforms: {
        uTime: { value: 0 }, uSpeed: { value: cfg.speed }, uSize: { value: cfg.size }, uBox: { value: box },
        uSway: { value: cfg.sway }, uColor: { value: new THREE.Color(cfg.color) }, uMode: { value: cfg.mode },
      },
    });
    const pts = new THREE.Points(g, this.weatherMat);
    pts.frustumCulled = false;
    pts.renderOrder = 6;
    pts.onBeforeRender = (r, s, cam) => { pts.position.set(cam.position.x, cam.position.y - 15, cam.position.z); pts.updateMatrixWorld(); };
    this.group.add(pts);
  }

  update(dt) {
    this.time += dt;
    if (this.lightning) {
      this.nextBolt -= dt;
      if (this.nextBolt <= 0) {
        this.nextBolt = 7 + Math.random() * 10;
        this.flash = 1;
        eventBus.emit(Events.THUNDER, {});
      }
      this.flash = Math.max(0, this.flash - dt * 2.6);
      const f = this.flash > 0.5 ? this.flash : this.flash * (0.5 + 0.5 * Math.sin(this.time * 60));
      this.skyMat.uniforms.uFlash.value = f;
      this.hemi.intensity = 1.3 + f * 3;
    }
    this.skyMat.uniforms.uTime.value = this.time;
    this.groundMat.uniforms.uTime.value = this.time;
    if (this.weatherMat) this.weatherMat.uniforms.uTime.value = this.time;
  }

  dispose() {
    this.scene.remove(this.group);
    disposeTree(this.group);
    this.envMap?.dispose();
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
  panel(0xffffff, 2.2, 14, 3, 0, 10, 0);
  panel(theme.wall, 3, 20, 2, -10, 2, 0);
  panel(theme.wall2, 3, 20, 2, 10, 2, 0);
  panel(theme.skyHorizon, 2, 30, 4, 0, 1, -12);
  panel(theme.roadLine, 1.5, 30, 4, 0, 1, 12);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), new THREE.MeshBasicMaterial({ color: 0x050308 }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -3;
  s.add(floor);
  const rt = pm.fromScene(s, 0.035);
  pm.dispose();
  s.traverse((o) => { o.geometry?.dispose(); o.material?.dispose(); });
  return rt.texture;
}

function buildPalmGeometry() {
  const parts = [];
  const trunk = new THREE.CylinderGeometry(0.25, 0.45, 12, 6, 6);
  const pa = trunk.attributes.position;
  for (let i = 0; i < pa.count; i++) {
    const y = pa.getY(i) + 6;
    pa.setX(i, pa.getX(i) + (y / 12) ** 2 * 2.2);
  }
  trunk.translate(0, 6, 0);
  trunk.computeVertexNormals();
  parts.push(trunk);
  for (let k = 0; k < 8; k++) {
    const leaf = new THREE.ConeGeometry(0.9, 6.5, 3, 1);
    leaf.scale(1, 1, 0.18);
    leaf.translate(0, 3.2, 0);
    leaf.rotateZ(-1.15 - Math.random() * 0.3);
    leaf.rotateY((k / 8) * Math.PI * 2);
    leaf.translate(2.2, 12, 0);
    parts.push(leaf.toNonIndexed());
  }
  return mergeGeometries(parts.map((g) => (g.index ? g.toNonIndexed() : g)), false);
}

export function disposeTree(root) {
  root.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    if (o.material) {
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of mats) {
        for (const k of ['map', 'emissiveMap', 'alphaMap', 'normalMap', 'roughnessMap']) m[k]?.dispose?.();
        m.dispose();
      }
    }
  });
}
