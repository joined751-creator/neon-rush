import { eventBus, Events } from '../core/EventBus.js';
import { MODES, DIFFICULTY, CAR_TYPES, CAR_COLORS } from '../core/Constants.js';
import { TRACKS } from '../level/TrackDefs.js';
import { Track } from '../level/Track.js';
import { MODE_ICONS, UI_ICONS } from './Icons.js';
import { runSplash } from './Splash.js';
import { drawTrackThumb, accentFor } from './TrackThumbs.js';

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const fmt = (t) => (t == null ? '—' : `${Math.floor(t / 60)}:${(t % 60).toFixed(2).padStart(5, '0')}`);
const hexCss = (n) => '#' + n.toString(16).padStart(6, '0');
const CAR_META = {
  comet: { cls: 'A', tag: 'Гран-туризмо' },
  viper: { cls: 'S', tag: 'Гиперкар' },
  titan: { cls: 'B', tag: 'Маслкар V8' },
  spark: { cls: 'B', tag: 'Хот-хэтч' },
};
const MEDAL = ['gold', 'silver', 'bronze'];
const segBar = (v) => {
  const n = Math.round(Math.max(0, Math.min(1, v)) * 10);
  let h = '';
  for (let i = 0; i < 10; i++) h += `<i class="${i < n ? 'f' : ''}"></i>`;
  return h;
};

/** DOM menus: title, setup, garage, controls, settings, pause, results. */
export class Menus {
  constructor(gameState) {
    this.gs = gameState;
    this.current = 'title';
    this.back = 'title';
    const tracks = TRACKS.map((def) => new Track(def));
    this.trackOutlines = tracks.map((t) => t.outline(160));
    this.trackLengths = tracks.map((t) => t.length);
    runSplash();

    document.addEventListener('click', (e) => {
      const b = e.target.closest('[data-action]');
      if (!b) return;
      eventBus.emit(Events.UI_CLICK);
      this.action(b.dataset.action);
    });
    document.addEventListener('mouseover', (e) => {
      const b = e.target.closest('.mbtn, .card, .btn');
      if (b && b !== this.lastHover) { this.lastHover = b; eventBus.emit(Events.UI_HOVER); }
    });
    $('#mute').addEventListener('click', () => { eventBus.emit(Events.AUDIO_TOGGLE); this.syncMute(); });
    $('#pause-btn').addEventListener('pointerdown', (e) => { e.preventDefault(); eventBus.emit(Events.UI_ACTION, { action: 'pause' }); });
    this.syncMute();
    this.setupGarageSwipe();
  }

  syncMute() { $('#mute').classList.toggle('off', !!this.gs.settings.muted); }

  show(name) {
    this.current = name;
    for (const s of $$('.screen')) s.hidden = s.id !== `screen-${name}`;
    if (name === 'setup') this.renderSetup();
    if (name === 'garage') this.renderGarage();
    if (name === 'settings') this.renderSettings();
    const first = $(`#screen-${name} .mbtn`);
    $$('.mbtn.sel').forEach((b) => b.classList.remove('sel'));
    if (first && name !== 'race') first.classList.add('sel');
  }

  hideAll() { this.current = 'race'; for (const s of $$('.screen')) s.hidden = true; }

  action(a) {
    const s = this.gs.settings;
    switch (a) {
      case 'play': this.show('setup'); break;
      case 'quick2':
        s.players = 2; s.mode = 'race'; s.bots = Math.max(s.bots, 3);
        this.gs.saveSettings();
        this.show('garage');
        eventBus.emit(Events.UI_ACTION, { action: 'garage' });
        break;
      case 'controls': this.back = this.current; this.show('controls'); break;
      case 'settings': this.back = this.current; this.show('settings'); break;
      case 'garage': this.gs.saveSettings(); this.show('garage'); eventBus.emit(Events.UI_ACTION, { action: 'garage' }); break;
      case 'back':
        if (this.current === 'garage') { this.show('setup'); eventBus.emit(Events.UI_ACTION, { action: 'menu' }); }
        else if (this.current === 'setup') this.show('title');
        else this.show(this.back || 'title');
        break;
      default: eventBus.emit(Events.UI_ACTION, { action: a });
    }
  }

