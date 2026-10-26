import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/*
 * v4.4.1 phone performance: a procedural car is built from ~70 small meshes (splitter, fins, mirrors, light bars,
 * kit parts…), and every mesh is a separate draw call — ×8 cars, ×2 with real-time shadows, ×more for the live
 * reflections. Phones choke on draw calls long before pixels. Here the static parts of a car are welded into one
 * mesh per material (same look, ~5× fewer draw calls). Moving parts (wheels), effects (flames, beams, glow) stay.
 */

const signature = (o) => {
  const g = o.geometry;
  const attrs = Object.keys(g.attributes).sort().map((k) => `${k}${g.attributes[k].itemSize}`).join(',');
  return `${o.material.uuid}|${attrs}|${g.index ? 'i' : 'n'}|${o.renderOrder}|${o.castShadow}`;
};

/** Merges the direct mesh children of `group` that share a material. `keep` = meshes that must stay separate. */
export function mergeStaticParts(group, keep = new Set()) {
  const groups = new Map();
  for (const o of group.children) {
    if (!o.isMesh || keep.has(o) || !o.visible || o.isSkinnedMesh || o.isInstancedMesh) continue;
    const m = o.material;
    if (!m || Array.isArray(m) || m.blending === THREE.AdditiveBlending || o.geometry.groups?.length) continue;
    const key = signature(o);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(o);
  }
  for (const list of groups.values()) {
    if (list.length < 2) continue;
    const geos = list.map((o) => {
      o.updateMatrix();
      const c = o.geometry.clone();
      for (const k of Object.keys(c.morphAttributes)) delete c.morphAttributes[k];
      c.applyMatrix4(o.matrix);
      return c;
    });
    const merged = mergeGeometries(geos, false);
    for (const g of geos) g.dispose();
    if (!merged) continue;
    const first = list[0];
    const mesh = new THREE.Mesh(merged, first.material);
    mesh.renderOrder = first.renderOrder;
    mesh.castShadow = first.castShadow;
    mesh.receiveShadow = first.receiveShadow;
    mesh.userData.merged = true;
    group.add(mesh);
    for (const o of list) {
      group.remove(o);
      if (!o.geometry.userData.shared) o.geometry.dispose();
    }
  }
}

/** Whole car: welded body parts + per-wheel welding (cap + glowing ring share a material). */
export function optimizeCarModel(model) {
  mergeStaticParts(model.body, new Set(model.flames));
  for (const w of model.wheels) mergeStaticParts(w.spin);
}
