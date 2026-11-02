import * as THREE from 'three';

/*
 * v4.4 new cars: body specs + their own body kits, plugged into the procedural car builder (CarModel).
 *  - «Импульс EV» — electric supercar: long fastback, glass roof, no exhaust pipes; boost "flames" are electric
 *    blue/violet plasma (see CarFX).
 *  - «Буран 4×4» — rally off-roader: tall body, big tyres, high ground clearance, roof rack with spotlights,
 *    bull bar, wide black cladding, mud flaps and a spare wheel on the tailgate.
 */

export const EXTRA_SPECS = {
  // v5.0 «Вектор» — light car of the digital world: long low wedge, small bubble canopy, black gloss body,
  // its outline traced by continuous light lines in the player's colour
  vector: {
    L: 4.85, W: 2.06, r: 0.36, tireW: 0.33, wf: 1.5, wr: -1.5, bot: 0.14,
    top: [[-2.42, 0.8], [-2.05, 0.86], [-0.9, 0.88], [0.6, 0.76], [1.6, 0.58], [2.28, 0.44], [2.42, 0.36]],
    cabin: { zA: 0.75, zB: 0.0, zC: -0.95, zD: -1.85, roof: 1.12, tumble: 0.6 },
    plan: { front: 0.9, frontK: 0.45, rear: 0.45, rearK: 0.15 },
    flare: 0.08, frontPeak: 0.03, rearHaunch: 0.06,
    kit: { spoiler: 'lip', exhaust: 2, caliper: 0x0a0c12, rimStyle: 10, ev: true, glassRoof: true, lightLines: true },
  },
  pulse: {
    L: 4.7, W: 2.02, r: 0.36, tireW: 0.31, wf: 1.48, wr: -1.44, bot: 0.17,
    top: [[-2.35, 0.88], [-1.95, 0.95], [-0.9, 0.97], [0.8, 0.8], [1.7, 0.62], [2.22, 0.5], [2.35, 0.42]],
    cabin: { zA: 0.85, zB: 0.15, zC: -0.85, zD: -1.85, roof: 1.2, tumble: 0.66 },
    plan: { front: 0.8, frontK: 0.4, rear: 0.5, rearK: 0.18 },
    flare: 0.06, frontPeak: 0.04, rearHaunch: 0.07,
    kit: { spoiler: 'lip', exhaust: 2, caliper: 0x00e5ff, rimStyle: 10, ev: true, glassRoof: true },
  },
  buran: {
    L: 4.6, W: 2.1, r: 0.43, tireW: 0.36, wf: 1.45, wr: -1.4, bot: 0.4,
    top: [[-2.3, 1.3], [-2.0, 1.33], [0.6, 1.25], [1.5, 1.18], [2.15, 1.0], [2.3, 0.86]],
    cabin: { zA: 0.75, zB: 0.2, zC: -1.75, zD: -2.15, roof: 1.98, tumble: 0.85 },
    plan: { front: 0.4, frontK: 0.15, rear: 0.3, rearK: 0.1 },
    flare: 0.09, frontPeak: 0.0, rearHaunch: 0.03,
    kit: { spoiler: 'roof', exhaust: 1, caliper: 0xffb000, rimStyle: 6, hatch: true, offroad: true },
  },
};

/** Extra parts for the new kits. ctx = { kit, S, B, M, add, ghost, nose, tail } from the builder. */
export function buildKitExtras({ kit, S, B, M, add, ghost, nose, tail }) {
  // v5.1: every car wears the light-car look; v5.6: real paint in the player's colour + a thin light contour
  lightParts(S, B, M, add, ghost, nose, tail);
  realParts({ S, B, M, add, ghost, nose, tail });
  if (kit.offroad) offroadParts(S, B, M, add, ghost, nose, tail);
}