  /** Arrow/Enter navigation inside the current screen. */
  key(e) {
    const scr = $(`#screen-${this.current}`);
    if (!scr || scr.hidden) return false;
    if (this.current === 'garage') return this.garageKey(e);
    const items = $$('.mbtn', scr).filter((b) => !b.hidden);
    const idx = items.findIndex((b) => b.classList.contains('sel'));
    if (e.code === 'ArrowDown' || e.code === 'KeyS') { this.sel(items, idx + 1); return true; }
    if (e.code === 'ArrowUp' || e.code === 'KeyW') { this.sel(items, idx - 1); return true; }
    if (e.code === 'Enter' || e.code === 'Space') {
      if (items[idx]) { items[idx].click(); return true; }
      if (this.current === 'setup') { this.action('garage'); return true; }
      const primary = $('.btn.primary', scr);
      if (primary) { primary.click(); return true; }
    }
    if (e.code === 'Escape' && ['setup', 'controls', 'settings'].includes(this.current)) { this.action('back'); return true; }
    return false;
  }

  sel(items, i) {
    if (!items.length) return;
    const n = (i + items.length) % items.length;
    items.forEach((b, k) => b.classList.toggle('sel', k === n));
    eventBus.emit(Events.UI_HOVER);
  }

  // ---------------------------------------------------------------- setup
  renderSetup() {
    const s = this.gs.settings;
    if (s.mode === 'trial') s.bots = s.bots; // bots ignored in trial
    const modeBox = $('#opt-mode');
    modeBox.innerHTML = '';
    for (const m of MODES) {
      const c = document.createElement('button');
      c.className = 'card mode-card' + (s.mode === m.id ? ' on' : '');
      c.innerHTML = `<span class="card-ico">${MODE_ICONS[m.id] || ''}</span><span class="card-t">${m.name}</span><span class="card-d">${m.desc}</span>`;
      c.onclick = () => { s.mode = m.id; eventBus.emit(Events.UI_CLICK); this.renderSetup(); };
      modeBox.appendChild(c);
    }
    const trackBox = $('#opt-track');
    trackBox.innerHTML = '';
    TRACKS.forEach((t, i) => {
      const c = document.createElement('button');
      const on = s.mode === 'gp' || s.track === i;
      c.className = 'card track-card' + (s.mode === 'gp' ? ' on gp' : s.track === i ? ' on' : '');
      const acc = accentFor(t.theme);
      c.style.setProperty('--acc', acc.a);
      c.style.setProperty('--acc2', acc.b);
      const rec = this.gs.records[`${i}${s.mirror ? 'm' : ''}`];
      const km = (this.trackLengths[i] / 1000).toFixed(1).replace('.', ',');
      c.innerHTML = `<span class="tc-top"><span class="tc-n">${String(i + 1).padStart(2, '0')}</span><span class="tc-theme">${acc.label}</span><span class="tc-len">${km} км</span></span>
        <canvas width="240" height="96"></canvas><span class="card-t">${t.name}</span><span class="card-d">${t.desc}</span>
        <span class="rec${rec?.bestLap ? '' : ' none'}">${rec?.bestLap ? UI_ICONS.star + 'Рекорд ' + fmt(rec.bestLap) : 'Рекорда нет'}</span>`;
      c.onclick = () => { if (s.mode === 'gp') return; s.track = i; eventBus.emit(Events.UI_CLICK); this.renderSetup(); };
      if (s.mode === 'gp') c.querySelector('.card-t').insertAdjacentHTML('afterbegin', `<span class="stage">ЭТАП ${i + 1}</span>`);
      trackBox.appendChild(c);
      drawTrackThumb($('canvas', c), this.trackOutlines[i], acc, on, s.mirror && s.mode !== 'gp');
    });
    this.seg('#opt-players', [[1, '1 игрок'], [2, '2 игрока']], s.players, (v) => { s.players = v; });
    this.stepper('#opt-laps', s.laps, 1, 7, (v) => { s.laps = v; }, s.mode === 'elim');
    this.stepper('#opt-bots', s.bots, 0, 7, (v) => { s.bots = v; }, s.mode === 'trial');
    this.seg('#opt-diff', DIFFICULTY.map((d, i) => [i, d.name]), s.difficulty, (v) => { s.difficulty = v; });
    this.seg('#opt-items', [[true, 'Вкл'], [false, 'Выкл']], s.items, (v) => { s.items = v; });
    this.seg('#opt-mirror', [[false, 'Прямое'], [true, 'Обратное']], s.mirror, (v) => { s.mirror = v; });
    $('#opt-mirror').classList.toggle('disabled', s.mode === 'gp');
    const m = MODES.find((x) => x.id === s.mode);
    const total = s.mode === 'trial' ? s.players : s.players + s.bots;
    $('#setup-summary').textContent = `${m.name} · ${s.mode === 'gp' ? 'все 4 трассы' : TRACKS[s.track].name} · ${total} ${total === 1 ? 'машина' : total < 5 ? 'машины' : 'машин'}`;
  }

