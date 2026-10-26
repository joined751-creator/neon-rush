import * as THREE from 'three';
import { glowTex } from './CarFX.js';

/*
 * v4.4.1 phone hitches: WebGL builds a shader the first time a material is drawn. Many effects are hidden until
 * they happen (boost flames, shield, explosions, rockets, oil, EMP, Overdrive trail), so on a phone the first nitro
 * or the first rocket froze the game for a moment. Here every such shader is built once, before the countdown:
 * hidden objects are shown for one compile pass, plus samples of the effects that are created on the fly.
 */
let S = null;

export function warmupShaders(race, renderer) {
  if (!race || !renderer) return;
  const scene = race.scene;
  const camera = race.rigs?.[0]?.camera || race.demoCam?.camera;
  if (!camera) return;
  const shown = [];
  scene.traverse((o) => { if (!o.visible) { o.visible = true; shown.push(o); } });
  const samples = new THREE.Group();
  const add = (o) => { o.position.copy(camera.position); o.position.z -= 5; o.frustumCulled = false; samples.add(o); return o; };
  // the samples are kept for the whole session: disposing them would free the very programs we just built
  S ||= {
    sprite: new THREE.SpriteMaterial({ map: glowTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }),
    add1: new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }),
    add2: new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }),
    geo: new THREE.PlaneGeometry(0.01, 0.01),
  };
  const { sprite, add1, add2, geo } = S;
  add(new THREE.Sprite(sprite));
  add(new THREE.Mesh(geo, add1));
  add(new THREE.Mesh(geo, add2));
  scene.add(samples);
  const cams = race.rigs?.length ? race.rigs.map((r) => r.camera) : [camera];
  try {
    for (const c of cams) {
      renderer.compile(scene, c); // (compileAsync keeps polling materials that a quick restart may already have freed)
    }
  } catch (e) { /* warmup is best effort */ }
  scene.remove(samples);
  for (const o of shown) o.visible = false;
}
