import * as THREE from 'three';

/**
 * Weather particles in world space, wrapped in a box around the camera (so they stream past at speed),
 * faded near the camera and with clamped point sizes — no blobs on screen.
 */

const RAIN_VERT = /* glsl */`
  uniform float uTime, uSpeed, uBox, uBoxY, uLen;
  uniform vec3 uCam;
  attribute float aEnd, aSeed;
  varying float vA;
  void main() {
    vec3 p = position;
    float sp = uSpeed * (0.85 + aSeed * 0.3);
    p.y = mod(p.y - uTime * sp, uBoxY);
    vec3 w = vec3(uCam.x + mod(p.x - uCam.x, uBox) - uBox * 0.5, uCam.y - uBoxY * 0.35 + p.y, uCam.z + mod(p.z - uCam.z, uBox) - uBox * 0.5);
    vec3 vel = normalize(vec3(2.0, -sp, 1.2));
    w -= vel * uLen * aEnd * (0.7 + aSeed * 0.6);
    float d = length(w - uCam);
    vA = smoothstep(2.0, 6.0, d) * (1.0 - smoothstep(uBox * 0.3, uBox * 0.5, d)) * (1.0 - aEnd * 0.85);
    gl_Position = projectionMatrix * viewMatrix * vec4(w, 1.0);
  }
`;
const RAIN_FRAG = /* glsl */`
  uniform vec3 uColor;
  varying float vA;
  void main() {
    gl_FragColor = vec4(uColor * vA, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

const PT_VERT = /* glsl */`
  uniform float uTime, uSpeed, uBox, uBoxY, uSize, uSway, uViewH, uMaxPx;
  uniform vec3 uCam;
  attribute float aSeed;
  varying float vA, vSeed;
  void main() {
    vec3 p = position;
    float sp = uSpeed * (0.7 + aSeed * 0.6);
    p.y = mod(p.y - uTime * sp, uBoxY);
    p.x += sin(uTime * (0.6 + aSeed) + aSeed * 30.0) * uSway;
    p.z += cos(uTime * (0.5 + aSeed * 0.8) + aSeed * 20.0) * uSway;
    vec3 w = vec3(uCam.x + mod(p.x - uCam.x, uBox) - uBox * 0.5, uCam.y - uBoxY * 0.35 + p.y, uCam.z + mod(p.z - uCam.z, uBox) - uBox * 0.5);
    vec4 mv = viewMatrix * vec4(w, 1.0);
    float d = -mv.z;
    float px = uSize * (0.6 + aSeed * 0.8) * projectionMatrix[1][1] * uViewH * 0.5 / max(d, 0.1);
    gl_PointSize = clamp(px, 1.0, uMaxPx);
    vA = smoothstep(3.0, 9.0, d) * (1.0 - smoothstep(uBox * 0.3, uBox * 0.5, length(w - uCam)));
    if (vA < 0.01) gl_PointSize = 0.0;
    vSeed = aSeed;
    gl_Position = projectionMatrix * mv;
  }
`;
const PT_FRAG = /* glsl */`
  uniform vec3 uColor, uColor2;
  uniform float uTime, uMode;
  varying float vA, vSeed;
  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float r = length(c) * 2.0;
    if (r > 1.0) discard;
    float a = pow(1.0 - r, 1.6) * vA;
    vec3 col = uColor;
    if (uMode > 0.5) {
      float fl = 0.6 + 0.4 * sin(uTime * (8.0 + vSeed * 9.0) + vSeed * 50.0);
      col = mix(uColor, uColor2, vSeed) * fl * 2.0;
      gl_FragColor = vec4(col * a, 1.0);
    } else {
      gl_FragColor = vec4(col, a * 0.85);
    }
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

const _vp = new THREE.Vector4();

export function buildWeather(kind, qp, timeUniforms) {
  const k = qp.weather;
  if (kind === 'rain') {
    const count = Math.round(7000 * k);
    const box = 70, boxY = 40;
    const pos = new Float32Array(count * 2 * 3), end = new Float32Array(count * 2), seed = new Float32Array(count * 2);
    for (let i = 0; i < count; i++) {
      const x = Math.random() * box, y = Math.random() * boxY, z = Math.random() * box, s = Math.random();
      for (let e = 0; e < 2; e++) {
        const v = i * 2 + e;
        pos[v * 3] = x; pos[v * 3 + 1] = y; pos[v * 3 + 2] = z;
        end[v] = e; seed[v] = s;
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aEnd', new THREE.BufferAttribute(end, 1));
    g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
    const mat = new THREE.ShaderMaterial({
      vertexShader: RAIN_VERT, fragmentShader: RAIN_FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: {
        uTime: { value: 0 }, uSpeed: { value: 42 }, uBox: { value: box }, uBoxY: { value: boxY }, uLen: { value: 1.3 },
        uCam: { value: new THREE.Vector3() }, uColor: { value: new THREE.Color(0x6f8fb8).multiplyScalar(0.55) },
      },
    });
    timeUniforms.push(mat.uniforms.uTime);
    const lines = new THREE.LineSegments(g, mat);
    lines.frustumCulled = false;
    lines.renderOrder = 6;
    const cam = mat.uniforms.uCam;
    lines.onBeforeRender = (r, s, camera) => { cam.value.copy(camera.position); };
    return lines;
  }
  const snow = kind === 'snow';
  const count = Math.round((snow ? 3200 : 1100) * k);
  const box = snow ? 80 : 90, boxY = snow ? 40 : 45;
  const pos = new Float32Array(count * 3), seed = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    pos[i * 3] = Math.random() * box; pos[i * 3 + 1] = Math.random() * boxY; pos[i * 3 + 2] = Math.random() * box;
    seed[i] = Math.random();
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
  const mat = new THREE.ShaderMaterial({
    vertexShader: PT_VERT, fragmentShader: PT_FRAG, transparent: true, depthWrite: false,
    blending: snow ? THREE.NormalBlending : THREE.AdditiveBlending,
    uniforms: {
      uTime: { value: 0 }, uSpeed: { value: snow ? 5.5 : -5 }, uBox: { value: box }, uBoxY: { value: boxY },
      uSize: { value: snow ? 0.13 : 0.12 }, uSway: { value: snow ? 1.4 : 2.2 }, uViewH: { value: 720 }, uMaxPx: { value: snow ? 7 : 5 },
      uCam: { value: new THREE.Vector3() }, uColor: { value: new THREE.Color(snow ? 0xeaf6ff : 0xff6a10) },
      uColor2: { value: new THREE.Color(0xffc040) }, uMode: { value: snow ? 0 : 1 },
    },
  });
  timeUniforms.push(mat.uniforms.uTime);
  const pts = new THREE.Points(g, mat);
  pts.frustumCulled = false;
  pts.renderOrder = 6;
  const u = mat.uniforms;
  pts.onBeforeRender = (r, s, camera) => { u.uCam.value.copy(camera.position); r.getCurrentViewport(_vp); u.uViewH.value = _vp.w || 720; };
  return pts;
}