  seg(sel, opts, value, set) {
    const box = $(sel);
    box.innerHTML = '';
    for (const [v, label] of opts) {
      const b = document.createElement('button');
      b.textContent = label;
      if (v === value) b.className = 'on';
      b.onclick = () => { set(v); eventBus.emit(Events.UI_CLICK); this.gs.saveSettings(); this.current === 'settings' ? this.renderSettings() : this.renderSetup(); };
      box.appendChild(b);
    }
  }

  stepper(sel, value, min, max, set, disabled = false) {
    const box = $(sel);
    box.className = 'stepper' + (disabled ? ' disabled' : '');
    box.innerHTML = '<button aria-label="Меньше">−</button><output></output><button aria-label="Больше">+</button>';
    $('output', box).textContent = disabled ? '—' : value;
    const [minus, , plus] = box.children;
    minus.onclick = () => { set(Math.max(min, value - 1)); eventBus.emit(Events.UI_CLICK); this.renderSetup(); };
    plus.onclick = () => { set(Math.min(max, value + 1)); eventBus.emit(Events.UI_CLICK); this.renderSetup(); };
  }

  // ---------------------------------------------------------------- garage
  renderGarage() {
    const box = $('#garage-players');
    const n = this.gs.settings.players;
    box.innerHTML = '';
    for (let p = 0; p < n; p++) {
      const el = document.createElement('div');
      el.className = 'gp';
      el.dataset.p = p;
      box.appendChild(el);
      this.renderGP(p);
    }
  }

  renderGP(p) {
    const el = $(`.gp[data-p="${p}"]`);
    if (!el) return;
    const g = this.gs.garage[p];
    const t = CAR_TYPES[g.type];
    const other = this.gs.settings.players > 1 ? this.gs.garage[1 - p].color : -1;
    const meta = CAR_META[t.id] || { cls: 'A', tag: '' };
    const col = hexCss(CAR_COLORS[g.color].hex);
    el.style.setProperty('--pc', col);
    const keys = `<span class="kbd-only">${p === 0 ? '<kbd>A</kbd><kbd>D</kbd> машина <kbd>W</kbd><kbd>S</kbd> цвет' : '<kbd>←</kbd><kbd>→</kbd> машина <kbd>↑</kbd><kbd>↓</kbd> цвет'}</span>`;
    const stat = (label, v) => `<span class="st-l">${label}</span><span class="segbar">${segBar(v)}</span><b class="st-v">${Math.round(v * 100)}</b>`;
    el.innerHTML = `
      <div class="gp-head"><span class="gp-tag"><i></i>Игрок ${p + 1}</span><span class="gp-keys">${keys}</span></div>
      <div class="gp-car">
        <button data-d="-1" aria-label="Предыдущая">${UI_ICONS.chevL}</button>
        <div class="gp-id">
          <span class="gp-meta"><b class="gp-cls">${meta.cls}</b><span>${meta.tag}</span><span class="gp-idx">${String(g.type + 1).padStart(2, '0')} / ${String(CAR_TYPES.length).padStart(2, '0')}</span></span>
          <div class="gp-name">${t.name}</div>
        </div>
        <button data-d="1" aria-label="Следующая">${UI_ICONS.chevR}</button>
      </div>
      <div class="gp-desc">${t.desc}</div>
      <div class="stats">
        ${stat('Скорость', t.speed)}${stat('Разгон', t.accel)}${stat('Управление', t.handling)}${stat('Масса', t.weight / 1.5)}
      </div>
      <div class="gp-colhead"><span>Цвет</span><b>${CAR_COLORS[g.color].name}</b></div>
      <div class="swatches">${CAR_COLORS.map((c, i) => `<button class="sw${i === g.color ? ' on' : ''}${i === other ? ' taken' : ''}" data-c="${i}" title="${c.name}" aria-label="${c.name}" style="--sw:${hexCss(c.hex)}"></button>`).join('')}</div>`;
    $$('.gp-car button', el).forEach((b) => { b.onclick = () => this.changeCar(p, +b.dataset.d); });
    $$('.sw', el).forEach((b) => { b.onclick = () => this.setColor(p, +b.dataset.c); });
  }

