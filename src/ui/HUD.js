import { eventBus, Events } from '../core/EventBus.js';
import { ITEM_ICONS, ITEM_NAMES } from './Icons.js';

const fmt = (t) => (t == null ? '—:——.——' : `${Math.floor(t / 60)}:${(t % 60).toFixed(2).padStart(5, '0')}`);
const hexCss = (n) => '#' + n.toString(16).padStart(6, '0');
const DRIFT_CSS = ['#ffffff', '#3ab8ff', '#ff9a1a', '#c04dff'];
const ITEM_KEYS = [['E'], ['/']];

/** Per-player HUD panes aligned with the render viewports, plus shared minimap. */
export class HUD {
  constructor() {
    this.root = document.getElementById('hud');
    this.divider = document.getElementById('divider');
    this.minimap = document.getElementById('minimap');
    this.mctx = this.minimap.getContext('2d');
    this.panes = [];
    this.outline = null;
    eventBus.on(Events.UI_POPUP, ({ player, text, color, big }) => this.popup(player, text, color, big));
    eventBus.on(Events.RACE_COUNTDOWN, ({ n }) => this.count(n));
  }

  setup(race, settings) {
    this.race = race;
    this.root.innerHTML = '';
    this.panes = [];
    const n = race.humans.length;
    const split = settings.split;
    for (let p = 0; p < n; p++) {
      const el = document.createElement('div');
      el.className = 'phud' + (n > 1 ? ' compact' : '');
      if (n === 1) Object.assign(el.style, { left: '0', top: '0', width: '100%', height: '100%' });
      else if (split === 'horizontal') Object.assign(el.style, { left: '0', top: p === 0 ? '0' : '50%', width: '100%', height: '50%' });
      else Object.assign(el.style, { left: p === 0 ? '0' : '50%', top: '0', width: '50%', height: '100%' });
      el.innerHTML = `
        <div class="speedlines"></div><div class="vignette"></div>
        <div class="h-tl"><div class="h-place"></div><div class="h-lap"></div></div>
        <div class="h-tr"></div>
        <div class="h-elim" hidden></div>
        <div class="h-center"></div>
        <div class="h-warn" hidden>НЕ ТУДА!</div>
        <div class="h-bl"><div class="slot"></div><div class="slot-l"></div></div>
        <div class="h-br">
          <div class="gauge">
            <svg viewBox="0 0 170 100"><path d="M10 95 A 80 80 0 0 1 160 70" stroke="rgba(255,255,255,0.12)" stroke-width="8" fill="none" stroke-linecap="round"/>
            <path class="arc" d="M10 95 A 80 80 0 0 1 160 70" stroke="url(#g${p})" stroke-width="8" fill="none" stroke-linecap="round" pathLength="100" stroke-dasharray="0 100"/>
            <defs><linearGradient id="g${p}" x1="0" x2="1"><stop offset="0" stop-color="#00e5ff"/><stop offset="0.7" stop-color="#ff2bd6"/><stop offset="1" stop-color="#ffd400"/></linearGradient></defs></svg>
            <div class="kmh">0</div><div class="unit">КМ/Ч</div>
          </div>
          <div class="meter drift-m" hidden><div class="ml"><span>ДРИФТ</span><span class="dl"></span></div><div class="mb"><i></i></div></div>
          <div class="meter nitro-m"><div class="ml"><span>НИТРО</span><span>${p === 0 ? 'L-SHIFT' : 'ENTER'}</span></div><div class="mb"><i></i></div></div>
        </div>
        <div class="h-count"></div>
        <div class="h-out" hidden><div>ВЫБЫЛ<small>СМОТРИ ЗА ЛИДЕРОМ</small></div></div>`;
      this.root.appendChild(el);
      const q = (s) => el.querySelector(s);
      this.panes.push({
        el, place: q('.h-place'), lap: q('.h-lap'), tr: q('.h-tr'), elim: q('.h-elim'), center: q('.h-center'), warn: q('.h-warn'),
        slot: q('.slot'), slotL: q('.slot-l'), arc: q('.arc'), kmh: q('.kmh'), drift: q('.drift-m'), driftBar: q('.drift-m i'), dl: q('.dl'),
        nitro: q('.nitro-m'), nitroBar: q('.nitro-m i'), count: q('.h-count'), out: q('.h-out'), lines: q('.speedlines'),
        last: {},
      });
    }
    this.divider.hidden = n < 2;
    if (n > 1) {
      if (split === 'horizontal') Object.assign(this.divider.style, { left: '0', right: '0', top: 'calc(50% - 2px)', height: '4px', width: 'auto', bottom: 'auto' });
      else Object.assign(this.divider.style, { top: '0', bottom: '0', left: 'calc(50% - 2px)', width: '4px', height: 'auto', right: 'auto' });
    }
    this.minimap.className = n > 1 ? (split === 'horizontal' ? 'split-h' : 'split-v') : '';
    this.outline = race.track.outline(220);
    this.root.hidden = false;
    this.minimap.hidden = false;
  }

