import * as THREE from 'three';

/*
 * v4.4 new cars: body specs + their own body kits, plugged into the procedural car builder (CarModel).
 *  - «Импульс EV» — electric supercar: long fastback, glass roof, no exhaust pipes, full-width light bars
 *    front and back, neon lines along the sides; boost "flames" are electric blue/violet plasma (see CarFX).
 *  - «Буран 4×4» — rally off-roader: tall body, big tyres, high ground clearance, roof rack with spotlights,
 *    bull bar, wide black cladding, mud flaps and a spare wheel on the tailgate.
 */

export const EXTRA_SPECS = {
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
  if (kit.ev) evParts(S, B, M, add, ghost, nose, tail);
  if (kit.offroad) offroadParts(S, B, M, add, ghost, nose, tail);
}

function evParts(S, B, M, add, ghost, nose, tail) {
  // full-width light bars (front: white, back: red) — the signature of a modern EV
  const fz = nose - 0.12, fy = B.top(fz) - 0.06;
  const front = add(new THREE.BoxGeometry(B.hw(fz) * 1.7, 0.028, 0.04), M.head);
  front.position.set(0, fy, fz);
  const rz = tail + 0.06, ry = B.top(rz) - 0.07;
  const rear = add(new THREE.BoxGeometry(B.hw(rz) * 1.8, 0.035, 0.04), M.tail);
  rear.position.set(0, ry, rz);
  // neon accent lines along the sides (paint colour)
  if (!ghost) {
    for (const side of [-1, 1]) {
      const z0 = S.wr + S.r + 0.12, z1 = S.wf - S.r - 0.12;
      const zm = (z0 + z1) / 2;
      const y = B.bot(zm) + (B.top(zm) - B.bot(zm)) * 0.28;
      const line = add(new THREE.BoxGeometry(0.012, 0.022, z1 - z0), M.neon);
      line.position.set(side * (B.hw(zm) + B.flare(zm) + 0.012), y, zm);
    }
  }
  // charge-port light and a smooth "frunk" panel instead of a grille
  const port = add(new THREE.BoxGeometry(0.02, 0.05, 0.12), M.neon);
  port.position.set(-(B.hw(S.wr + 0.55) + 0.01), B.top(S.wr + 0.55) - 0.12, S.wr + 0.55);
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
