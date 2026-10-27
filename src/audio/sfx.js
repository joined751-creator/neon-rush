import { audioManager as A } from './AudioManager.js';

function tone(freq, type, dur, gain = 0.3, { to = null, filter = 6000, delay = 0, pan = 0 } = {}) {
  if (!A.ready) return;
  const ctx = A.ctx, t = ctx.currentTime + delay;
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  const f = ctx.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.value = filter;
  const p = ctx.createStereoPanner();
  p.pan.value = pan;
  o.connect(f).connect(g).connect(p).connect(A.sfx);
  o.start(t);
  o.stop(t + dur + 0.02);
}

function noise(dur, gain = 0.2, { lp = 4000, hp = 0, delay = 0, pan = 0, sweep = null } = {}) {
  if (!A.ready) return;
  const ctx = A.ctx, t = ctx.currentTime + delay;
  const src = ctx.createBufferSource();
  src.buffer = A.noise;
  const g = ctx.createGain();
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  const l = ctx.createBiquadFilter();
  l.type = 'lowpass';
  l.frequency.setValueAtTime(lp, t);
  if (sweep) l.frequency.exponentialRampToValueAtTime(sweep, t + dur);
  let node = src.connect(l);
  if (hp) { const h = ctx.createBiquadFilter(); h.type = 'highpass'; h.frequency.value = hp; node = node.connect(h); }
  const p = ctx.createStereoPanner();
  p.pan.value = pan;
  node.connect(g).connect(p).connect(A.sfx);
  src.start(t, Math.random());
  src.stop(t + dur + 0.02);
}

export const sfx = {
  click: () => tone(880, 'triangle', 0.06, 0.18, { filter: 5000 }),
  hover: () => tone(1320, 'sine', 0.03, 0.06),
  countBeep: () => tone(440, 'square', 0.22, 0.22, { filter: 3000 }),
  goBeep: () => { tone(880, 'square', 0.5, 0.25, { filter: 4000 }); tone(1320, 'square', 0.5, 0.12, { filter: 4000 }); },
  boost: (pan = 0) => { noise(0.6, 0.35, { lp: 800, sweep: 6000, pan }); tone(220, 'sawtooth', 0.5, 0.12, { to: 880, filter: 2500, pan }); },
  driftLevel: (lvl, pan = 0) => tone([0, 660, 880, 1175][lvl] || 880, 'square', 0.12, 0.12, { filter: 4000, pan }),
  wall: (amt = 1, pan = 0) => { noise(0.18, Math.min(0.5, 0.15 + amt * 0.02), { lp: 1800, pan }); tone(70, 'square', 0.15, 0.2, { to: 40, filter: 600, pan }); },
  bump: (pan = 0) => { noise(0.12, 0.2, { lp: 900, pan }); tone(100, 'sine', 0.1, 0.18, { to: 60, pan }); },
  pickup: (pan = 0) => [523, 659, 784, 1047].forEach((f, i) => tone(f, 'square', 0.08, 0.12, { delay: i * 0.05, filter: 5000, pan })),
  rocket: (pan = 0) => noise(0.7, 0.3, { lp: 300, sweep: 3000, pan }),
  explosion: (pan = 0) => { noise(0.9, 0.55, { lp: 2500, sweep: 120, pan }); tone(80, 'sine', 0.6, 0.4, { to: 30, pan }); },
  oil: (pan = 0) => tone(300, 'sine', 0.3, 0.2, { to: 90, pan }),
  shield: (pan = 0) => { tone(440, 'sine', 0.4, 0.15, { to: 1760, pan }); tone(660, 'triangle', 0.4, 0.1, { to: 1320, pan }); },
  shieldBreak: (pan = 0) => { noise(0.3, 0.25, { hp: 2000, lp: 9000, pan }); tone(1760, 'triangle', 0.3, 0.12, { to: 440, pan }); },
  emp: (pan = 0) => { tone(1200, 'sawtooth', 0.5, 0.15, { to: 60, filter: 3000, pan }); noise(0.4, 0.2, { hp: 1500, pan }); },
  spin: (pan = 0) => tone(600, 'sawtooth', 0.6, 0.12, { to: 120, filter: 1500, pan }),
  lap: () => [784, 988, 1175].forEach((f, i) => tone(f, 'square', 0.14, 0.14, { delay: i * 0.08, filter: 5000 })),
  finalLap: () => [659, 784, 988, 1319].forEach((f, i) => tone(f, 'square', 0.16, 0.15, { delay: i * 0.09, filter: 6000 })),
  finish: () => [523, 659, 784, 1047, 1319, 1568].forEach((f, i) => tone(f, 'square', 0.25, 0.14, { delay: i * 0.1, filter: 6000 })),
  lose: () => [392, 330, 262, 196].forEach((f, i) => tone(f, 'triangle', 0.3, 0.16, { delay: i * 0.14 })),
  jump: (pan = 0) => tone(300, 'square', 0.25, 0.12, { to: 900, filter: 3000, pan }),
  land: (pan = 0) => noise(0.15, 0.25, { lp: 900, pan }),
  eliminated: () => { noise(1.2, 0.5, { lp: 3000, sweep: 100 }); tone(220, 'sawtooth', 1, 0.2, { to: 40, filter: 1200 }); },
  whoosh: (pan = 0) => noise(0.35, 0.18, { hp: 600, lp: 6000, pan }),
  firework: () => { noise(0.08, 0.25, { hp: 1500, lp: 8000 }); noise(1.0, 0.12, { lp: 1200, sweep: 200, delay: 0.05 }); },
  thunder: () => { noise(2.6, 0.45, { lp: 400, sweep: 60, delay: 0.4 }); noise(0.3, 0.3, { lp: 3000, sweep: 300 }); },
  // v5.1: a soft low 'puff' instead of a sharp square-wave crack
  backfire: (pan = 0) => { noise(0.08, 0.12, { lp: 650, pan }); tone(70, 'sine', 0.08, 0.14, { to: 45, pan }); },
  overtake: (pan = 0) => tone(988, 'triangle', 0.1, 0.08, { to: 1480, pan }),
};
