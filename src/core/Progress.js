import { CAR_TYPES, CAR_COLORS } from './Constants.js';
import { eventBus, Events } from './EventBus.js';
import { TRACKS } from '../level/TrackDefs.js';

/*
 * Career progression: neon credits (₵) earned in races, cars / colours to unlock, per-car tuning
 * and three daily missions. Everything is stored locally (localStorage) — no account needed.
 */

export const CURRENCY = '₵';
export const START_CREDITS = 600;
export const CAR_PRICE = { comet: 0, spark: 0, titan: 900, viper: 1500 };
export const COLOR_PRICE = 200; // colours 0..3 are free
export const FREE_COLORS = 4;
export const UPGRADES = [
  { id: 'eng', name: 'Двигатель', short: 'макс. скорость', step: 0.03, unit: '%' },
  { id: 'acc', name: 'Турбина', short: 'разгон', step: 0.08, unit: '%' },
  { id: 'nit', name: 'Нитро-бак', short: 'нитро на старте', step: 20, unit: '' },
];
export const UPGRADE_COST = [300, 600, 1000];
export const MAX_LEVEL = UPGRADE_COST.length;

const PLACE_REWARD = [400, 300, 220, 160, 120, 90, 70, 50];
const DIFF_MULT = [0.75, 1, 1.35];
const BONUS = { drift: 10, superDrift: 25, ultraDrift: 45, nearMiss: 15, overtake: 5, perfect: 50, jump: 10, hit: 20, bestLap: 60, cleanRace: 80 };
const ALL_DAILY_BONUS = 300;

// mission templates: kind decides how progress is counted
const MISSIONS = [
  { id: 'win', kind: 'finish', text: () => 'Выиграй гонку', target: 1, reward: 250 },
  { id: 'podium', kind: 'finish', text: (m) => `Финишируй в тройке на трассе «${TRACKS[m.track].name}»`, target: 1, reward: 220, track: true },
  { id: 'drifts', kind: 'count', text: (m) => `Сделай ${m.target} дрифтов`, target: 8, reward: 150 },
  { id: 'superDrifts', kind: 'count', text: (m) => `Сделай ${m.target} супер-дрифта`, target: 3, reward: 200 },
  { id: 'nearMiss', kind: 'count', text: (m) => `Обгони вплотную ${m.target} раз`, target: 5, reward: 170 },
  { id: 'overtakes', kind: 'count', text: (m) => `Соверши ${m.target} обгонов`, target: 15, reward: 150 },
  { id: 'perfect', kind: 'count', text: (m) => `Сделай идеальный старт ${m.target} раза`, target: 2, reward: 160 },
  { id: 'jumps', kind: 'count', text: (m) => `Соверши ${m.target} прыжков с трамплина`, target: 4, reward: 150 },
  { id: 'hits', kind: 'count', text: (m) => `Попади бонусом в соперника ${m.target} раза`, target: 3, reward: 170 },
  { id: 'clean', kind: 'finish', text: () => 'Пройди гонку без ударов о стены', target: 1, reward: 250 },
  { id: 'races', kind: 'finish', text: (m) => `Проведи ${m.target} гонки до финиша`, target: 3, reward: 150 },
];

