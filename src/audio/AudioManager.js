import { AUDIO } from '../core/Constants.js';

/** Owns the AudioContext and mix buses. Created lazily on first user gesture. */
class AudioManager {
  constructor() {
    this.ctx = null;
    this.muted = false;
  }

  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return true; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : AUDIO.MASTER;
    const comp = this.ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 4;
    this.master.connect(comp).connect(this.ctx.destination);
    this.music = this.ctx.createGain();
    this.music.gain.value = AUDIO.MUSIC;
    this.music.connect(this.master);
    this.sfx = this.ctx.createGain();
    this.sfx.gain.value = AUDIO.SFX;
    this.sfx.connect(this.master);
    this.engine = this.ctx.createGain();
    this.engine.gain.value = AUDIO.ENGINE;
    this.engine.connect(this.master);
    // shared noise buffer
    const len = this.ctx.sampleRate * 2;
    this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return true;
  }

  get ready() { return !!this.ctx; }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.setTargetAtTime(m ? 0 : AUDIO.MASTER, this.ctx.currentTime, 0.05);
  }
}

export const audioManager = new AudioManager();