function offroadParts(S, B, M, add, ghost, nose, tail) {
  const C = S.cabin;
  const roofY = C.roof + 0.02;
  // roof rack: two rails + cross bars
  const zr0 = C.zC + 0.05, zr1 = C.zB - 0.02, zm = (zr0 + zr1) / 2, len = zr1 - zr0;
  for (const side of [-1, 1]) {
    const rail = add(new THREE.BoxGeometry(0.05, 0.06, len), M.dark);
    rail.position.set(side * 0.62, roofY + 0.08, zm);
    for (const z of [zr0 + 0.08, zr1 - 0.08]) {
      const leg = add(new THREE.BoxGeometry(0.05, 0.1, 0.05), M.dark);
      leg.position.set(side * 0.62, roofY + 0.03, z);
    }
  }
  for (let k = 0; k < 4; k++) {
    const bar = add(new THREE.BoxGeometry(1.3, 0.035, 0.05), M.dark);
    bar.position.set(0, roofY + 0.1, zr0 + 0.15 + (k * (len - 0.3)) / 3);
  }
  // spotlights on the front of the rack: housings + glowing lenses
  const lensGeo = new THREE.CircleGeometry(0.075, 16);
  const houseGeo = new THREE.CylinderGeometry(0.085, 0.09, 0.1, 16).rotateX(Math.PI / 2);
  for (const x of [-0.45, -0.15, 0.15, 0.45]) {
    const h = add(houseGeo, M.dark);
    h.position.set(x, roofY + 0.2, zr1 - 0.02);
    const lens = add(lensGeo, M.head);
    lens.position.set(x, roofY + 0.2, zr1 + 0.035);
  }
  // bull bar in front of the grille
  const bz = nose + 0.08, by = B.bot(nose) + 0.12;
  const hw = B.hw(nose - 0.2);
  for (const side of [-1, 1]) {
    const post = add(new THREE.BoxGeometry(0.06, 0.5, 0.06), M.dark);
    post.position.set(side * hw * 0.55, by + 0.2, bz);
  }
  for (const dy of [0.05, 0.42]) {
    const cross = add(new THREE.BoxGeometry(hw * 1.25, 0.06, 0.06), M.dark);
    cross.position.set(0, by + dy, bz);
  }
  const skid = add(new THREE.BoxGeometry(hw * 1.3, 0.03, 0.5), M.chrome);
  skid.position.set(0, B.bot(nose) - 0.03, nose - 0.2);
  skid.rotation.x = 0.25;
  // wide black cladding along the sills and over the arches
  for (const side of [-1, 1]) {
    const z = (S.wf + S.wr) / 2;
    const sill = add(new THREE.BoxGeometry(0.07, 0.16, Math.abs(S.wf - S.wr) - S.r * 2 - 0.2), M.dark);
    sill.position.set(side * (B.hw(z) + B.flare(z) + 0.02), S.bot + 0.1, z);
    for (const wz of [S.wf, S.wr]) {
      const arch = add(new THREE.TorusGeometry(S.r + 0.1, 0.045, 6, 18, Math.PI), M.dark);
      arch.rotation.y = Math.PI / 2;
      arch.position.set(side * (B.hw(wz) + B.flare(wz) * 0.9 + 0.02), S.r, wz);
    }
    // mud flaps behind the wheels
    for (const wz of [S.wf, S.wr]) {
      const flap = add(new THREE.BoxGeometry(0.26, 0.24, 0.02), M.dark);
      flap.position.set(side * (B.hw(wz) + B.flare(wz) * 0.4 - 0.12), S.r * 0.55, wz - S.r - 0.1);
    }
  }
  // spare wheel on the tailgate
  if (!ghost) {
    const spare = add(new THREE.CylinderGeometry(S.r * 0.86, S.r * 0.86, 0.2, 24).rotateX(Math.PI / 2), M.tyre);
    spare.position.set(0, (B.bot(tail) + B.top(tail)) / 2 + 0.12, tail - 0.1);
    const hub = add(new THREE.CylinderGeometry(S.r * 0.45, S.r * 0.45, 0.205, 18).rotateX(Math.PI / 2), M.rim);
    hub.position.copy(spare.position);
    const cap = add(new THREE.CircleGeometry(S.r * 0.12, 12), M.neon);
    cap.position.set(0, spare.position.y, spare.position.z - 0.105);
    cap.rotation.y = Math.PI;
  }
}

/** v5.0 light car (v5.1: all cars; v5.6: a real paint job + a thin light contour as an accent).
 * The body keeps the player's colour as deep metallic paint; slim light lines run along the shoulders, the sills
 * and the canopy spine, plus full-width LED bars across the nose and the tail. */