  /** Swipe left/right over the showroom to flip through cars (per half in two-player mode). */
  setupGarageSwipe() {
    const scr = $('#screen-garage');
    let sx = null, sy = 0, side = 0;
    scr.addEventListener('pointerdown', (e) => {
      if (e.target.closest('.gp, button')) return;
      sx = e.clientX; sy = e.clientY;
      side = this.gs.settings.players > 1 && e.clientX > window.innerWidth / 2 ? 1 : 0;
    });
    scr.addEventListener('pointerup', (e) => {
      if (sx === null) return;
      const dx = e.clientX - sx, dy = e.clientY - sy;
      sx = null;
      if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy) * 1.3) this.changeCar(side, dx < 0 ? 1 : -1);
    });
  }

  changeCar(p, d) {
    const g = this.gs.garage[p];
    g.type = (g.type + d + CAR_TYPES.length) % CAR_TYPES.length;
    this.afterGarage(p);
  }

  cycleColor(p, d) {
    const g = this.gs.garage[p];
    const other = this.gs.settings.players > 1 ? this.gs.garage[1 - p].color : -1;
    let c = g.color;
    do { c = (c + d + CAR_COLORS.length) % CAR_COLORS.length; } while (c === other);
    this.setColor(p, c);
  }

  setColor(p, c) { this.gs.garage[p].color = c; this.afterGarage(p); }

  afterGarage(p) {
    eventBus.emit(Events.UI_CLICK);
    this.gs.saveSettings();
    this.renderGarage();
    eventBus.emit(Events.GARAGE_CHANGED, { p });
  }

  garageKey(e) {
    const two = this.gs.settings.players > 1;
    const map = {
      KeyA: [0, 'car', -1], KeyD: [0, 'car', 1], KeyW: [0, 'col', -1], KeyS: [0, 'col', 1],
      ArrowLeft: [two ? 1 : 0, 'car', -1], ArrowRight: [two ? 1 : 0, 'car', 1], ArrowUp: [two ? 1 : 0, 'col', -1], ArrowDown: [two ? 1 : 0, 'col', 1],
    };
    const m = map[e.code];
    if (m) { m[1] === 'car' ? this.changeCar(m[0], m[2]) : this.cycleColor(m[0], m[2]); return true; }
    if (e.code === 'Enter' || e.code === 'NumpadEnter') { eventBus.emit(Events.UI_ACTION, { action: 'start' }); return true; }
    if (e.code === 'Escape') { this.action('back'); return true; }
    return false;
  }

  // ---------------------------------------------------------------- settings
  renderSettings() {
    const s = this.gs.settings;
    this.seg('#opt-quality', [['low', 'Низкая'], ['medium', 'Средняя'], ['high', 'Высокая']], s.quality, (v) => { s.quality = v; eventBus.emit(Events.UI_ACTION, { action: 'quality' }); });
    this.seg('#opt-split', [['vertical', 'Слева / справа'], ['horizontal', 'Сверху / снизу']], s.split, (v) => { s.split = v; });
    this.seg('#opt-sound', [[false, 'Вкл'], [true, 'Выкл']], s.muted, (v) => { if (v !== s.muted) eventBus.emit(Events.AUDIO_TOGGLE); this.syncMute(); });
    this.seg('#opt-steer', [['swipe', 'Джойстик'], ['buttons', 'Стрелки'], ['tilt', 'Наклон']], s.steering || 'swipe', (v) => {
      s.steering = v;
      if (v === 'tilt') eventBus.emit(Events.UI_ACTION, { action: 'tiltPermission' });
    });
    this.seg('#opt-gas', [[false, 'Ручной'], [true, 'Авто']], s.autoGas === true, (v) => { s.autoGas = v; });
    $('#opt-gas').classList.toggle('disabled', s.steering === 'buttons'); // arrows scheme always has auto-gas
    this.seg('#opt-haptics', [[true, 'Вкл'], [false, 'Выкл']], s.haptics !== false, (v) => { s.haptics = v; if (v && navigator.vibrate) try { navigator.vibrate(40); } catch { /* */ } });
    const box = $('#opt-reset');
    box.innerHTML = '';
    const b = document.createElement('button');
    b.textContent = this.confirmReset ? 'Точно стереть?' : 'Сбросить рекорды';
    b.onclick = () => {
      if (!this.confirmReset) { this.confirmReset = true; this.renderSettings(); return; }
      this.gs.records = {}; this.gs.ghosts = {}; this.gs.saveRecords(); this.gs.saveGhost('_', null);
      this.confirmReset = false; b.textContent = 'Стёрто';
    };
    box.appendChild(b);
  }

  // ---------------------------------------------------------------- results
  showResults(res, humans, gp = null) {
    const me = res.rows.find((r) => r.human && r.player === 0);
    const isElim = res.mode === 'elim';
    const win = me && me.place === 1 && res.mode !== 'trial';
    let title = res.mode === 'trial' ? 'Заезд на время' : me ? (me.place === 1 ? 'Победа!' : `${me.place}-е место`) : 'Финиш';
    let kicker = res.mode === 'trial' ? 'Тренировка' : isElim ? 'Выбывание · итог' : 'Финиш';
    if (gp?.last) { title = gp.standings[0].human ? 'Чемпион!' : `Чемпион: ${gp.standings[0].name}`; kicker = 'Гран-при завершён'; }
    else if (gp) kicker = `Гран-при · этап ${gp.round}/${gp.total}`;
    const scr = $('#screen-results');
    scr.classList.toggle('win', !!(win || (gp?.last && gp.standings[0].human)));
    scr.classList.toggle('has-gp', !!gp);
    $('#results-kicker').textContent = kicker;
    $('#results-title').textContent = title;
    const recBadge = res.record ? `<span class="rec-badge">${UI_ICONS.star}Новый рекорд</span>` : '';
    $('#results-sub').innerHTML = `${res.track}${res.mirror ? ' · обратное' : ''}${recBadge}`;
    const bestAll = Math.min(...res.rows.map((r) => r.best ?? Infinity));
    // hero: player's place + times
    const hero = $('#results-hero');
    if (me) {
      const medal = me.place <= 3 && res.mode !== 'trial' ? MEDAL[me.place - 1] : '';
      hero.hidden = false;
      hero.className = 'res-hero ' + medal;
      hero.innerHTML = `
        <span class="rh-l">${res.mode === 'trial' ? 'Лучший круг' : 'Твоё место'}</span>
        ${res.mode === 'trial' ? `<span class="rh-time">${fmt(me.best)}</span>` : `<span class="rh-place"><b>${me.place}</b><small>/${res.rows.length}</small></span>`}
        <div class="rh-stats">
          ${res.mode !== 'trial' ? `<div><span>${isElim ? 'Итог' : 'Время'}</span><b>${isElim ? (me.eliminated ? 'выбыл' : 'выжил') : me.time ? fmt(me.time) : '—'}</b></div>` : ''}
          <div><span>Лучший круг</span><b>${fmt(me.best)}</b></div>
          <div><span>Машина</span><b>${me.car}</b></div>
        </div>`;
    } else hero.hidden = true;
    const rows = res.rows.map((r, i) => `
      <tr class="${r.human ? 'me' : ''} ${r.place <= 3 && res.mode !== 'trial' ? 'pod ' + MEDAL[r.place - 1] : ''}" style="--i:${i}">
        <td class="pl"><span>${r.place}</span></td>
        <td class="nm"><span class="dot" style="color:${hexCss(r.color)}"></span>${r.name}${r.human && humans > 1 ? ` <span class="muted">P${r.player + 1}</span>` : ''}</td>
        <td class="muted car">${r.car}</td>
        <td class="t">${isElim ? (r.eliminated ? '<span class="muted">выбыл</span>' : '<span class="ok">выжил</span>') : (r.time ? fmt(r.time) + (r.estimated ? ' <span class="muted">≈</span>' : '') : '—')}</td>
        <td class="t bl${r.best != null && r.best === bestAll ? ' fastest' : ''}">${r.best ? fmt(r.best) : '—'}</td>
      </tr>`).join('');
    $('#results-table').innerHTML = `<thead><tr><th>#</th><th>Пилот</th><th class="car">Машина</th><th>${isElim ? 'Итог' : 'Время'}</th><th>Лучший круг</th></tr></thead><tbody>${rows}</tbody>`;
    const gpBox = $('#results-gp');
    const primary = $('#screen-results .btn.primary');
    const secondary = $('#results-retry');
    if (gp) {
      $('#results-sub').innerHTML = `${res.track}${recBadge}`;
      gpBox.hidden = false;
      gpBox.innerHTML = `<h3>Зачёт чемпионата <span>${gp.round}/${gp.total}</span></h3><table class="standings">${gp.standings.map((r, i) => `
        <tr class="${r.human ? 'me' : ''} ${i < 3 ? 'pod ' + MEDAL[i] : ''}" style="--i:${i + 2}"><td class="pl"><span>${i + 1}</span></td><td class="nm"><span class="dot" style="color:${hexCss(r.color ?? 0xffffff)}"></span>${r.name}</td>
        <td class="t pts">${r.pts}</td><td class="t gain">+${r.gained}</td></tr>`).join('')}</table>`;
      primary.dataset.action = 'nextRound';
      primary.textContent = gp.last ? 'Новый чемпионат' : `Этап ${gp.round + 1}/${gp.total} →`;
      secondary.hidden = gp.last;
    } else {
      gpBox.hidden = true;
      primary.dataset.action = 'restart';
      primary.textContent = 'Ещё заезд';
      secondary.hidden = true;
    }
    this.show('results');
  }
}
