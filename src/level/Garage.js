import * as THREE from 'three';
import { buildCarModel, disposeCarModel } from '../gameplay/CarModel.js';
import { CAR_TYPES, CAR_COLORS } from '../core/Constants.js';
import { disposeTree } from './Environment.js';

/** Showroom scene: turntables with the players' selected cars. */
export class Garage {
  constructor(renderer) {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x07040f);
    this.scene.fog = new THREE.Fog(0x07040f, 18, 60);
    this.camera = new THREE.PerspectiveCamera(40, 1, 0.1, 200);
    this.models = [];
    this.platforms = [];
    this.time = 0;
    this.players = 1;

    const pm = new THREE.PMREMGenerator(renderer);
    const env = new THREE.Scene();
    env.background = new THREE.Color(0x0a0614);
    const addPanel = (c, i, w, h, x, y, z) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(c).multiplyScalar(i), side: THREE.DoubleSide }));
      m.position.set(x, y, z); m.lookAt(0, 0, 0); env.add(m);
    };
    addPanel(0xffffff, 3, 16, 2, 0, 9, 0);
    addPanel(0xff2bd6, 3, 3, 14, -10, 2, 2);
    addPanel(0x00e5ff, 3, 3, 14, 10, 2, -2);
    addPanel(0x8a5cff, 1.0, 20, 2, 0, 1, -10);
    this.envMap = pm.fromScene(env, 0.03).texture;
    pm.dispose();
    this.scene.environment = this.envMap;

    this.scene.add(new THREE.HemisphereLight(0x9a8cff, 0x200a30, 1.2));
    const key = new THREE.DirectionalLight(0xffffff, 2.2);
    key.position.set(5, 10, 6);
    this.scene.add(key);

    // Floor: glossy dark with neon grid
    const floorMat = new THREE.MeshStandardMaterial({ color: 0x0a0812, metalness: 0.5, roughness: 0.45 });
    const floor = new THREE.Mesh(new THREE.CircleGeometry(40, 64), floorMat);
    floor.rotation.x = -Math.PI / 2;
    this.scene.add(floor);
    for (let r = 6; r < 40; r += 3) {
      const ring = new THREE.Mesh(new THREE.RingGeometry(r, r + 0.04, 96), new THREE.MeshBasicMaterial({ color: new THREE.Color(0x8a2cff).multiplyScalar(0.9 - r / 50), transparent: true, opacity: 0.6 }));
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.01;
      this.scene.add(ring);
    }

    // Back wall neon strips
    for (let i = 0; i < 7; i++) {
      const strip = new THREE.Mesh(new THREE.BoxGeometry(0.12, 9, 0.12), new THREE.MeshBasicMaterial({ color: new THREE.Color(i % 2 ? 0x00e5ff : 0xff2bd6).multiplyScalar(2.2) }));
      strip.position.set(-12 + i * 4, 4.5, -12);
      this.scene.add(strip);
    }
  }

  setup(garage, players) {
    this.clearModels();
    this.players = players;
    for (let p = 0; p < players; p++) {
      const plat = new THREE.Group();
      const disc = new THREE.Mesh(new THREE.CylinderGeometry(3.4, 3.6, 0.25, 48), new THREE.MeshStandardMaterial({ color: 0x14101e, metalness: 0.8, roughness: 0.3 }));
      disc.position.y = 0.12;
      const ring = new THREE.Mesh(new THREE.TorusGeometry(3.5, 0.05, 8, 64), new THREE.MeshBasicMaterial({ color: new THREE.Color(CAR_COLORS[garage[p].color].hex).multiplyScalar(2.5) }));
      ring.rotation.x = Math.PI / 2;
      ring.position.y = 0.26;
      plat.add(disc, ring);
      plat.position.x = players > 1 ? (p === 0 ? -3.9 : 3.9) : 0;
      this.scene.add(plat);
      this.platforms.push({ plat, ring });
      this.models.push(null);
      this.refresh(p, garage[p]);
    }
    if (players > 1) {
      this.camera.position.set(0, 4.2, 14.5);
      this.camera.lookAt(0, 0.6, 0);
    } else {
      this.camera.position.set(0, 2.9, 8.4);
      this.camera.lookAt(0, 0.7, 0);
    }
  }

  refresh(p, g) {
    if (this.models[p]) {
      this.platforms[p].plat.remove(this.models[p].root);
      disposeCarModel(this.models[p]);
    }
    const color = CAR_COLORS[g.color].hex;
    const m = buildCarModel(CAR_TYPES[g.type].id, color, { beams: false });
    m.root.position.y = 0.25;
    if (m.shadow) m.shadow.visible = false;
    this.platforms[p].plat.add(m.root);
    this.platforms[p].ring.material.color.setHex(color).multiplyScalar(2.5);
    this.models[p] = m;
    this.pop = 0.25;
  }

  update(dt) {
    this.time += dt;
    this.pop = Math.max(0, (this.pop || 0) - dt);
    this.platforms.forEach(({ plat }, i) => {
      plat.rotation.y = this.time * 0.45 + i * Math.PI;
      const m = this.models[i];
      if (m) {
        m.wheels.forEach((w) => { w.spin.rotation.x += dt * 2; });
        m.root.position.y = 0.25 + this.pop * 1.2;
      }
    });
  }

  clearModels() {
    this.platforms.forEach(({ plat }, i) => {
      if (this.models[i]) { plat.remove(this.models[i].root); disposeCarModel(this.models[i]); }
      this.scene.remove(plat);
      disposeTree(plat);
    });
    this.platforms = [];
    this.models = [];
  }
}
