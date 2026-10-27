import { audioManager as A } from './AudioManager.js';
import { sfx } from './sfx.js';
import { Music } from './music.js';
import { eventBus, Events } from '../core/EventBus.js';

/**
 * v5.1 engine voice: a smooth "light-engine" hum instead of the old buzzy saw/square stack — a warm triangle
 * fundamental, a soft sine sub-octave and a quiet fifth, gently detuned (chorus) through a soft low-pass with
 * no resonance, a slow shimmer, and a breath of air noise at speed. Gear changes stay audible as smooth sweeps.
 * Electric cars sing a little higher and cleaner. Tyre and boost layers are softer too.
 */
class EngineVoice {
  constructor(pan) {
    const ctx = A.ctx;
    this.o1 = ctx.createOscillator(); this.o1.type = 'triangle';
    this.o2 = ctx.createOscillator(); this.o2.type = 'sine';
    this.o3 = ctx.createOscillator(); this.o3.type = 'sine';
    this.o4 = ctx.createOscillator(); this.o4.type = 'triangle'; this.o4.detune.value = 9; // chorus partner of o1
    this.f = ctx.createBiquadFilter(); this.f.type = 'lowpass'; this.f.Q.value = 0.5;
    this.g = ctx.createGain(); this.g.gain.value = 0;
    this.p = ctx.createStereoPanner(); this.p.pan.value = pan;
    const g1 = ctx.createGain(); g1.gain.value = 0.55;
    const g2 = ctx.createGain(); g2.gain.value = 0.7;
    const g3 = ctx.createGain(); g3.gain.value = 0.12;
    const g4 = ctx.createGain(); g4.gain.value = 0.4;
    this.o1.connect(g1).connect(this.f); this.o2.connect(g2).connect(this.f);
    this.o3.connect(g3).connect(this.f); this.o4.connect(g4).connect(this.f);
    // slow shimmer: a gentle tremolo that keeps the tone alive
    this.trem = ctx.createGain(); this.trem.gain.value = 1;
    this.lfo = ctx.createOscillator(); this.lfo.frequency.value = 5.5;
    this.lfoG = ctx.createGain(); this.lfoG.gain.value = 0.06;
    this.lfo.connect(this.lfoG).connect(this.trem.gain);
    this.f.connect(this.trem).connect(this.g).connect(this.p).connect(A.engine);
    // air rushing past at speed
    this.a = ctx.createBufferSource(); this.a.buffer = A.noise; this.a.loop = true;
    this.af = ctx.createBiquadFilter(); this.af.type = 'lowpass'; this.af.frequency.value = 700; this.af.Q.value = 0.3;
    this.ag = ctx.createGain(); this.ag.gain.value = 0;
    this.a.connect(this.af).connect(this.ag).connect(this.p);
    // tyre screech (softer, less piercing)
    this.n = ctx.createBufferSource(); this.n.buffer = A.noise; this.n.loop = true;
    this.nb = ctx.createBiquadFilter(); this.nb.type = 'bandpass'; this.nb.frequency.value = 1200; this.nb.Q.value = 2.2;
    this.ng = ctx.createGain(); this.ng.gain.value = 0;
    this.n.connect(this.nb).connect(this.ng).connect(this.p);
    // boost whoosh
    this.b = ctx.createBufferSource(); this.b.buffer = A.noise; this.b.loop = true;
    this.bf = ctx.createBiquadFilter(); this.bf.type = 'bandpass'; this.bf.frequency.value = 600; this.bf.Q.value = 0.8;
    this.bg = ctx.createGain(); this.bg.gain.value = 0;
    this.b.connect(this.bf).connect(this.bg).connect(this.p);
    this.srcs = [this.o1, this.o2, this.o3, this.o4, this.lfo, this.a, this.n, this.b];
    for (const s of this.srcs) s.start();
  }

  update(car) {
    const ctx = A.ctx, t = ctx.currentTime;
    const ev = !!car.type.ev;
    const sr = Math.max(0, Math.min(1.25, Math.abs(car.speed) / car.topSpeed));
    const thr = car.controls.throttle > 0 ? 1 : 0;
    let base;
    if (ev) {
      base = 95 + sr * 330 + thr * 12; // one smooth rising tone, no gears
    } else {
      const gears = 5, gp = sr * gears;
      const gear = Math.min(gears - 1, Math.floor(gp));
      const rpm = 0.3 + (gp - gear) * 0.7 * (gear === 0 ? 1 : 0.8) + (thr && sr < 0.05 ? 0.2 : 0);
      base = 62 + rpm * 85 + gear * 9;
    }
    const k = 0.06;
    this.o1.frequency.setTargetAtTime(base, t, k);
    this.o4.frequency.setTargetAtTime(base, t, k);
    this.o2.frequency.setTargetAtTime(base * 0.5, t, k);
    this.o3.frequency.setTargetAtTime(base * 1.5, t, k);
    this.lfo.frequency.setTargetAtTime(4 + sr * 4, t, 0.2);
    this.f.frequency.setTargetAtTime((ev ? 700 : 420) + sr * (ev ? 1500 : 1100) + thr * 180, t, 0.08);
    const vol = car.eliminated ? 0 : (ev ? 0.27 : 0.34) + thr * 0.2 + (car.boosting ? 0.12 : 0);
    this.g.gain.setTargetAtTime(vol, t, 0.1);
    this.ag.gain.setTargetAtTime(car.eliminated || car.airborne ? 0 : Math.min(1, sr) * 0.05, t, 0.15);
    this.af.frequency.setTargetAtTime(500 + sr * 900, t, 0.2);
    const slide = !car.airborne && (car.drifting || Math.abs(car.lateralSpeed) > 6 || car.spinTime > 0) ? 0.11 : 0;
    this.ng.gain.setTargetAtTime(slide, t, 0.08);
    this.nb.frequency.setTargetAtTime(1050 + (car.driftLevel || 0) * 120, t, 0.1);
    this.bg.gain.setTargetAtTime(car.boosting ? 0.16 : 0, t, 0.12);
    this.bf.frequency.setTargetAtTime(car.boosting ? 1400 : 400, t, 0.25);
  }