  hide() {
    this.root.hidden = true;
    this.minimap.hidden = true;
    this.divider.hidden = true;
    this.root.innerHTML = '';
    this.panes = [];
  }

  popup(p, text, color, big) {
    const pane = this.panes[p];
    if (!pane) return;
    const d = document.createElement('div');
    d.className = 'popup' + (big ? ' big' : '');
    d.style.color = color;
    d.textContent = text;
    pane.center.appendChild(d);
    while (pane.center.children.length > 3) pane.center.firstChild.remove();
    setTimeout(() => d.remove(), 1300);
  }

  count(n) {
    for (const pane of this.panes) {
      pane.count.innerHTML = `<span class="${n === 0 ? 'go' : ''}">${n === 0 ? 'СТАРТ!' : n}</span>`;
      if (n === 0) setTimeout(() => { pane.count.innerHTML = ''; }, 900);
    }
  }

  update() {
    const race = this.race;
    if (!race) return;
    this.panes.forEach((pane, p) => {
      const h = race.hud(p);
      if (!h) return;
      const L = pane.last;
      const set = (key, el, html) => { if (L[key] !== html) { L[key] = html; el.innerHTML = html; } };
      const ord = h.place === 1 ? '' : '';
      set('place', pane.place, h.mode === 'trial' ? '' : `${h.place}${ord}<small>/${h.total}</small>`);
      set('lap', pane.lap, h.mode === 'elim' ? `ОСТАЛОСЬ ${h.total}` : `КРУГ ${h.lap}/${h.laps}`);
      let tr = `<div><span class="lbl">ВРЕМЯ</span><span class="big">${fmt(h.raceTime)}</span></div>
        <div><span class="lbl">КРУГ</span>${fmt(h.lapTime)}</div>
        <div><span class="lbl">ЛУЧШИЙ</span>${fmt(h.bestLap)}</div>`;
      if (h.record) tr += `<div><span class="lbl">РЕКОРД</span>${fmt(h.record)}</div>`;
      if (h.ghostDelta != null) tr += `<div class="h-delta ${h.ghostDelta <= 0 ? 'ahead' : 'behind'}">${h.ghostDelta <= 0 ? '−' : '+'}${Math.abs(h.ghostDelta).toFixed(2)}</div>`;
      set('tr', pane.tr, tr);
      if (h.elimTimer != null) {
        pane.elim.hidden = false;
        set('elim', pane.elim, `ВЫБЫВАНИЕ ЧЕРЕЗ<b>${Math.max(0, Math.ceil(h.elimTimer))}</b>`);
        pane.elim.classList.toggle('danger', h.danger);
      } else pane.elim.hidden = true;
      pane.warn.hidden = !h.wrongWay;
      pane.out.hidden = !h.eliminated;
      // item
      const itemKey = h.item || '';
      if (L.item !== itemKey) {
        L.item = itemKey;
        pane.slot.innerHTML = h.item ? ITEM_ICONS[h.item] : '';
        pane.slot.classList.toggle('has', !!h.item);
        pane.slotL.innerHTML = h.item ? `<b>${ITEM_NAMES[h.item]}</b><span>нажми <kbd>${ITEM_KEYS[p][0]}</kbd></span>` : '<span style="opacity:.6">БОНУС</span>';
      }
      // speed
      set('kmh', pane.kmh, String(h.kmh));
      pane.arc.setAttribute('stroke-dasharray', `${Math.min(100, h.speedFrac * 85).toFixed(1)} 100`);
      pane.nitroBar.style.width = `${h.nitro.toFixed(1)}%`;
      pane.nitro.classList.toggle('full', h.nitro > 99);
      pane.drift.hidden = !h.drifting;
      if (h.drifting) {
        const t = Math.min(1, h.driftTime / 3);
        pane.driftBar.style.width = `${t * 100}%`;
        pane.driftBar.style.background = DRIFT_CSS[h.driftLevel];
        pane.driftBar.style.boxShadow = `0 0 12px ${DRIFT_CSS[h.driftLevel]}`;
        set('dl', pane.dl, ['', 'I', 'II', 'III'][h.driftLevel]);
      }
      pane.lines.style.opacity = String(Math.max(0, (h.speedFrac - 0.75) * 1.6) + (h.boosting ? 0.45 : 0));
      pane.el.classList.toggle('boost', h.boosting && !h.nitroActive);
      pane.el.classList.toggle('nitro', h.nitroActive);
      pane.el.classList.toggle('emp', h.empTime > 0);
    });
    this.drawMinimap();
  }