function lightParts(S, B, M, add, ghost, nose, tail) {
  // a dimmer copy of the accent colour: the contour frames the car instead of drowning it in glow
  const line = ghost ? M.neon : new THREE.MeshBasicMaterial({ color: M.accent.clone().multiplyScalar(1.5) });
  const tube = (pts, r = 0.012) => {
    const curve = new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(p[0], p[1], p[2])));
    return add(new THREE.TubeGeometry(curve, Math.max(12, pts.length * 3), r, 5, false), line);
  };
  for (const side of [-1, 1]) {
    // shoulder line: mid-height of the flank, lifting over each wheel arch
    const sh = [];
    for (let z = tail + 0.12; z <= nose - 0.2; z += 0.08) {
      const bot = B.bot(z), top = B.top(z);
      const mid = bot + (top - bot) * 0.42;
      const a = B.arch(z);
      const y = Math.max(mid, a > 0 ? a + 0.035 : -1);
      sh.push([side * (B.hw(z) + B.flare(z) + 0.01), y, z]);
    }
    tube(sh, 0.011);
    // sill line between the wheels
    const R = S.r + 0.075;
    const sl = [];
    for (let z = S.wr + R + 0.06; z <= S.wf - R - 0.06; z += 0.1) sl.push([side * (B.hw(z) * 0.985 + B.flare(z) * 0.85 + 0.012), B.bot(z) + 0.13, z]);
    tube(sl, 0.01);
  }
  // canopy spine
  const C = S.cabin, sp = [];
  for (let z = C.zD - 0.1; z <= C.zA + 0.1; z += 0.08) sp.push([0, B.glassTop(z) + 0.012, z]);
  tube(sp, 0.009);
  // full-width LED bars: white across the nose, red across the tail
  const fz = nose - 0.1;
  const front = add(new THREE.BoxGeometry(B.hw(fz) * 1.75, 0.022, 0.03), M.head);
  front.position.set(0, B.top(fz) - 0.07, fz + 0.01);
  const rz = tail + 0.05;
  const rear = add(new THREE.BoxGeometry(B.hw(rz) * 1.85, 0.035, 0.03), M.tail);
  rear.position.set(0, B.top(rz) - 0.08, rz - 0.01);
}

/** z on the nose (fromNose) or tail where the body is at least |x| wide. */
function edgeZ(B, x, fromNose) {
  if (fromNose) { for (let z = B.nose; z > 0; z -= 0.01) if (B.hw(z) + B.flare(z) * 0.5 >= Math.abs(x) + 0.02) return z; }
  else { for (let z = B.tail; z < 0; z += 0.01) if (B.hw(z) + B.flare(z) * 0.5 >= Math.abs(x) + 0.02) return z; }
  return 0;
}

let honeyTex = null;
function honeycomb() {
  if (honeyTex) return honeyTex;
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = '#16181e'; g.fillRect(0, 0, 64, 64);
  g.fillStyle = '#020203';
  for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
    const cx = x * 16 + (y % 2) * 8 + 4, cy = y * 16 + 8;
    g.beginPath();
    for (let k = 0; k < 6; k++) { const a = k * Math.PI / 3 + Math.PI / 6; g.lineTo(cx + Math.cos(a) * 6.2, cy + Math.sin(a) * 6.2); }
    g.fill();
  }
  honeyTex = new THREE.CanvasTexture(c);
  honeyTex.wrapS = honeyTex.wrapT = THREE.RepeatWrapping;
  honeyTex.colorSpace = THREE.SRGBColorSpace;
  return honeyTex;
}

/** v5.6 "real car" details: headlight units with projector lenses, smoked tail-light clusters, honeycomb
 * grille and side intakes, door shut lines, door handles and a simple interior seen through the glass. */
