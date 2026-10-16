import * as THREE from 'three';
import { TRACK } from '../core/Constants.js';
import { eventBus, Events } from '../core/EventBus.js';
import { ATLAS_CELLS, atlasRect } from './Textures.js';
import { boxGeo, strutGeo, quadGeo, lampSpacing } from './WorldKit.js';

/**
 * Trackside dressing: light poles, corner chevrons, overhead gantries, the start/finish gantry with
 * start lights, grandstands with an animated crowd, and neon billboards. Static pieces go into the shared
 * Batcher (metal / neon / atlas buckets → 3 draw calls); animated bits are small dedicated meshes.
 */

const _E = new THREE.Euler(), _Q = new THREE.Quaternion(), _V = new THREE.Vector3(), _S = new THREE.Vector3(1, 1, 1);
const _p = {};

/** World matrix of a local frame at arc length s / lateral lat (local +x = track-left, +z = forward). */
function frameAt(track, s, lat, yaw = 0, yAbs = null) {
  const p = track.pointAt(s, lat, _p);
  _E.set(0, p.heading + yaw, 0);
  _Q.setFromEuler(_E);
  return { m: new THREE.Matrix4().compose(_V.set(p.x, yAbs ?? p.y, p.z), _Q, _S), x: p.x, y: p.y, z: p.z, heading: p.heading };
}
const wp = (m, x, y, z) => new THREE.Vector3(x, y, z).applyMatrix4(m);

export class Dressing {
  constructor(ctx) {
    this.ctx = ctx;
    this.objects = [];
    this.unsub = [];
    const { track } = ctx;
    this.L = track.length;
    this.wallOff = track.half + TRACK.WALL_OFFSET;
    this.gantryS = this.pickGantries();
    this.buildStart();
    this.buildGantries();
    this.buildPoles();
    this.buildChevrons();
    this.buildStands();
    this.buildBillboards();
  }

  sd(s) { s = ((s % this.L) + this.L) % this.L; return s > this.L / 2 ? s - this.L : s; }

  /** Clear of every part of the track (centre-line distance). */
  clear(x, z, d) { return this.ctx.track.distanceTo(x, z) >= d; }

  pickGantries() {
    const { track, qp } = this.ctx;
    const cs = track.visualProfile().curvSmooth;
    const G = Math.max(3, Math.round(this.L / (qp.q === 'low' ? 520 : 360)));
    const out = [];
    for (let g = 0; g < G; g++) {
      let best = -1, bc = Infinity;
      const s0 = ((g + 0.5) / G) * this.L;
      for (let ds = -70; ds <= 70; ds += 4) {
        const s = s0 + ds;
        if (Math.abs(this.sd(s)) < 110) continue;
        if (track.ramps.some((r) => Math.abs(r.s - s) < 45)) continue;
        const c = Math.abs(cs[track.wrap(Math.round(s / track.step))]);
        if (c < bc) { bc = c; best = s; }
      }
      if (best >= 0 && bc < 0.012) out.push(best);
    }
    return out;
  }

