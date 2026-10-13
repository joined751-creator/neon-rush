import { KEYS } from '../core/Constants.js';

const BLOCK = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'Slash', 'Backspace', 'Tab']);

/**
 * Keyboard (two layouts), gamepads and touch → per-player analog controls.
 * Game logic only reads `state(p)` and edge-triggered `pressed(p, action)`.
 */
export class InputSystem {
  constructor() {
    this.keys = new Set();
    this.edges = new Set();
    this.touch = { steer: 0, gas: false, brake: false, drift: false, nitro: false, item: false };
    this.touchEnabled = false;
    this.padPrev = [{}, {}, {}, {}];
    this.padEdges = new Set();
    this.players = 1;
    this.anyKeyListeners = [];

    window.addEventListener('keydown', (e) => {
      if (BLOCK.has(e.code) && !(e.target instanceof HTMLInputElement)) e.preventDefault();
      if (!this.keys.has(e.code)) this.edges.add(e.code);
      this.keys.add(e.code);
      for (const fn of this.anyKeyListeners) fn(e);
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
  }

  onKey(fn) { this.anyKeyListeners.push(fn); }

  any(codes) { return codes.some((c) => this.keys.has(c)); }
  edge(codes) { return codes.some((c) => this.edges.has(c)); }

  gamepadFor(p) {
    const pads = (navigator.getGamepads ? [...navigator.getGamepads()] : []).filter(Boolean);
    if (this.players === 1) return pads[0] || null;
    return pads[p] || null;
  }

  /** Analog state for player p (0/1). */
  state(p) {
    const k = p === 0 ? KEYS.P1 : KEYS.P2;
    let steer = (this.any(k.right) ? 1 : 0) - (this.any(k.left) ? 1 : 0);
    let throttle = this.any(k.up) ? 1 : 0;
    let brake = this.any(k.down) ? 1 : 0;
    let drift = this.any(k.drift);
    let nitro = this.any(k.nitro);
    const pad = this.gamepadFor(p);
    if (pad) {
      const ax = pad.axes[0] || 0;
      if (Math.abs(ax) > 0.15) steer = ax;
      if (pad.buttons[14]?.pressed) steer = -1;
      if (pad.buttons[15]?.pressed) steer = 1;
      throttle = Math.max(throttle, pad.buttons[7]?.value || 0, pad.buttons[0]?.pressed ? 1 : 0);
      brake = Math.max(brake, pad.buttons[6]?.value || 0);
      drift = drift || !!pad.buttons[5]?.pressed || !!pad.buttons[4]?.pressed;
      nitro = nitro || !!pad.buttons[2]?.pressed;
    }
    if (p === 0 && this.touchEnabled) {
      if (this.touch.steer) steer = this.touch.steer;
      if (this.touch.gas) throttle = 1;
      if (this.touch.brake) { brake = 1; throttle = 0; }
      drift = drift || this.touch.drift;
      nitro = nitro || this.touch.nitro;
    }
    return { steer: Math.max(-1, Math.min(1, steer)), throttle, brake, drift, nitro };
  }

  /** Edge-triggered actions: item, camera, respawn. */
  pressed(p, action) {
    const k = p === 0 ? KEYS.P1 : KEYS.P2;
    if (this.edge(k[action])) return true;
    if (p === 0 && action === 'item' && this.touch.itemEdge) { this.touch.itemEdge = false; return true; }
    const map = { item: 1, camera: 3, respawn: 8 };
    return this.padEdges.has(`${p}:${map[action]}`);
  }

  pausePressed() {
    if (this.edge(['Escape', 'KeyP'])) return true;
    return this.padEdges.has('0:9') || this.padEdges.has('1:9');
  }

  /** Call once per frame before reading. */
  poll() {
    this.padEdges.clear();
    const pads = (navigator.getGamepads ? [...navigator.getGamepads()] : []).filter(Boolean);
    pads.forEach((pad, i) => {
      const p = this.players === 1 ? 0 : i;
      if (p > 1) return;
      const prev = this.padPrev[i] || {};
      pad.buttons.forEach((b, bi) => {
        if (b.pressed && !prev[bi]) this.padEdges.add(`${p}:${bi}`);
        prev[bi] = b.pressed;
      });
      this.padPrev[i] = prev;
    });
  }

  /** Clear edge flags at end of frame. */
  endFrame() { this.edges.clear(); }
}