  drawMinimap() {
    const o = this.outline;
    if (!o) return;
    const g = this.mctx, W = this.minimap.width, H = this.minimap.height;
    g.clearRect(0, 0, W, H);
    const k = Math.min((W - 24) / (o.maxX - o.minX), (H - 24) / (o.maxZ - o.minZ));
    const ox = (W - (o.maxX - o.minX) * k) / 2, oz = (H - (o.maxZ - o.minZ) * k) / 2;
    const P = (x, z) => [ox + (o.maxX - x) * k, oz + (o.maxZ - z) * k];
    g.beginPath();
    o.pts.forEach(([x, z], i) => { const [a, b] = P(x, z); i ? g.lineTo(a, b) : g.moveTo(a, b); });
    g.closePath();
    g.lineJoin = 'round';
    g.strokeStyle = 'rgba(10,6,20,0.75)';
    g.lineWidth = 9;
    g.stroke();
    g.strokeStyle = 'rgba(255,255,255,0.75)';
    g.lineWidth = 3;
    g.stroke();
    const [sx, sy] = P(o.pts[0][0], o.pts[0][1]);
    g.fillStyle = '#ffffff';
    g.fillRect(sx - 4, sy - 4, 8, 8);
    const cars = this.race.minimap();
    for (const c of cars) {
      if (c.elim || c.human) continue;
      const [x, y] = P(c.x, c.z);
      g.fillStyle = hexCss(c.color);
      g.beginPath(); g.arc(x, y, 3.5, 0, Math.PI * 2); g.fill();
    }
    for (const c of cars) {
      if (c.elim || !c.human) continue;
      const [x, y] = P(c.x, c.z);
      g.fillStyle = hexCss(c.color);
      g.strokeStyle = '#fff';
      g.lineWidth = 2;
      g.beginPath(); g.arc(x, y, 6, 0, Math.PI * 2); g.fill(); g.stroke();
      if (cars.filter((q) => q.human).length > 1) {
        g.fillStyle = '#fff';
        g.font = '700 10px "JetBrains Mono", monospace';
        g.fillText(`P${c.player + 1}`, x + 8, y - 6);
      }
    }
  }
}
