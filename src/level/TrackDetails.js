import * as THREE from 'three';

/** Trackside depth cues: two instanced batches, no lights, textures or per-frame work. */
export function buildTrackDetails(track, theme, quality = 'medium') {
  const group = new THREE.Group();
  group.name = 'track-detail-pass';
  const shells = [], lights = [];
  const primary = new THREE.Color(theme.roadLine ?? 0x00e5ff);
  const secondary = new THREE.Color(theme.kerbA ?? 0xff9b45);
  const transform = new THREE.Object3D();
  const put = (list, p, width, height, depth, lift, color, across = 0) => {
    transform.position.set(p.x + Math.cos(p.heading) * across, p.y + lift, p.z - Math.sin(p.heading) * across);
    transform.rotation.set(0, p.heading, 0);
    transform.scale.set(width, height, depth);
    transform.updateMatrix();
    list.push({ matrix: transform.matrix.clone(), color });
  };
  // Low quality keeps a sparse set; fixed cap prevents long circuits from growing unbounded.
  const spacing = quality === 'low' ? 80 : quality === 'high' ? 30 : 42;
  const count = Math.min(96, Math.max(8, Math.floor(track.length / spacing)));
  for (let i = 0; i < count; i++) {
    const s = (i + 0.5) / count * track.length;
    for (const side of [-1, 1]) {
      const p = track.pointAt(s, side * (track.half + 0.65));
      const color = side < 0 ? primary : secondary;
      // Brushed metal bollard, inset vertical lamp, small reflector above barrier level.
      put(shells, p, 0.24, 1.45, 0.34, 0.725);
      put(lights, p, 0.08, 0.9, 0.36, 0.9, color);
      put(lights, p, 0.28, 0.045, 0.4, 1.47, color);
    }
  }
  // A pair of distinct sector landmarks. Crossbars are well above the road, never a collider.
  if (quality !== 'low') for (const fraction of [0.33, 0.67]) {
    const s = track.length * fraction;
    if (track.ramps?.some((r) => Math.abs(r.s - s) < r.len + 30)) continue;
    const p = track.pointAt(s);
    const span = track.half + 2.0;
    for (const side of [-1, 1]) {
      put(shells, p, 0.5, 8, 0.8, 4, null, side * span);
      put(lights, p, 0.12, 6.5, 0.84, 4.3, primary, side * span);
    }
    put(shells, p, span * 2 + 0.6, 0.45, 1.0, 8);
    put(lights, p, span * 2, 0.075, 1.04, 7.85, secondary);
    for (const side of [-1, 1]) {
      put(shells, p, 2.5, 1, 0.75, 7.55, null, side * (span - 1.5));
      put(lights, p, 1.6, 0.12, 0.79, 7.55, primary, side * (span - 1.5));
    }
  }
  const batch = (entries, material, name) => {
    const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), material, entries.length);
    mesh.name = name;
    entries.forEach((entry, i) => {
      mesh.setMatrixAt(i, entry.matrix);
      if (entry.color) mesh.setColorAt(i, entry.color);
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
    group.add(mesh);
  };
  batch(shells, new THREE.MeshStandardMaterial({ color:0x233342, metalness:0.65, roughness:0.42 }), 'detail-metal');
  batch(lights, new THREE.MeshBasicMaterial({ color:0xffffff }), 'detail-reflectors');
  return group;
}
