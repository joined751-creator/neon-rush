import * as THREE from 'three';

/**
 * v4.1 car lighting on the road: a soft pool of headlight light in front of every car and a red glow from the
 * tail lights behind it (brighter when braking). Cheap additive decals instead of real spot lights, so eight
 * cars cost a handful of quads; strength depends on how dark the track is (theme.carLights).
 */

let headTex = null, tailTex = null;

/** Headlight cone: apex at the top (near the car), widening and fading towards the bottom (far end). */
function coneTexture() {
  const W = 128, H = 256;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  const img = g.createImageData(W, H);
  for (let y = 0; y < H; y++) {
    const t = y / (H - 1); // 0 near the bumper → 1 far ahead
    const halfW = 0.16 + 0.84 * Math.pow(t, 0.7); // cone width at this distance (fraction of half-width)
    const along = Math.pow(1 - t, 1.6) * Math.min(1, t * 9 + 0.15); // fades out ahead, soft start at the bumper
    for (let x = 0; x < W; x++) {
      const u = Math.abs((x + 0.5) / W * 2 - 1) / halfW; // 0 centre → 1 cone edge
      const across = u >= 1 ? 0 : Math.pow(1 - u * u, 1.8);
      // two lamps: slightly brighter streaks left and right of centre near the car
      const lamps = 1 + 0.35 * (1 - t) * Math.exp(-Math.pow((Math.abs((x + 0.5) / W * 2 - 1) - 0.35 * halfW) * 6, 2));
      const v = Math.min(1, along * across * lamps);
      const i = (y * W + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = Math.round(v * 255);
      img.data[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function blobTexture() {
  const S = 128;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  gr.addColorStop(0, 'rgba(255,255,255,1)');
  gr.addColorStop(0.35, 'rgba(255,255,255,0.45)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, S, S);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

const decalMat = (map, color) => new THREE.MeshBasicMaterial({
  map, color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4,
});

export class CarLights {
  constructor(cars, theme) {
    const k = theme.carLights ?? 0.7;
    this.k = k;
    headTex ||= coneTexture();
    tailTex ||= blobTexture();
    this.headMat = decalMat(headTex, new THREE.Color(0xffe6c4).multiplyScalar(0.55 * k));
    const L = 17, W = 8;
    this.headGeo = new THREE.PlaneGeometry(W, L).rotateX(-Math.PI / 2);
    this.tailGeo = new THREE.PlaneGeometry(2.8, 2.2).rotateX(-Math.PI / 2);
    this.items = cars.map((car) => {
      // opaque body parts cast real-time shadows (the soft blob under the car stays as contact shadow)
      car.model.body.traverse((o) => {
        if (o.isMesh && !o.material.transparent && o.material.blending !== THREE.AdditiveBlending) o.castShadow = true;
      });
      const d = car.model.dims;
      const head = new THREE.Mesh(this.headGeo, this.headMat);
      head.position.set(0, 0.07, d.front - 0.4 + L / 2);
      head.renderOrder = 2;
      head.frustumCulled = false;
      const tailMat = decalMat(tailTex, new THREE.Color(0xff1030).multiplyScalar(0.5 * k));
      const tail = new THREE.Mesh(this.tailGeo, tailMat);
      tail.position.set(0, 0.07, d.rear - 0.7);
      tail.renderOrder = 2;
      car.model.root.add(head, tail);
      return { car, head, tail, tailMat, brake: 0 };
    });
  }

  update(dt) {
    for (const it of this.items) {
      const { car } = it;
      const on = !car.airborne && !car.eliminated;
      it.head.visible = on;
      it.tail.visible = on;
      const braking = car.controls.brake > 0 || !car.controlEnabled ? 1 : 0;
      it.brake += (braking - it.brake) * Math.min(1, dt * 10);
      it.tailMat.color.setRGB(1, 0.06, 0.19).multiplyScalar(this.k * (0.22 + 0.55 * it.brake));
    }
  }

  dispose() {
    for (const it of this.items) {
      it.head.removeFromParent();
      it.tail.removeFromParent();
      it.tailMat.dispose();
    }
    this.headMat.dispose();
    this.headGeo.dispose();
    this.tailGeo.dispose();
  }
}