  dispose() {
    const t = A.ctx.currentTime;
    for (const g of [this.g, this.ng, this.bg, this.ag]) g.gain.setTargetAtTime(0, t, 0.05);
    setTimeout(() => { for (const s of this.srcs) { try { s.stop(); } catch { /* */ } } this.p.disconnect(); }, 300);
  }
}

/** Wires EventBus → sounds. Only cars driven by humans make "close" sounds; others are attenuated. */
export class AudioBridge {
  constructor(gameState) {
    this.state = gameState;
    this.music = new Music();
    this.engines = new Map();
    this.listeners = []; // array of human cars (for panning/distance)
    A.muted = gameState.settings.muted;

    const panFor = (car) => {
      if (!car) return 0;
      if (car.human) return this.listeners.length > 1 ? (car.player === 0 ? -0.6 : 0.6) : 0;
      return 0;
    };
    const near = (car, r = 60) => {
      if (!car) return true;
      if (car.human) return true;
      return this.listeners.some((h) => (h.x - car.x) ** 2 + (h.z - car.z) ** 2 < r * r);
    };
    const on = (e, fn) => eventBus.on(e, (d) => { if (A.ready) fn(d); });

    on(Events.AUDIO_INIT, () => {});
    on(Events.UI_CLICK, () => sfx.click());
    on(Events.UI_HOVER, () => sfx.hover());
    on(Events.RACE_COUNTDOWN, ({ n }) => (n > 0 ? sfx.countBeep() : sfx.goBeep()));
    on(Events.CAR_BOOST, ({ car }) => car.human && sfx.boost(panFor(car)));
    on(Events.CAR_DRIFT_LEVEL, ({ car, level }) => car.human && sfx.driftLevel(level, panFor(car)));
    on(Events.CAR_WALL_HIT, ({ car, impact }) => near(car, 40) && sfx.wall(impact, panFor(car)));
    on(Events.CAR_CAR_HIT, ({ a, b }) => (near(a, 40) || near(b, 40)) && sfx.bump(panFor(a.human ? a : b)));
    on(Events.ITEM_PICKUP, ({ car }) => car.human && sfx.pickup(panFor(car)));
    on(Events.ITEM_USE, ({ car, item }) => {
      if (!near(car, 80)) return;
      const p = panFor(car);
      if (item === 'rocket') sfx.rocket(p);
      else if (item === 'oil') sfx.oil(p);
      else if (item === 'shield') sfx.shield(p);
      else if (item === 'emp') sfx.emp(p);
    });
    on(Events.CAMERA_SHAKE, ({ x, z }) => {
      if (x === undefined || this.listeners.some((h) => (h.x - x) ** 2 + (h.z - z) ** 2 < 90 * 90)) sfx.explosion();
    });
    on(Events.SHIELD_BLOCK, ({ car }) => near(car) && sfx.shieldBreak(panFor(car)));
    on(Events.CAR_SPINOUT, ({ car }) => near(car) && sfx.spin(panFor(car)));
    on(Events.CAR_JUMP, ({ car }) => car.human && sfx.jump(panFor(car)));
    on(Events.CAR_LAND, ({ car }) => car.human && sfx.land(panFor(car)));
    on(Events.CAR_LAP, ({ car, final }) => car.human && car.lap >= 2 && (final ? sfx.finalLap() : sfx.lap()));
    on(Events.CAR_FINISH, ({ car }) => car.human && (car.place <= 3 ? sfx.finish() : sfx.lose()));
    on(Events.CAR_ELIMINATED, () => sfx.eliminated());
    on(Events.CAR_OVERTAKE, ({ car }) => car.human && sfx.overtake(panFor(car)));
    on(Events.CAR_NEARMISS, ({ car }) => car.human && sfx.whoosh(panFor(car)));
    on(Events.FIREWORK, () => sfx.firework());
    on(Events.THUNDER, () => this.listeners.length && sfx.thunder());
    on(Events.CAR_BACKFIRE, ({ car }) => !car.type.ev && near(car, 30) && sfx.backfire(panFor(car)));
    on(Events.MUSIC_MENU, () => this.music.play('menu'));
    on(Events.MUSIC_RACE, () => this.music.play('race'));
    on(Events.MUSIC_STOP, () => this.music.stop());
    eventBus.on(Events.AUDIO_TOGGLE, () => {
      this.state.settings.muted = !this.state.settings.muted;
      A.setMuted(this.state.settings.muted);
      this.state.saveSettings();
    });
  }

  unlock() {
    const fresh = !A.ready;
    A.init();
    A.setMuted(this.state.settings.muted);
    return fresh;
  }

  setListeners(cars) {
    for (const e of this.engines.values()) e.dispose();
    this.engines.clear();
    this.listeners = cars;
    if (!A.ready) return;
    for (const car of cars) this.engines.set(car, new EngineVoice(cars.length > 1 ? (car.player === 0 ? -0.6 : 0.6) : 0));
  }

  update() {
    if (!A.ready) return;
    for (const [car, e] of this.engines) e.update(car);
  }
}