  // ------------------------------------------------------------------------------ start gantry
  buildStart() {
    const { track, theme, batch, glow } = this.ctx;
    const f = frameAt(track, 0, 0);
    const X = this.wallOff + 2.6, C = 9.4, BH = 3.2;
    const gy = -0.6 - f.y;
    for (const sx of [-1, 1]) { const c = wp(f.m, sx * X, 0, 0); this.ctx.exclude.push({ x: c.x, z: c.z, r: 6 }); }
    const metal = 0x3a3646, dark = 0x1a1822;
    const A = theme.wall, B = theme.wall2;
    // towers
    for (const sx of [-1, 1]) {
      const x = sx * X;
      batch.add('metal', boxGeo(1.8, C + BH + 1.5 - gy, 1.8, x, (C + BH + 1.5 + gy) / 2, 0), f.m, dark);
      batch.add('metal', boxGeo(2.4, 0.5, 2.4, x, C + BH + 1.6, 0), f.m, metal);
      // vertical LED strips on the road-facing edges and the front
      for (const zz of [-0.92, 0.92]) batch.add('neon', boxGeo(0.08, C + BH - 0.6, 0.08, x - sx * 0.92, (C + BH) / 2 + 0.2, zz), f.m, sx < 0 ? A : B, 2.2);
      // checkered panels on the inner faces
      const q = quadGeo(1.5, 5.6);
      q.rotateY(sx > 0 ? -Math.PI / 2 : Math.PI / 2);
      q.translate(x - sx * 0.91, 3.6, 0);
      batch.add('atlas', q, f.m, 0xffffff, 1.1, atlasRect(ATLAS_CELLS.checker));
    }
    // beam
    batch.add('metal', boxGeo(2 * X + 1.8, BH, 1.6, 0, C + BH / 2, 0), f.m, dark);
    batch.add('neon', boxGeo(2 * X + 1.8, 0.12, 0.12, 0, C + 0.02, -0.82), f.m, 0xffffff, 2.2);
    batch.add('neon', boxGeo(2 * X + 1.8, 0.1, 0.1, 0, C + BH, -0.82), f.m, A, 2.4);
    batch.add('neon', boxGeo(2 * X + 1.8, 0.1, 0.1, 0, C + BH, 0.82), f.m, B, 2.4);
    // banners both sides (NEON RUSH = board 5) + checker strips above
    const W = 2 * X - 3.4;
    for (const face of [-1, 1]) {
      const q = quadGeo(W, 2.4);
      if (face < 0) q.rotateY(Math.PI);
      q.translate(0, C + BH / 2 - 0.1, face * 0.81);
      batch.add('atlas', q, f.m, 0xffffff, 1.35, atlasRect(ATLAS_CELLS.board[5]));
    }
    // start lights: 5 pods under the beam facing the grid
    const podX = [-3.2, -1.6, 0, 1.6, 3.2];
    for (const x of podX) {
      batch.add('metal', boxGeo(1.15, 1.0, 0.7, x, C - 0.5, -0.5), f.m, 0x0c0b10);
      batch.add('metal', strutGeo(x, C, -0.5, x, C - 0.05, -0.5, 0.1), f.m, metal);
    }
    const lens = new THREE.CircleGeometry(0.34, 18);
    lens.rotateY(Math.PI);
    this.lightsMat = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: true });
    const lights = new THREE.InstancedMesh(lens, this.lightsMat, 5);
    const m = new THREE.Matrix4();
    podX.forEach((x, i) => { m.makeTranslation(x, C - 0.5, -0.86); m.premultiply(f.m); lights.setMatrixAt(i, m); });
    this.lights = lights;
    this.setLights(-1);
    this.objects.push(lights);
    this.unsub.push(eventBus.on(Events.RACE_COUNTDOWN, ({ n }) => this.setLights(n)));
    // glow along the light bar
    for (let x = -X + 1; x <= X - 1; x += 2.2) { const p = wp(f.m, x, C - 0.05, -0.85); glow.add(p.x, p.y, p.z, 0xffffff, 0.5, 1.2, 0); }
    for (const sx of [-1, 1]) { const p = wp(f.m, sx * X, C + BH + 2.0, 0); glow.add(p.x, p.y, p.z, 0xff2020, 1.6, 2.0, 1, 0.8); }
  }

  /** n: 3,2,1 → red lamps build up, 0 → all green, -1 → idle (dim). */
  setLights(n) {
    const c = new THREE.Color();
    const lit = n > 0 ? Math.min(5, (4 - n) * 2 - 1) : 0;
    for (let i = 0; i < 5; i++) {
      if (n === 0) c.setRGB(0.2, 3.2, 0.6);
      else if (n > 0 && i < lit) c.setRGB(3.6, 0.15, 0.1);
      else c.setRGB(0.12, 0.02, 0.02);
      this.lights.setColorAt(i, c);
    }
    this.lights.instanceColor.needsUpdate = true;
  }

  // ---------------------------------------------------------------------------------- gantries
  buildGantries() {
    const { track, theme, batch, glow, qp } = this.ctx;
    const detailed = qp.q !== 'low';
    this.gantryS.forEach((s, gi) => {
      const f = frameAt(track, s, 0);
      const X = this.wallOff + 1.8, C = 9.2, BH = 1.4, Dp = 1.1;
      const gy = -0.6 - f.y;
      for (const sx of [-1, 1]) { const c = wp(f.m, sx * X, 0, 0); this.ctx.exclude.push({ x: c.x, z: c.z, r: 5 }); }
      const metal = 0x4a4658;
      const top = C + BH;
      for (const sx of [-1, 1]) {
        const x = sx * X;
        if (detailed) {
          for (const dx of [-0.45, 0.45]) for (const dz of [-0.45, 0.45]) batch.add('metal', boxGeo(0.14, top - gy, 0.14, x + dx, (top + gy) / 2, dz), f.m, metal);
          for (let y = gy + 0.2, k = 0; y < top - 1.2; y += 1.5, k++) {
            const y2 = y + 1.5;
            for (const dz of [-0.45, 0.45]) batch.add('metal', strutGeo(x - 0.45, y, dz, x + 0.45, y2, dz, 0.07), f.m, metal);
            for (const dx of [-0.45, 0.45]) batch.add('metal', strutGeo(x + dx, y, -0.45, x + dx, y2, 0.45, 0.07), f.m, metal);
          }
        } else {
          batch.add('metal', boxGeo(0.9, top - gy, 0.9, x, (top + gy) / 2, 0), f.m, 0x24222e);
        }
        batch.add('metal', boxGeo(1.3, 0.4, 1.3, x, gy + 0.2, 0), f.m, 0x24222e);
        batch.add('neon', boxGeo(0.07, top - 0.4, 0.07, x - sx * 0.52, top / 2, -0.52), f.m, sx < 0 ? theme.wall : theme.wall2, 2.0);
      }
      // truss beam
      const span = 2 * X + 0.9;
      if (detailed) {
        for (const yy of [C, top]) for (const zz of [-Dp / 2, Dp / 2]) batch.add('metal', boxGeo(span, 0.16, 0.16, 0, yy, zz), f.m, metal);
        for (let x = -X, k = 0; x < X; x += 1.6, k++) {
          const x2 = Math.min(X, x + 1.6);
          for (const zz of [-Dp / 2, Dp / 2]) batch.add('metal', strutGeo(x, k % 2 ? C : top, zz, x2, k % 2 ? top : C, zz, 0.08), f.m, metal);
          batch.add('metal', strutGeo(x, C, -Dp / 2, x2, C, Dp / 2, 0.06), f.m, metal);
        }
      } else {
        batch.add('metal', boxGeo(span, BH, Dp, 0, C + BH / 2, 0), f.m, 0x24222e);
      }
      // neon under-tube + light bar dots
      batch.add('neon', boxGeo(span - 1, 0.09, 0.09, 0, C - 0.12, 0), f.m, gi % 2 ? theme.wall : theme.wall2, 2.6);
      for (let x = -X + 2; x <= X - 2; x += 3) { const p = wp(f.m, x, C - 0.2, 0); glow.add(p.x, p.y, p.z, gi % 2 ? theme.wall : theme.wall2, 0.6, 1.4, 0); }
      // sign panels (front + back)
      const cell = ATLAS_CELLS.board[gi % 5];
      batch.add('metal', boxGeo(10.4, 2.9, 0.35, 0, top + 1.25, 0), f.m, 0x14121a);
      for (const face of [-1, 1]) {
        const q = quadGeo(10, 2.5);
        if (face < 0) q.rotateY(Math.PI);
        q.translate(0, top + 1.25, face * 0.19);
        batch.add('atlas', q, f.m, 0xffffff, 1.25, atlasRect(face < 0 ? cell : ATLAS_CELLS.board[(gi + 2) % 5]));
      }
    });
  }

  // ---------------------------------------------------------------------------------- light poles
  buildPoles() {
    const { track, theme, batch, glow, qp } = this.ctx;
    const D = lampSpacing(track, qp.poleGap);
    const N = Math.round(this.L / D);
    const lamp = theme.lamp ?? 0xffd2a0;
    const lat0 = this.wallOff + 1.4;
    const cs = track.visualProfile().curvSmooth;
    for (let k = 0; k < N; k++) {
      for (const side of [-1, 1]) {
        const s = (k + (side > 0 ? 0.5 : 0)) * D;
        if (Math.abs(this.sd(s)) < 14) continue;
        const c = cs[track.wrap(Math.round(s / track.step))];
        if (Math.abs(c) > 0.014 && (c > 0 ? -1 : 1) === side) continue; // outer side of tight bends belongs to the chevrons
        if (this.gantryS.some((g) => Math.abs(g - s) < 8)) continue;
        const f = frameAt(track, s, side * lat0, side > 0 ? Math.PI : 0);
        if (!this.clear(f.x, f.z, this.wallOff + 0.9)) continue;
        const gy = -0.6 - f.y;
        const colH = 9.1 - gy;
        const col = new THREE.CylinderGeometry(0.11, 0.17, colH, 6);
        col.translate(0, gy + colH / 2, 0);
        batch.add('metal', col, f.m, 0x34303e);
        batch.add('metal', boxGeo(0.7, 0.6, 0.7, 0, gy + 0.3, 0), f.m, 0x1c1a22);
        batch.add('metal', strutGeo(0, 8.7, 0, -3.25, 9.05, 0, 0.14), f.m, 0x34303e);
        batch.add('metal', boxGeo(1.2, 0.2, 0.46, -3.35, 9.0, 0), f.m, 0x1c1a22);
        batch.add('neon', boxGeo(1.0, 0.05, 0.32, -3.35, 8.88, 0), f.m, lamp, 2.6);
        batch.add('neon', boxGeo(0.05, 4.2, 0.05, -0.16, 3.4, 0), f.m, side < 0 ? theme.wall : theme.wall2, 1.0);
        const p = wp(f.m, -3.35, 8.8, 0);
        glow.add(p.x, p.y, p.z, lamp, 0.55, 2.4, 0);
      }
    }
  }

  // -------------------------------------------------------------------------------- chevron boards
  buildChevrons() {
    const { track, theme, batch } = this.ctx;
    const cs = track.visualProfile().curvSmooth;
    const step = Math.max(1, Math.round(9 / track.step));
    const rect = atlasRect(ATLAS_CELLS.chevron);
    const flipped = [rect[2], rect[1], rect[0], rect[3]];
    let placed = 0;
    for (let i = 0; i < track.n; i += step) {
      const c = cs[i];
      if (Math.abs(c) < 0.0135) continue;
      const s = i * track.step;
      if (Math.abs(this.sd(s)) < 50) continue;
      const side = c > 0 ? -1 : 1; // outside of the bend
      const f = frameAt(track, s, side * (this.wallOff + 1.0), Math.PI - side * 0.35);
      if (!this.clear(f.x, f.z, this.wallOff + 0.6)) continue;
      const gy = -0.6 - f.y;
      const color = side < 0 ? theme.wall : theme.wall2;
      const q = quadGeo(2.4, 0.8);
      q.translate(0, 1.95, 0.04);
      batch.add('atlas', q, f.m, color, 1.7, c > 0 ? rect : flipped);
      batch.add('metal', boxGeo(2.5, 0.9, 0.06, 0, 1.95, 0), f.m, 0x15131b);
      for (const x of [-0.9, 0.9]) batch.add('metal', boxGeo(0.08, 1.55 - gy, 0.08, x, (1.55 + gy) / 2, -0.06), f.m, 0x34303e);
      placed++;
    }
    this.chevrons = placed;
  }

  // -------------------------------------------------------------------------------- grandstands
  buildStands() {
    const { track, theme, batch, glow, qp } = this.ctx;
    const stands = qp.q === 'low' ? [{ s: -70, side: -1 }] : [{ s: -70, side: -1 }, { s: 62, side: 1 }];
    const people = [];
    const colors = [0x30304a, 0x4a2a3a, 0x2a3a4a, 0x553322, 0x223322, 0x5a5a66, 0x6a2050, 0x205a6a];
    const neonShirts = [theme.wall, theme.wall2, 0xffd400];
    const LEN = 60, T = 7, D0 = this.wallOff + 9.5, TD = 1.15, TH = 0.75, Y0 = 1.3;
    for (const st of stands) {
      const f = frameAt(track, st.s, 0, st.side > 0 ? Math.PI : 0);
      // outward = local +x for both (left stand yaw 0 → +x = left; right stand yaw π → +x = right)
      // footprint check against every part of the track
      let ok = true;
      for (const dz of [-LEN / 2, 0, LEN / 2]) {
        const p = wp(f.m, D0 - 1, 0, dz);
        if (!this.clear(p.x, p.z, this.wallOff + 7.5)) ok = false;
      }
      if (!ok) continue;
      this.stands = (this.stands || 0) + 1;
      { const c = wp(f.m, D0 + 4, 0, 0); this.ctx.exclude.push({ x: c.x, z: c.z, r: LEN / 2 + 8 }); }
      const gy = -0.6 - f.y;
      const back = D0 + T * TD;
      // tiers
      for (let k = 0; k < T; k++) {
        const y = Y0 + k * TH;
        batch.add('metal', boxGeo(TD, y - gy, LEN, D0 + k * TD + TD / 2, (y + gy) / 2, 0), f.m, k % 2 ? 0x24222c : 0x2c2a36);
        batch.add('neon', boxGeo(0.04, 0.04, LEN, D0 + k * TD + 0.02, y + 0.02, 0), f.m, k % 2 ? theme.wall : theme.wall2, 0.9);
        // crowd on this tier
        for (let z = -LEN / 2 + 0.6; z < LEN / 2 - 0.4; z += 0.72) {
          if (Math.random() < 0.12 || Math.random() > qp.crowd) continue;
          const p = wp(f.m, D0 + k * TD + TD * 0.55 + (Math.random() - 0.5) * 0.2, y, z + (Math.random() - 0.5) * 0.2);
          const neon = Math.random() < 0.18;
          people.push({ p, yaw: f.heading + (st.side > 0 ? Math.PI : 0) - Math.PI / 2, c: neon ? neonShirts[(Math.random() * 3) | 0] : colors[(Math.random() * colors.length) | 0], neon });
          if (qp.q !== 'low' && Math.random() < 0.14) {
            const g = Math.random();
            glow.add(p.x, p.y + 1.5, p.z, g < 0.6 ? 0xffffff : g < 0.8 ? theme.wall : theme.wall2, 1.6, 0.5, 2, 0.6 + Math.random() * 1.5);
          }
        }
      }
      // front fascia with sponsor boards
      batch.add('metal', boxGeo(0.3, Y0 - gy + 0.3, LEN, D0 - 0.15, (Y0 + 0.3 + gy) / 2, 0), f.m, 0x18161e);
      for (let b = 0; b < 5; b++) {
        const q = quadGeo(10.5, 1.15);
        q.rotateY(-Math.PI / 2);
        q.translate(D0 - 0.31, 0.75, -LEN / 2 + 6 + b * 12);
        batch.add('atlas', q, f.m, 0xffffff, 1.05, atlasRect(ATLAS_CELLS.board[b]));
      }
      // back wall, side walls, roof with neon edge
      const RY = 12.5;
      batch.add('metal', boxGeo(0.4, RY - gy, LEN + 0.8, back + 0.2, (RY + gy) / 2, 0), f.m, 0x1a1820);
      for (const sz of [-1, 1]) batch.add('metal', boxGeo(T * TD + 0.4, RY - 1.5 - gy, 0.4, D0 + (T * TD) / 2, (RY - 1.5 + gy) / 2, sz * (LEN / 2 + 0.2)), f.m, 0x1a1820);
      const roof = boxGeo(T * TD + 3.5, 0.35, LEN + 2, 0, 0, 0);
      roof.rotateZ(-0.12);
      roof.translate(D0 + (T * TD) / 2 - 1.2, RY - 0.6, 0);
      batch.add('metal', roof, f.m, 0x22202a);
      const edgeX = D0 - 2.95, edgeY = RY - 0.6 + Math.sin(0.12) * ((T * TD + 3.5) / 2 + 0.5) - 0.2;
      batch.add('neon', boxGeo(0.12, 0.12, LEN + 2, edgeX, edgeY, 0), f.m, st.side < 0 ? theme.wall : theme.wall2, 2.4);
      for (let z = -LEN / 2 + 3; z <= LEN / 2 - 3; z += 6) {
        for (const zz of [z]) {
          const p = wp(f.m, edgeX + 1.2, edgeY - 0.35, zz);
          glow.add(p.x, p.y, p.z, 0xffffff, 0.7, 2.2, 0);
        }
      }
      for (let z = -LEN / 2; z <= LEN / 2; z += 15) batch.add('metal', boxGeo(0.35, RY - Y0 - (T - 1) * TH, 0.35, back - 0.2, (RY + Y0 + (T - 1) * TH) / 2, z), f.m, 0x2a2834);
      // big screen on the roof facing the track
      const scr = quadGeo(14, 3.5);
      scr.rotateY(-Math.PI / 2);
      scr.translate(D0 + 1.5, RY + 2.3, 0);
      batch.add('atlas', scr, f.m, 0xffffff, 1.3, atlasRect(ATLAS_CELLS.board[5]));
      batch.add('metal', boxGeo(0.4, 4.1, 14.6, D0 + 1.75, RY + 2.3, 0), f.m, 0x101016);
      batch.add('metal', boxGeo(0.3, 2.4, 0.3, D0 + 1.9, RY + 0.4, 0), f.m, 0x2a2834);
    }
    if (!people.length) return;
    // crowd: one instanced mesh, bobbing in the vertex shader
    const body = boxGeo(0.46, 0.85, 0.34, 0, 0.43, 0);
    const head = boxGeo(0.26, 0.28, 0.26, 0, 1.0, 0);
    const geo = mergeTwo(body, head);
    const mat = new THREE.MeshLambertMaterial({ color: 0xffffff });
    const tu = { value: 0 };
    this.ctx.timeUniforms.push(tu);
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = tu;
      sh.vertexShader = sh.vertexShader.replace('#include <common>', 'uniform float uTime;\n#include <common>')
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          #ifdef USE_INSTANCING
          float seed = fract(sin(dot(instanceMatrix[3].xz, vec2(12.9898, 78.233))) * 43758.5453);
          transformed.y += max(0.0, sin(uTime * (5.0 + seed * 4.0) + seed * 40.0)) * 0.22 * step(0.45, seed);
          #endif`);
    };
    mat.customProgramCacheKey = () => 'nr-crowd';
    const inst = new THREE.InstancedMesh(geo, mat, people.length);
    const m = new THREE.Matrix4(), c = new THREE.Color();
    people.forEach((pp, i) => {
      const sc = 0.85 + Math.random() * 0.3;
      _E.set(0, pp.yaw, 0); _Q.setFromEuler(_E);
      m.compose(pp.p, _Q, _V.set(sc, sc, sc));
      inst.setMatrixAt(i, m);
      c.set(pp.c).multiplyScalar(pp.neon ? 1.6 : 1);
      inst.setColorAt(i, c);
    });
    inst.frustumCulled = false;
    this.objects.push(inst);
  }

  // --------------------------------------------------------------------------------- billboards
  buildBillboards() {
    const { track, batch, glow, qp } = this.ctx;
    const cs = track.visualProfile().curvSmooth;
    const gap = qp.q === 'low' ? 320 : 200;
    const N = Math.max(3, Math.floor(this.L / gap));
    let alt = 1, made = 0;
    const W = 18, H = 4.6, B0 = 4.6;
    for (let k = 0; k < N; k++) {
      const s0 = ((k + 0.3) / N) * this.L;
      const ahead = cs[track.wrap(Math.round((s0 + 70) / track.step))];
      let pref;
      if (Math.abs(ahead) > 0.006) pref = ahead > 0 ? -1 : 1; else { pref = alt; alt = -alt; }
      let f = null, s = 0;
      search: for (const ds of [0, 30, -30, 60, -60]) {
        for (const side of [pref, -pref]) {
          s = s0 + ds;
          if (Math.abs(this.sd(s)) < 90) continue;
          if (this.gantryS.some((g) => Math.abs(g - s) < 35)) continue;
          const cand = frameAt(track, s, side * (this.wallOff + 14), Math.PI - side * 0.45);
          const ends = [wp(cand.m, -W / 2, 0, 0), wp(cand.m, W / 2, 0, 0)];
          if (!this.clear(cand.x, cand.z, this.wallOff + 10) || ends.some((e) => !this.clear(e.x, e.z, this.wallOff + 6))) continue;
          if (this.ctx.exclude.some((e) => (e.x - cand.x) ** 2 + (e.z - cand.z) ** 2 < (e.r + 10) ** 2)) continue;
          f = cand;
          break search;
        }
      }
      if (!f) continue;
      const gy = -0.6 - f.y;
      this.ctx.exclude.push({ x: f.x, z: f.z, r: 13 });
      const cell = ATLAS_CELLS.board[(k + 1) % 5];
      const q = quadGeo(W, H);
      q.translate(0, B0 + H / 2, 0.22);
      batch.add('atlas', q, f.m, 0xffffff, 1.25, atlasRect(cell));
      batch.add('metal', boxGeo(W + 0.6, H + 0.6, 0.4, 0, B0 + H / 2, 0), f.m, 0x15131b);
      for (const x of [-W * 0.3, W * 0.3]) {
        batch.add('metal', boxGeo(0.55, B0 - gy, 0.55, x, (B0 + gy) / 2, -0.3), f.m, 0x2c2836);
        for (let y = gy + 2; y < B0 - 1; y += 2.2) batch.add('metal', strutGeo(x - 0.25, y, -0.3, x + 0.25, y + 1.8, -0.3, 0.08), f.m, 0x2c2836);
      }
      // top light rig: arms + lamp heads with glow
      for (let x = -W / 2 + 2; x <= W / 2 - 2; x += 4.6) {
        batch.add('metal', strutGeo(x, B0 + H + 0.3, 0.1, x, B0 + H + 0.9, 1.2, 0.08), f.m, 0x2c2836);
        batch.add('neon', boxGeo(0.5, 0.12, 0.25, x, B0 + H + 0.9, 1.25), f.m, 0xffffff, 2.2);
        const p = wp(f.m, x, B0 + H + 0.8, 1.3);
        glow.add(p.x, p.y, p.z, 0xfff0e0, 0.5, 2.0, 0);
      }
      made++;
    }
    this.billboards = made;
  }

  dispose() {
    for (const u of this.unsub) u();
    this.unsub = [];
  }
}

function mergeTwo(a, b) {
  const pos = [...a.attributes.position.array, ...b.attributes.position.array];
  const nor = [...a.attributes.normal.array, ...b.attributes.normal.array];
  const off = a.attributes.position.count;
  const idx = [...a.index.array, ...Array.from(b.index.array, (i) => i + off)];
  a.dispose(); b.dispose();
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setIndex(idx);
  return g;
}
