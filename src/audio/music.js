import { audioManager as A } from './AudioManager.js';
import { AUDIO } from '../core/Constants.js';

// Am – F – C – G  (MIDI roots) with chord tones
const CHORDS = [
  { root: 45, tones: [57, 60, 64, 69] },
  { root: 41, tones: [53, 57, 60, 65] },
  { root: 48, tones: [55, 60, 64, 67] },
  { root: 43, tones: [55, 59, 62, 67] },
];
const ARP = [0, 1, 2, 3, 2, 1, 2, 3, 0, 2, 1, 3, 2, 3, 1, 2];
const BASS = [1, 0, 1, 1, 0, 1, 1, 0, 1, 0, 1, 1, 0, 1, 1, 1];
const LEAD = [ // sparse melodic hook per bar (step -> semitone offset over chord top)
  { 0: 76, 3: 74, 6: 72, 10: 69 }, { 0: 72, 3: 74, 6: 76, 12: 77 },
  { 0: 79, 4: 76, 8: 74, 12: 72 }, { 0: 74, 6: 71, 10: 74, 14: 79 },
];
const mtof = (m) => 440 * 2 ** ((m - 69) / 12);

export class Music {
  constructor() {
    this.timer = null;
    this.mode = null;
    this.step = 0;
    this.nextTime = 0;
    this.intensity = 0;
  }

  ensureBus() {
    if (this.bus || !A.ready) return;
    const ctx = A.ctx;
    this.bus = ctx.createGain();
    this.bus.gain.value = 1;
    this.bus.connect(A.music);
    // feedback delay for arps
    this.delay = ctx.createDelay(1);
    this.delay.delayTime.value = (60 / AUDIO.BPM) * 0.75;
    this.fb = ctx.createGain();
    this.fb.gain.value = 0.35;
    const dl = ctx.createBiquadFilter();
    dl.type = 'lowpass'; dl.frequency.value = 2500;
    this.delay.connect(dl).connect(this.fb).connect(this.delay);
    this.delay.connect(this.bus);
  }

  play(mode) {
    if (!A.ready) return;
    this.ensureBus();
    if (this.mode === mode && this.timer) return;
    this.mode = mode;
    this.bus.gain.cancelScheduledValues(A.ctx.currentTime);
    this.bus.gain.setTargetAtTime(1, A.ctx.currentTime, 0.3);
    if (!this.timer) {
      this.step = 0;
      this.nextTime = A.ctx.currentTime + 0.1;
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
    const stepDur = 60 / AUDIO.BPM / 4;
    while (this.nextTime < ctx.currentTime + 0.15) {
      this.playStep(this.step, this.nextTime, stepDur);
      this.nextTime += stepDur;
      this.step = (this.step + 1) % 64;
    }
  }

  playStep(step, t, sd) {
    const bar = Math.floor(step / 16) % 4;
    const s = step % 16;
    const ch = CHORDS[bar];
    const race = this.mode === 'race';
    const results = this.mode === 'results';

    if (s === 0) this.pad(ch.tones, t, sd * 16);
    if (BASS[s]) this.bass(mtof(ch.root - 12 + (s % 4 === 2 ? 12 : 0)), t, sd * 0.9, race ? 0.32 : 0.2);
    this.arp(mtof(ch.tones[ARP[s]] + 12), t, sd * 0.8, race ? 0.05 : 0.04);
    if (race || results) {
      if (s % 4 === 0) this.kick(t);
      if (s === 4 || s === 12) this.snare(t);
      if (s % 2 === 1) this.hat(t, s % 4 === 3 ? 0.07 : 0.035);
      const lead = LEAD[bar][s];
      if (lead && step >= 0) this.lead(mtof(lead), t, sd * 3.2);
    } else if (s === 0 && bar % 2 === 0) {
      this.kick(t, 0.25);
    }
  }

  voice(type, freq, t, dur, gain, cutoff, dest = this.bus, detune = 0) {
    const ctx = A.ctx;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    o.detune.value = detune;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(cutoff, t);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(f).connect(g).connect(dest);
    o.start(t);
    o.stop(t + dur + 0.05);
    return { f, g };
  }

  pad(tones, t, dur) {
    for (const m of tones.slice(0, 3)) {
      for (const det of [-9, 9]) {
        const ctx = A.ctx;
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = mtof(m);
        o.detune.value = det;
        const f = ctx.createBiquadFilter();
        f.type = 'lowpass';
        f.frequency.value = 900;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.linearRampToValueAtTime(0.022, t + dur * 0.3);
        g.gain.linearRampToValueAtTime(0.0001, t + dur);
        o.connect(f).connect(g).connect(this.bus);
        o.start(t);
        o.stop(t + dur + 0.05);
      }
    }
  }

  bass(freq, t, dur, gain) {
    const v = this.voice('sawtooth', freq, t, dur, gain, 1400);
    v.f.frequency.exponentialRampToValueAtTime(220, t + dur);
  }

  arp(freq, t, dur, gain) {
    const v = this.voice('square', freq, t, dur, gain, 3200);
    v.g.connect(this.delay);
  }

  lead(freq, t, dur) {
    const v = this.voice('sawtooth', freq, t, dur, 0.06, 2600, this.bus, 6);
    this.voice('sawtooth', freq, t, dur, 0.04, 2600, this.bus, -6);
    v.g.connect(this.delay);
  }

  kick(t, gain = 0.6) {
    const ctx = A.ctx;
    const o = ctx.createOscillator();
    o.frequency.setValueAtTime(150, t);
    o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
    o.connect(g).connect(this.bus);
    o.start(t); o.stop(t + 0.32);
  }

  snare(t) {
    const ctx = A.ctx;
    const src = ctx.createBufferSource();
    src.buffer = A.noise;
    const h = ctx.createBiquadFilter();
    h.type = 'highpass'; h.frequency.value = 1200;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.28, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
    src.connect(h).connect(g).connect(this.bus);
    src.connect(h).connect(g).connect(this.delay);
    src.start(t, Math.random()); src.stop(t + 0.22);
  }

  hat(t, gain) {
    const ctx = A.ctx;
    const src = ctx.createBufferSource();
    src.buffer = A.noise;
    const h = ctx.createBiquadFilter();
    h.type = 'highpass'; h.frequency.value = 7000;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
    src.connect(h).connect(g).connect(this.bus);
    src.start(t, Math.random()); src.stop(t + 0.06);
  }
}
