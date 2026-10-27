import { audioManager as A } from './AudioManager.js';

/*
 * v4.5 soundtrack: an original dark electronic-orchestral score in the spirit of sci-fi racing films —
 * pumping 16th-note bass ostinato, huge low "brass" swells, string pads in a big hall, gated arps,
 * four-on-the-floor drums with a side-chain pump, risers into each drop and a gliding mono-synth lead.
 * Everything is synthesised live with WebAudio (no samples), arranged in 8-bar sections:
 *   race:  build → drop → drop II → breakdown → build …
 *   menu:  atmosphere (strings + slow pulse) → glow (arp joins) → …
 * Key: D minor. All melodies and progressions are written for NEON RUSH.
 */

const BPM = 124;
const SD = 60 / BPM / 4; // one 16th
const BAR = 16, SEC = 8 * BAR;
const mtof = (m) => 440 * 2 ** ((m - 69) / 12);

// progressions: bass root + chord tones (mid register)
const PA = [ // Dm – B♭ – Gm – A
  { root: 38, tones: [62, 65, 69] }, { root: 34, tones: [62, 65, 70] },
  { root: 31, tones: [62, 67, 70] }, { root: 33, tones: [61, 64, 69] },
];
const PB = [ // Dm – F – C – A
  { root: 38, tones: [62, 65, 69] }, { root: 41, tones: [60, 65, 69] },
  { root: 36, tones: [60, 64, 67] }, { root: 33, tones: [61, 64, 69] },
];
// 8-bar lead (step: [midi, length in 16ths]) — bars 1–4 over PA, 5–8 over PB
const LEAD = [
  { 0: [69, 6], 6: [74, 4], 10: [72, 2], 12: [69, 4] },
  { 0: [65, 8], 8: [67, 4], 12: [69, 4] },
  { 0: [70, 6], 6: [69, 2], 8: [67, 4], 12: [74, 4] },
  { 0: [73, 12], 12: [76, 4] },
  { 0: [77, 6], 6: [76, 2], 8: [74, 4], 12: [69, 4] },
  { 0: [72, 8], 8: [69, 4], 12: [65, 4] },
  { 0: [76, 6], 6: [74, 2], 8: [72, 4], 12: [67, 4] },
  { 0: [69, 8], 8: [73, 4], 12: [76, 4] },
];
// pulse bass: 1 = root, 2 = octave up, 0 = rest (accent on beats)
const PULSE = [1, 1, 2, 1, 1, 1, 2, 1, 1, 1, 2, 1, 1, 2, 1, 2];
const ARP = [0, 1, 2, 3, 4, 5, 4, 3, 1, 2, 3, 4, 5, 4, 2, 1];
const RACE = ['build', 'drop', 'drop2', 'break'];
const MENU = ['atmo', 'glow'];

export class Music {
  constructor() {
    this.timer = null;
    this.mode = null;
    this.step = 0;
    this.nextTime = 0;
  }

  ensureBus() {
    if (this.bus || !A.ready) return;
    const ctx = A.ctx;
    this.bus = ctx.createGain();
    this.bus.connect(A.music);
    // synths go through a side-chain "pump" that ducks on every kick
    this.pump = ctx.createGain();
    this.pump.connect(this.bus);
    // big hall: generated stereo impulse response
    this.verb = ctx.createConvolver();
    this.verb.buffer = this.impulse(2.8, 2.4);
    this.verbIn = ctx.createGain();
    this.verbIn.gain.value = 0.9;
    const vf = ctx.createBiquadFilter();
    vf.type = 'highpass'; vf.frequency.value = 180;
    this.verbIn.connect(vf).connect(this.verb).connect(this.bus);
    // dotted-8th echo
    this.delay = ctx.createDelay(1);
    this.delay.delayTime.value = SD * 3;
    const fb = ctx.createGain();
    fb.gain.value = 0.38;
    const dl = ctx.createBiquadFilter();
    dl.type = 'lowpass'; dl.frequency.value = 2800;
    this.delay.connect(dl).connect(fb).connect(this.delay);
    dl.connect(this.pump);
    dl.connect(this.verbIn);
  }