export function realParts({ S, B, M, add, ghost, nose, tail }) {
  if (ghost) return;
  const half = S.W / 2;
  // existing car materials are reused wherever possible: after welding (CarMerge) every material is one draw call
  const lens = M.glass, proj = M.head, handle = M.chrome, cabinMat = M.dark, seatMat = M.dark, gap = M.dark;
  const smoke = new THREE.MeshPhysicalMaterial({ color: 0x3a0308, emissive: 0x70040e, emissiveIntensity: 0.6, metalness: 0.2, roughness: 0.12, clearcoat: 1, clearcoatRoughness: 0.03 });
  const grilleMat = new THREE.MeshStandardMaterial({ map: honeycomb(), metalness: 0.4, roughness: 0.5 });
  grilleMat.map.repeat.set(6, 1.4);

  for (const side of [-1, 1]) {
    // ---- headlight unit: a glossy black lens with two projector lamps, set into the nose
    const x0 = side * half * 0.52, x1 = side * half * 0.84;
    const z0 = edgeZ(B, x0, true), z1 = edgeZ(B, x1, true);
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2 - 0.035;
    const yH = B.top(cz) - 0.085;
    const unit = add(new THREE.BoxGeometry(Math.abs(x1 - x0) + 0.06, 0.085, 0.05), lens);
    unit.position.set(cx, yH, cz);
    unit.rotation.y = -Math.atan2(z1 - z0, Math.abs(x1 - x0)) * side;
    for (const t of [0.3, 0.68]) {
      const px = x0 + (x1 - x0) * t, pz = z0 + (z1 - z0) * t;
      const p = add(new THREE.CircleGeometry(0.026, 14), proj);
      p.position.set(px, yH - 0.004, pz - 0.006);
    }
    // ---- tail-light cluster: smoked red glass under the light bar
    const tx0 = side * half * 0.5, tx1 = side * half * 0.86;
    const tz0 = edgeZ(B, tx0, false), tz1 = edgeZ(B, tx1, false);
    const tl = add(new THREE.BoxGeometry(Math.abs(tx1 - tx0) + 0.04, 0.1, 0.04), smoke);
    tl.position.set((tx0 + tx1) / 2, B.top((tz0 + tz1) / 2) - 0.13, (tz0 + tz1) / 2 + 0.02);
    tl.rotation.y = Math.atan2(tz1 - tz0, Math.abs(tx1 - tx0)) * side;
    // ---- side intake in the front bumper
    const iz = nose - 0.3, ix = side * half * 0.68;
    const intake = add(new THREE.BoxGeometry(half * 0.42, 0.11, 0.06), grilleMat);
    intake.position.set(ix, B.bot(iz) + 0.12, edgeZ(B, ix, true) - 0.05);
    // ---- door: shut lines (front + rear edge) and a handle
    const C = S.cabin;
    const dz0 = C.zA - 0.08, dz1 = Math.max(C.zC + 0.05, S.wr + S.r + 0.3);
    for (const z of [dz0, dz1]) {
      const pts = [];
      const yb = B.bot(z) + 0.16, yt = B.top(z) - 0.03;
      for (let k = 0; k <= 6; k++) {
        const y = yb + (yt - yb) * (k / 6);
        pts.push(new THREE.Vector3(side * (B.hw(z) + B.flare(z) * 0.9 + 0.004 - (k === 6 ? 0.03 : 0)), y, z));
      }
      add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 8, 0.0055, 4, false), gap);
    }
    const hz = dz0 - 0.28, hy = B.top(hz) - 0.13;
    const h = add(new THREE.BoxGeometry(0.03, 0.025, 0.17), handle);
    h.position.set(side * (B.hw(hz) + B.flare(hz) * 0.9 + 0.012), hy, hz);
    // ---- seats seen through the glass
    const sz = (C.zB + C.zC) / 2 - 0.05, sx = side * half * 0.36;
    const seat = add(new THREE.BoxGeometry(0.42, 0.12, 0.46), seatMat);
    seat.position.set(sx, B.top(sz) - 0.2, sz);
    const back = add(new THREE.BoxGeometry(0.42, 0.5, 0.1), seatMat);
    back.position.set(sx, B.top(sz) + 0.05, sz - 0.24);
    back.rotation.x = -0.25;
    const rest = add(new THREE.BoxGeometry(0.24, 0.16, 0.08), seatMat);
    rest.position.set(sx, B.top(sz) + 0.36, sz - 0.32);
  }
  // ---- grille: honeycomb mesh between the headlights
  const gz = nose - 0.06;
  const grille = add(new THREE.BoxGeometry(half * 0.9, 0.13, 0.03), grilleMat);
  grille.position.set(0, B.bot(gz) + 0.15, edgeZ(B, half * 0.45, true) - 0.04);
  // ---- dashboard + steering wheel
  const C = S.cabin;
  const dz = C.zA - 0.12;
  const dash = add(new THREE.BoxGeometry(S.W * 0.78, 0.12, 0.3), cabinMat);
  dash.position.set(0, B.top(dz) - 0.04, dz - 0.05);
  const wheel = add(new THREE.TorusGeometry(0.16, 0.022, 6, 18), cabinMat);
  wheel.position.set(-half * 0.36, B.top(dz) + 0.08, dz - 0.26);
  wheel.rotation.x = -0.5;
}