function loadJSON(key, fallback) {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch { return fallback; }
}
function saveJSON(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage unavailable */ }
}
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
function rngFor(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return () => { h = (h + 0x6D2B79F5) >>> 0; let t = h; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

export class Progress {
  constructor(gameState) {
    this.gs = gameState;
    const fresh = { credits: START_CREDITS, cars: ['comet', 'spark'], colors: [0, 1, 2, 3], upg: {}, daily: null, stats: { races: 0, wins: 0, earned: 0 } };
    this.data = Object.assign(fresh, loadJSON('neonrush.progress', {}));
    this.ensureDaily();
    this.fixGarage();
    this.session = null;
    this.listen();
  }

  save() { saveJSON('neonrush.progress', this.data); }
  get credits() { return this.data.credits; }

  // ---------------------------------------------------------------- unlocks
  carOwned(typeIndex) { return this.data.cars.includes(CAR_TYPES[typeIndex].id); }
  carPrice(typeIndex) { return CAR_PRICE[CAR_TYPES[typeIndex].id] || 0; }
  colorOwned(c) { return c < FREE_COLORS || this.data.colors.includes(c); }
  selectionOk(p) { const g = this.gs.garage[p]; return this.carOwned(g.type) && this.colorOwned(g.color); }
  canStart() {
    for (let p = 0; p < this.gs.settings.players; p++) if (!this.selectionOk(p)) return false;
    return true;
  }

  spend(n) {
    if (this.data.credits < n) return false;
    this.data.credits -= n;
    this.save();
    eventBus.emit(Events.UI_CLICK);
    return true;
  }
  buyCar(typeIndex) {
    if (this.carOwned(typeIndex) || !this.spend(this.carPrice(typeIndex))) return false;
    this.data.cars.push(CAR_TYPES[typeIndex].id); this.save(); return true;
  }
  buyColor(c) {
    if (this.colorOwned(c) || !this.spend(COLOR_PRICE)) return false;
    this.data.colors.push(c); this.save(); return true;
  }

  level(typeIndex, upId) { return this.data.upg[CAR_TYPES[typeIndex].id]?.[upId] || 0; }
  upgradeCost(typeIndex, upId) { const l = this.level(typeIndex, upId); return l >= MAX_LEVEL ? null : UPGRADE_COST[l]; }
  buyUpgrade(typeIndex, upId) {
    const cost = this.upgradeCost(typeIndex, upId);
    if (cost == null || !this.carOwned(typeIndex) || !this.spend(cost)) return false;
    const id = CAR_TYPES[typeIndex].id;
    (this.data.upg[id] ||= {})[upId] = this.level(typeIndex, upId) + 1;
    this.save();
    return true;
  }

  /** Saved selections that are no longer owned (first launch of this version) fall back to free ones. */
  fixGarage() {
    const free = CAR_TYPES.map((t, i) => i).filter((i) => this.carOwned(i));
    this.gs.garage.forEach((g, p) => {
      if (!this.carOwned(g.type)) g.type = free[p % free.length];
      if (!this.colorOwned(g.color)) g.color = p % FREE_COLORS;
    });
    if (this.gs.garage[1] && this.gs.garage[1].color === this.gs.garage[0].color) this.gs.garage[1].color = (this.gs.garage[0].color + 1) % FREE_COLORS;
    this.gs.saveSettings();
  }

  /** Tuning on the players' cars (bots keep their difficulty settings). */
  applyToRace(race) {
    race.humans.forEach((car) => {
      const t = car.typeIndex;
      car.topMult = 1 + UPGRADES[0].step * this.level(t, 'eng');
      car.accelMult = 1 + UPGRADES[1].step * this.level(t, 'acc');
      car.nitro = Math.min(100, car.nitro + UPGRADES[2].step * this.level(t, 'nit'));
    });
  }

  // ---------------------------------------------------------------- daily missions
  ensureDaily() {
    const d = today();
    if (this.data.daily?.date === d) return;
    const rnd = rngFor('neon' + d);
    const pool = MISSIONS.slice();
    const list = [];
    while (list.length < 3 && pool.length) {
      const m = pool.splice(Math.floor(rnd() * pool.length), 1)[0];
      const e = { id: m.id, target: m.target, reward: m.reward, prog: 0, done: false };
      if (m.track) e.track = Math.floor(rnd() * TRACKS.length);
      list.push(e);
    }
    this.data.daily = { date: d, list, bonus: false };
    this.save();
  }
  missions() {
    this.ensureDaily();
    return this.data.daily.list.map((e) => ({ ...e, text: MISSIONS.find((m) => m.id === e.id).text(e) }));
  }
  bump(id, n = 1) {
    this.ensureDaily();
    const e = this.data.daily.list.find((x) => x.id === id && !x.done);
    if (!e) return;
    e.prog = Math.min(e.target, e.prog + n);
    if (e.prog >= e.target) this.complete(e);
    this.save();
  }
  complete(e) {
    e.done = true;
    let gain = e.reward;
    const text = MISSIONS.find((m) => m.id === e.id).text(e);
    const all = this.data.daily.list.every((x) => x.done);
    if (all && !this.data.daily.bonus) { this.data.daily.bonus = true; gain += ALL_DAILY_BONUS; }
    this.data.credits += gain;
    this.data.stats.earned += gain;
    if (this.session) this.session.missions += gain;
    eventBus.emit(Events.UI_POPUP, { player: 0, text: `Задание выполнено · +${gain} ${CURRENCY}`, color: '#ffd400' });
    eventBus.emit('progress:mission', { text, gain, all });
  }

  // ---------------------------------------------------------------- race session
  beginRace(race) {
    this.session = race.demo ? null : {
      race, drift: 0, superDrift: 0, ultraDrift: 0, nearMiss: 0, overtake: 0, jump: 0, hit: 0, walls: 0, missions: 0,
    };
  }

  listen() {
    const mine = (car) => this.session && car?.human && this.session.race.cars.includes(car);
    eventBus.on(Events.CAR_DRIFT_LEVEL, ({ car, level }) => {
      if (!mine(car)) return;
      const s = this.session;
      if (level === 1) { s.drift++; this.bump('drifts'); }
      if (level === 2) { s.superDrift++; this.bump('superDrifts'); }
      if (level === 3) s.ultraDrift++;
    });
    eventBus.on(Events.CAR_NEARMISS, ({ car }) => { if (mine(car)) { this.session.nearMiss++; this.bump('nearMiss'); } });
    eventBus.on(Events.CAR_OVERTAKE, ({ car }) => { if (mine(car) && this.session.race.raceTime > 3) { this.session.overtake++; this.bump('overtakes'); } });
    eventBus.on(Events.CAR_LAND, ({ car, airTime }) => { if (mine(car) && airTime > 0.45) { this.session.jump++; this.bump('jumps'); } });
    eventBus.on(Events.ITEM_HIT, ({ car, by }) => { if (mine(by) && by !== car) { this.session.hit++; this.bump('hits'); } });
    eventBus.on(Events.CAR_WALL_HIT, ({ car, impact }) => { if (mine(car) && impact > 6 && !car.finished) this.session.walls++; });
    eventBus.on(Events.RACE_GO, () => {
      const s = this.session;
      if (!s) return;
      // launchResult is set right after RACE_GO in the same tick
      setTimeout(() => { if (this.session === s && s.race.humans.some((h) => h.launchResult === 'perfect')) { s.perfect = true; this.bump('perfect'); } }, 0);
    });
  }

  /** Called with the results table; returns the reward breakdown and pays it out. */
  finishRace(res) {
    const s = this.session;
    if (!s) return null;
    const st = this.gs.settings;
    const lines = [];
    const me = res.rows.find((r) => r.human && r.player === 0);
    const diff = DIFF_MULT[st.difficulty] ?? 1;
    if (res.mode === 'trial') {
      lines.push(['Заезд на время', 80]);
    } else if (me) {
      const bots = res.rows.filter((r) => !r.human).length;
      const base = PLACE_REWARD[Math.min(PLACE_REWARD.length, me.place) - 1] * (0.4 + 0.6 * Math.min(1, bots / 5)) * diff;
      lines.push([`${me.place}-е место`, Math.round(base / 5) * 5]);
    }
    const add = (label, n, per) => { if (n > 0) lines.push([`${label} ×${n}`, n * per]); };
    add('Дрифты', s.drift, BONUS.drift);
    add('Супер-дрифты', s.superDrift, BONUS.superDrift);
    add('Ультра-дрифты', s.ultraDrift, BONUS.ultraDrift);
    add('Обгоны вплотную', s.nearMiss, BONUS.nearMiss);
    add('Обгоны', s.overtake, BONUS.overtake);
    add('Прыжки', s.jump, BONUS.jump);
    add('Попадания', s.hit, BONUS.hit);
    if (s.perfect) lines.push(['Идеальный старт', BONUS.perfect]);
    const finished = me && !me.eliminated && me.time != null;
    const clean = finished && s.walls === 0;
    if (clean) lines.push(['Без ударов о стены', BONUS.cleanRace]);
    if (res.record) lines.push(['Новый рекорд трассы', BONUS.bestLap]);
    const earned = lines.reduce((a, l) => a + l[1], 0);
    this.data.credits += earned;
    this.data.stats.earned += earned;
    this.data.stats.races++;
    if (me?.place === 1 && res.mode !== 'trial') this.data.stats.wins++;
    // finish-based missions
    if (res.mode !== 'trial' && finished) {
      this.bump('races');
      if (me.place === 1) this.bump('win');
      const pod = this.data.daily.list.find((e) => e.id === 'podium');
      if (pod && me.place <= 3 && st.track === pod.track && st.mode !== 'gp') this.bump('podium');
      if (pod && me.place <= 3 && st.mode === 'gp' && TRACKS[pod.track]?.name === res.track) this.bump('podium');
      if (clean) this.bump('clean');
    }
    this.session = null;
    this.save();
    return { lines, earned, missions: s.missions, total: earned + s.missions, balance: this.data.credits };
  }
}