  impulse(sec, decay) {
    const ctx = A.ctx;
    const n = Math.floor(ctx.sampleRate * sec);
    const buf = ctx.createBuffer(2, n, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n) ** decay;
    }
    return buf;
  }

  play(mode) {
    if (!A.ready) return;
    this.ensureBus();
    if (this.mode === mode && this.timer) return;
    const changed = this.mode !== mode;
    this.mode = mode;
    const now = A.ctx.currentTime;
    this.bus.gain.cancelScheduledValues(now);
    this.bus.gain.setTargetAtTime(mode === 'menu' ? 1.3 : 1.0, now, 0.3); // v4.5.1: louder — the score sits clearly above the engines
    if (changed) { this.step = 0; this.nextTime = now + 0.12; }
    if (!this.timer) {
      if (!changed) this.nextTime = now + 0.12;
      this.timer = setInterval(() => this.schedule(), 25);
    }
  }

  stop() {
    if (!this.timer) return;
    this.bus.gain.setTargetAtTime(0, A.ctx.currentTime, 0.25);
    const t = this.timer;
    setTimeout(() => { if (this.timer === t) { clearInterval(t); this.timer = null; this.mode = null; } }, 900);
  }

  schedule() {
    const ctx = A.ctx;
    if (this.nextTime < ctx.currentTime - 0.2) this.nextTime = ctx.currentTime + 0.05; // tab was asleep: don't burst
    while (this.nextTime < ctx.currentTime + 0.2) {
      this.playStep(this.step, this.nextTime);
      this.nextTime += SD;
      this.step++;
    }
  }

  // ---------------------------------------------------------------- arrangement
  playStep(step, t) {
    const race = this.mode !== 'menu';
    const list = race ? RACE : MENU;
    const part = list[Math.floor(step / SEC) % list.length];
    const inSec = step % SEC;
    const barN = Math.floor(inSec / BAR); // 0..7
    const s = step % BAR;
    const prog = barN < 4 ? PA : (part === 'build' || part === 'atmo' ? PA : PB);
    const ch = prog[barN % 4];
    const k = inSec / SEC; // 0..1 through the section

    if (race) this.raceStep(part, barN, s, ch, t, k);
    else this.menuStep(part, barN, s, ch, t, k);
  }

  raceStep(part, barN, s, ch, t, k) {
    const drop = part === 'drop' || part === 'drop2';
    // section downbeats: impacts and brass swells
    if (barN === 0 && s === 0) {
      if (drop) { this.crash(t); this.braam(t, ch.root, 1); }
      if (part === 'build') this.braam(t, ch.root, 0.6);
      if (part === 'break') this.crash(t, 0.5);
    }
    if (s === 0) {
      this.sub(ch.root, t, BAR * SD, part === 'break' ? 0.12 : 0.2);
      if (part === 'break' || part === 'build') this.strings(ch.tones, t, BAR * SD, part === 'break' ? 0.05 : 0.035);
      if (drop) this.pad(ch.tones, t, BAR * SD, 0.022);
      if (drop && barN === 4) this.braam(t, ch.root, 0.7);
    }
    // pulse bass ostinato (filter opens through the build)
    const cut = part === 'build' ? 350 + 2400 * k * k : part === 'break' ? 520 : 2600;
    if (part !== 'break' || s % 2 === 0) {
      const p = PULSE[s];
      if (p) this.pulse(ch.root + (p === 2 ? 12 : 0), t, s % 4 === 0 ? 0.24 : 0.17, cut);
    }
    // arp
    if (part === 'build' && barN >= 2 || drop || part === 'break' && barN >= 4) {
      const tones = [...ch.tones.map((m) => m + 12), ...ch.tones.map((m) => m + 24)];
      this.arp(mtof(tones[ARP[s]]), t, part === 'break' ? 0.022 : 0.034, part === 'drop2' ? 5200 : 3400);
    }
    // gated chord stabs on the off-beats in the second drop
    if (part === 'drop2' && (s === 2 || s === 6 || s === 10 || s === 14 || s === 15)) this.stab(ch.tones, t);
    // lead melody
    if (drop) {
      const n = LEAD[barN][s];
      if (n) this.lead(n[0] + (part === 'drop2' && barN >= 4 ? 12 : 0), t, n[1] * SD);
    }
    // drums
    if (drop) {
      if (s % 4 === 0) this.kick(t, 0.75);
      if (s === 4 || s === 12) this.clap(t, 0.32);
      if (s % 4 === 2) this.hat(t, 0.075, 0.16);
      else this.hat(t, s % 2 ? 0.03 : 0.02, 0.04);
      if (barN === 7 && s >= 12) this.snare(t, 0.12 + (s - 12) * 0.05);
    } else if (part === 'build') {
      if (barN < 6 && s % 4 === 0) this.kick(t, 0.55);
      if (barN >= 2 && s % 2 === 1) this.hat(t, 0.025, 0.04);
      if (barN === 4 || barN === 5) { if (s % 4 === 0) this.snare(t, 0.12); }
      if (barN === 6) { if (s % 2 === 0) this.snare(t, 0.1 + s * 0.006); }
      if (barN === 7) this.snare(t, 0.12 + s * 0.012);
      if (barN === 6 && s === 0) this.riser(t, 2 * BAR * SD);
    } else if (part === 'break') {
      if (s === 0 && barN % 2 === 0) this.kick(t, 0.4);
      if (barN >= 6 && s % 4 === 0) this.kick(t, 0.5);
    }
  }

  menuStep(part, barN, s, ch, t, k) {
    if (s === 0) {
      this.strings(ch.tones, t, BAR * SD, 0.045);
      this.sub(ch.root, t, BAR * SD, 0.1);
      if (barN === 0) this.braam(t, ch.root, 0.45);
    }
    if (s % 2 === 0) this.pulse(ch.root + (s % 8 === 4 ? 12 : 0), t, 0.11, part === 'atmo' ? 420 + 300 * k : 900);
    if (part === 'glow') {
      const tones = [...ch.tones.map((m) => m + 12), ...ch.tones.map((m) => m + 24)];
      this.arp(mtof(tones[ARP[s]]), t, 0.02, 2600);
    }
    if (s === 0) this.kick(t, 0.3);
    if (part === 'glow' && s === 8) this.kick(t, 0.22);
  }

  // ---------------------------------------------------------------- instruments
  osc(type, freq, t, dur, { gain, cutoff, q = 0.7, detune = 0, attack = 0.005, release = null, dest = this.pump, verb = 0, echo = 0 }) {
    const ctx = A.ctx;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    o.detune.value = detune;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(cutoff, t);
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(gain, t + attack);
    if (release == null) g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    else { g.gain.setValueAtTime(gain, t + Math.max(attack, dur - release)); g.gain.linearRampToValueAtTime(0.0001, t + dur); }
    o.connect(f).connect(g).connect(dest);
    if (verb) { const v = ctx.createGain(); v.gain.value = verb; g.connect(v).connect(this.verbIn); }
    if (echo) { const e = ctx.createGain(); e.gain.value = echo; g.connect(e).connect(this.delay); }
    o.start(t);
    o.stop(t + dur + 0.05);
    return { o, f, g };
  }

  /** The signature driving bass: short sawtooth plucks with a snappy filter envelope. */
  pulse(m, t, gain, cutoff) {
    const v = this.osc('sawtooth', mtof(m), t, SD * 0.95, { gain, cutoff: cutoff * 2.2, q: 4 });
    v.f.frequency.exponentialRampToValueAtTime(Math.max(120, cutoff * 0.35), t + SD * 0.9);
    this.osc('square', mtof(m), t, SD * 0.9, { gain: gain * 0.35, cutoff: cutoff, detune: 7 });
  }

  sub(root, t, dur, gain) {
    this.osc('sine', mtof(root - 12), t, dur, { gain, cutoff: 400, attack: 0.02, release: 0.08, dest: this.pump });
  }

  /** Huge low brass swell: stacked detuned saws, filter blooms open then closes, drenched in the hall. */
  braam(t, root, amt) {
    const dur = 2 * BAR * SD;
    for (const [m, det] of [[root - 12, -8], [root - 12, 8], [root - 5, 0], [root, -5], [root, 5]]) {
      const v = this.osc('sawtooth', mtof(m), t, dur, { gain: 0.05 * amt, cutoff: 150, q: 2, attack: 0.25, release: dur * 0.6, dest: this.bus, verb: 0.6, detune: det });
      v.f.frequency.exponentialRampToValueAtTime(1600 * amt + 200, t + 0.5);
      v.f.frequency.exponentialRampToValueAtTime(260, t + dur);
    }
  }

  /** Orchestral string section: slow bow attack, vibrato, warm filter, long hall. */
  strings(tones, t, dur, gain) {
    const ctx = A.ctx;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 5.2;
    const depth = ctx.createGain();
    depth.gain.value = 9;
    lfo.connect(depth);
    for (const m of [tones[0] - 12, ...tones]) {
      for (const det of [-11, 11]) {
        const v = this.osc('sawtooth', mtof(m), t, dur + 0.4, { gain, cutoff: 1500, attack: dur * 0.35, release: dur * 0.4, verb: 0.9, detune: det });
        depth.connect(v.o.detune);
      }
    }
    lfo.start(t); lfo.stop(t + dur + 0.5);
  }

  pad(tones, t, dur, gain) {
    for (const m of tones) {
      for (const det of [-14, 0, 14]) this.osc('sawtooth', mtof(m), t, dur, { gain, cutoff: 1100, attack: 0.08, release: 0.3, verb: 0.5, detune: det });
    }
  }

  stab(tones, t) {
    for (const m of tones) this.osc('sawtooth', mtof(m + 12), t, SD * 0.8, { gain: 0.03, cutoff: 3000, q: 2, detune: m % 2 ? 9 : -9, verb: 0.35, echo: 0.25 });
  }

  arp(freq, t, gain, cutoff) {
    this.osc('square', freq, t, SD * 0.85, { gain, cutoff, q: 3, echo: 0.6, verb: 0.2 });
  }

  /** Mono lead: two detuned saws gliding into each note, with vibrato that fades in on long notes. */
  lead(m, t, dur) {
    const ctx = A.ctx;
    const f = mtof(m);
    const prev = this.lastLead ? mtof(this.lastLead) : f;
    this.lastLead = m;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 5.5;
    const depth = ctx.createGain();
    depth.gain.setValueAtTime(0, t);
    depth.gain.linearRampToValueAtTime(dur > SD * 4 ? 14 : 4, t + dur * 0.7);
    lfo.connect(depth);
    for (const det of [-7, 7]) {
      const v = this.osc('sawtooth', prev, t, dur, { gain: 0.05, cutoff: 3200, q: 1.5, attack: 0.02, release: Math.min(0.25, dur * 0.4), detune: det, echo: 0.35, verb: 0.45 });
      v.o.frequency.exponentialRampToValueAtTime(f, t + 0.06);
      v.f.frequency.setValueAtTime(5200, t);
      v.f.frequency.exponentialRampToValueAtTime(2200, t + dur);
      depth.connect(v.o.detune);
    }
    lfo.start(t); lfo.stop(t + dur + 0.1);
  }

  // ---------------------------------------------------------------- drums
  duck(t) {
    const g = this.pump.gain;
    g.cancelScheduledValues(t);
    g.setValueAtTime(0.32, t);
    g.linearRampToValueAtTime(1, t + SD * 2.6);
  }

  kick(t, gain = 0.7) {
    const ctx = A.ctx;
    const o = ctx.createOscillator();
    o.frequency.setValueAtTime(170, t);
    o.frequency.exponentialRampToValueAtTime(46, t + 0.09);
    o.frequency.exponentialRampToValueAtTime(38, t + 0.35);
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.42);
    o.connect(g).connect(this.bus);
    o.start(t); o.stop(t + 0.45);
    this.noiseHit(t, 0.012, 4000, 'highpass', gain * 0.25); // beater click
    this.duck(t);
  }

  noiseHit(t, dur, freq, type, gain, { q = 0.8, verb = 0, dest = this.bus } = {}) {
    const ctx = A.ctx;
    const src = ctx.createBufferSource();
    src.buffer = A.noise;
    const f = ctx.createBiquadFilter();
    f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(dest);
    if (verb) { const v = ctx.createGain(); v.gain.value = verb; g.connect(v).connect(this.verbIn); }
    src.start(t, Math.random() * 1.5); src.stop(t + dur + 0.02);
    return { f, g };
  }

  clap(t, gain) {
    for (const d of [0, 0.011, 0.022]) this.noiseHit(t + d, d === 0.022 ? 0.22 : 0.03, 1500, 'bandpass', gain, { q: 1.2, verb: 0.5 });
  }

  snare(t, gain) {
    this.noiseHit(t, 0.14, 1800, 'highpass', gain, { verb: 0.3 });
    this.osc('triangle', 190, t, 0.08, { gain: gain * 0.6, cutoff: 2000, dest: this.bus });
  }

  hat(t, gain, dur) {
    this.noiseHit(t, dur, 8000, 'highpass', gain);
  }

  crash(t, amt = 1) {
    this.noiseHit(t, 2.2, 5000, 'highpass', 0.12 * amt, { verb: 0.8 });
    this.kick(t, 0.8 * amt);
  }

  /** Rising filtered noise sweep into a drop. */
  riser(t, dur) {
    const ctx = A.ctx;
    const src = ctx.createBufferSource();
    src.buffer = A.noise;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass'; f.Q.value = 3;
    f.frequency.setValueAtTime(300, t);
    f.frequency.exponentialRampToValueAtTime(7000, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.12, t + dur * 0.97);
    g.gain.linearRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(this.bus);
    const v = ctx.createGain(); v.gain.value = 0.5; g.connect(v).connect(this.verbIn);
    src.start(t); src.stop(t + dur + 0.05);
  }
}
