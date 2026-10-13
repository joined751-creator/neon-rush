import { eventBus, Events } from '../core/EventBus.js';
import { MODES, DIFFICULTY, CAR_TYPES, CAR_COLORS } from '../core/Constants.js';
import { TRACKS } from '../level/TrackDefs.js';
import { Track } from '../level/Track.js';

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const fmt = (t) => (t == null ? '—' : `${Math.floor(t / 60)}:${(t % 60).toFixed(2).padStart(5, '0')}`);
const hexCss = (n) => '#' + n.toString(16).padStart(6, '0');

/** DOM menus: title, setup, garage, controls, settings, pause, results. */
export class Menus {
  constructor(gameState) {
    this.gs = gameState;
    this.current = 'title';
    this.back = 'title';
    this.trackOutlines = TRACKS.map((def) => new Track(def).outline(160));

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
    $('#pause-btn').addEventListener('click', () => eventBus.emit(Events.UI_ACTION, { action: 'pause' }));
    this.syncMute();
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
    const items = $$('.mbtn', scr);
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
      c.className = 'card' + (s.mode === m.id ? ' on' : '');
      c.innerHTML = `<span class="card-t">${m.name}</span><span class="card-d">${m.desc}</span>`;
      c.onclick = () => { s.mode = m.id; eventBus.emit(Events.UI_CLICK); this.renderSetup(); };
      modeBox.appendChild(c);
    }
    const trackBox = $('#opt-track');
    trackBox.innerHTML = '';
    TRACKS.forEach((t, i) => {
      const c = document.createElement('button');
      c.className = 'card' + (s.mode === 'gp' ? ' on gp' : s.track === i ? ' on' : '');
      const rec = this.gs.records[`${i}${s.mirror ? 'm' : ''}`];
      c.innerHTML = `<canvas width="240" height="100"></canvas><span class="card-t">${t.name}</span><span class="card-d">${t.desc}</span><span class="rec">${rec?.bestLap ? 'Рекорд круга ' + fmt(rec.bestLap) : '&nbsp;'}</span>`;
      c.onclick = () => { if (s.mode === 'gp') return; s.track = i; eventBus.emit(Events.UI_CLICK); this.renderSetup(); };
      if (s.mode === 'gp') c.querySelector('.card-t').insertAdjacentHTML('afterbegin', `<span class="stage">ЭТАП ${i + 1}</span>`);
      trackBox.appendChild(c);
      this.drawOutline($('canvas', c), this.trackOutlines[i], s.mode === 'gp' || s.track === i, s.mirror && s.mode !== 'gp');
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

  drawOutline(cv, o, on, mirror) {
    const g = cv.getContext('2d');
    const W = cv.width, H = cv.height;
    g.clearRect(0, 0, W, H);
    const sx = (W - 20) / (o.maxX - o.minX), sz = (H - 16) / (o.maxZ - o.minZ);
    const k = Math.min(sx, sz);
    const ox = (W - (o.maxX - o.minX) * k) / 2, oz = (H - (o.maxZ - o.minZ) * k) / 2;
    const P = ([x, z]) => [ox + (o.maxX - x) * k, oz + (o.maxZ - z) * k];
    g.lineJoin = 'round';
    g.beginPath();
    o.pts.forEach((p, i) => { const [x, y] = P(p); i ? g.lineTo(x, y) : g.moveTo(x, y); });
    g.closePath();
    g.strokeStyle = on ? '#00e5ff' : 'rgba(255,255,255,0.45)';
    g.lineWidth = 4;
    g.shadowColor = on ? '#00e5ff' : 'transparent';
    g.shadowBlur = 10;
    g.stroke();
    const [sx0, sy0] = P(o.pts[0]);
    const [sx1, sy1] = P(o.pts[mirror ? o.pts.length - 3 : 3]);
    g.shadowBlur = 0;
    g.fillStyle = '#ff2bd6';
    g.beginPath(); g.arc(sx0, sy0, 5, 0, Math.PI * 2); g.fill();
    // direction arrow
    const a = Math.atan2(sy1 - sy0, sx1 - sx0);
    g.save(); g.translate(sx0, sy0); g.rotate(a);
    g.beginPath(); g.moveTo(16, 0); g.lineTo(9, -5); g.lineTo(9, 5); g.closePath(); g.fill();
    g.restore();
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
    const keys = p === 0 ? '<kbd>A</kbd><kbd>D</kbd> машина · <kbd>W</kbd><kbd>S</kbd> цвет' : '<kbd>←</kbd><kbd>→</kbd> машина · <kbd>↑</kbd><kbd>↓</kbd> цвет';
    el.innerHTML = `
      <div class="gp-head"><span class="gp-tag" style="color:${hexCss(CAR_COLORS[g.color].hex)}">ИГРОК ${p + 1}</span><span class="gp-keys">${keys}</span></div>
      <div class="gp-car"><button data-d="-1" aria-label="Предыдущая">◀</button><div class="gp-name">${t.name}</div><button data-d="1" aria-label="Следующая">▶</button></div>
      <div class="gp-desc">${t.desc}</div>
      <div class="stats">
        <span>Скорость</span><div class="bar"><i style="width:${t.speed * 100}%"></i></div>
        <span>Разгон</span><div class="bar"><i style="width:${t.accel * 100}%"></i></div>
        <span>Управление</span><div class="bar"><i style="width:${t.handling * 100}%"></i></div>
        <span>Масса</span><div class="bar"><i style="width:${(t.weight / 1.5) * 100}%"></i></div>
      </div>
      <div class="swatches">${CAR_COLORS.map((c, i) => `<button class="sw${i === g.color ? ' on' : ''}${i === other ? ' taken' : ''}" data-c="${i}" title="${c.name}" style="background:${hexCss(c.hex)};color:${hexCss(c.hex)}"></button>`).join('')}</div>`;
    $$('.gp-car button', el).forEach((b) => { b.onclick = () => this.changeCar(p, +b.dataset.d); });
    $$('.sw', el).forEach((b) => { b.onclick = () => this.setColor(p, +b.dataset.c); });
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
    let title = res.mode === 'trial' ? 'Заезд на время' : me ? (me.place === 1 ? 'Победа!' : `${me.place} место`) : 'Финиш';
    if (gp?.last) title = gp.standings[0].human ? 'Чемпион!' : `Чемпион: ${gp.standings[0].name}`;
    $('#results-title').textContent = title;
    $('#results-sub').innerHTML = `${res.track}${res.mirror ? ' · обратное' : ''}${res.record ? '<span class="rec-badge">НОВЫЙ РЕКОРД</span>' : ''}`;
    const isElim = res.mode === 'elim';
    const rows = res.rows.map((r) => `
      <tr class="${r.human ? 'me' : ''}">
        <td class="pl">${r.place}</td>
        <td><span class="dot" style="color:${hexCss(r.color)}"></span>${r.name}${r.human && humans > 1 ? ` <span class="muted">P${r.player + 1}</span>` : ''}</td>
        <td class="muted">${r.car}</td>
        <td class="t">${isElim ? (r.eliminated ? '<span class="muted">выбыл</span>' : 'выжил') : (r.time ? fmt(r.time) + (r.estimated ? ' <span class="muted">≈</span>' : '') : '—')}</td>
        <td class="t muted">${r.best ? fmt(r.best) : '—'}</td>
      </tr>`).join('');
    $('#results-table').innerHTML = `<thead><tr><th>#</th><th>Пилот</th><th>Машина</th><th>${isElim ? 'Итог' : 'Время'}</th><th>Лучший круг</th></tr></thead><tbody>${rows}</tbody>`;
    const gpBox = $('#results-gp');
    const primary = $('#screen-results .btn.primary');
    const secondary = $('#results-retry');
    if (gp) {
      $('#results-sub').innerHTML = `Гран-при · этап ${gp.round}/${gp.total} · ${res.track}${res.record ? '<span class="rec-badge">НОВЫЙ РЕКОРД</span>' : ''}`;
      gpBox.hidden = false;
      gpBox.innerHTML = `<h3>Зачёт чемпионата</h3><table class="standings">${gp.standings.map((r, i) => `
        <tr class="${r.human ? 'me' : ''}"><td class="pl">${i + 1}</td><td><span class="dot" style="color:${hexCss(r.color ?? 0xffffff)}"></span>${r.name}</td>
        <td class="t">${r.pts}</td><td class="t gain">+${r.gained}</td></tr>`).join('')}</table>`;
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
